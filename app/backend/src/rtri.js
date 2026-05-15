// rtri.js — Adapter para o Registo de Transparência da Representação de
// Interesses (RTRI) da Assembleia da República.
//
// Dois modos (config.rtri.mode):
//   • mock — pesquisa sobre a cache local `entidade_rtri` (desenvolvimento e
//            fallback de degradação graciosa enquanto não há protocolo com a AR)
//   • http — consulta a API real da AR (a ativar quando o protocolo existir)
//
// O modo `http` mantém sempre a cache local atualizada, para que uma falha
// transitória da API da AR não bloqueie a operação (RCM v2, n.º 10.3).

import crypto from 'node:crypto';
import { db } from './db.js';
import config from './config.js';
import { incCounter } from './metrics.js';

// ---------- Cache local (comum aos dois modos) ----------
export async function pesquisarRtri(q, limit = 10) {
  if (!q || q.length < 2) return [];
  const like = `%${q}%`;
  return db.all(
    `SELECT rtri_id, designacao, natureza_juridica, ativo, data_inscricao
     FROM entidade_rtri
     WHERE ativo = 1 AND (designacao LIKE ? OR rtri_id LIKE ?)
     ORDER BY designacao LIMIT ?`,
    [like, like, limit]
  );
}

export async function obterEntidade(rtriId) {
  // modo http: tenta a API live primeiro; se falhar, cai para a cache
  if (config.rtri.mode === 'http') {
    try {
      const live = await consultarApiAr(rtriId);
      if (live) { await upsertCache(live); return live; }
    } catch (e) {
      console.warn('[rtri] API da AR indisponível, a usar cache local:', e.message);
    }
  }
  return db.get('SELECT * FROM entidade_rtri WHERE rtri_id = ?', [rtriId]);
}

export async function listarTodas(limit = 200) {
  return db.all('SELECT * FROM entidade_rtri WHERE ativo = 1 ORDER BY designacao LIMIT ?', [limit]);
}

// Valida um identificador no momento de registar uma interação do Bloco D.
// Devolve { status: 'VALIDADO' | 'PENDENTE' | 'INVALIDO' | 'NAO_APLICAVEL' }
export async function validarIdentificador(rtriId, naturezaJuridica) {
  if (naturezaJuridica !== 'RTRI_INSCRITO' && naturezaJuridica !== 'RTRI_FORCA_LEI') {
    return { status: 'NAO_APLICAVEL' };
  }
  if (!rtriId) return { status: 'PENDENTE' };
  const ent = await obterEntidade(rtriId);
  if (!ent) return { status: 'PENDENTE' }; // não bloqueia — fica para reconciliação
  return { status: ent.ativo ? 'VALIDADO' : 'INVALIDO' };
}

async function upsertCache(ent) {
  const ex = await db.get('SELECT rtri_id FROM entidade_rtri WHERE rtri_id = ?', [ent.rtri_id]);
  if (ex) {
    await db.run(
      'UPDATE entidade_rtri SET designacao = ?, natureza_juridica = ?, ativo = ?, ultima_sincronizacao = ? WHERE rtri_id = ?',
      [ent.designacao, ent.natureza_juridica, ent.ativo ? 1 : 0, new Date().toISOString(), ent.rtri_id]
    );
  } else {
    await db.run(
      'INSERT INTO entidade_rtri (rtri_id, designacao, natureza_juridica, ativo, data_inscricao) VALUES (?, ?, ?, ?, ?)',
      [ent.rtri_id, ent.designacao, ent.natureza_juridica, ent.ativo ? 1 : 0, ent.data_inscricao || null]
    );
  }
}

// ---------- Modo http: API real da AR ----------
//
// Contrato esperado (a confirmar com a AR no protocolo de interoperabilidade):
//   GET  {baseUrl}/entidades/:rtriId  →  200 {id, designacao, natureza_juridica, ativo, data_inscricao} | 404
//   GET  {baseUrl}/entidades?desde=ISO8601&pagina=N  →  200 {items: [...], proxima_pagina?: N+1}
// Auth: header `Authorization: Bearer <RTRI_API_KEY>` (ajustável).
//
// O mapeamento do JSON da AR para o nosso modelo está em mapearEntidade().

const TIMEOUT_GET_MS = 5_000;
const TIMEOUT_BATCH_MS = 30_000;
const RETRY_MAX = 2;
const RETRY_BACKOFF_MS = 800;

function mapearEntidade(j, fallbackId) {
  return {
    rtri_id: j.id || j.rtri_id || fallbackId,
    designacao: j.designacao || j.nome,
    natureza_juridica: j.natureza_juridica || j.natureza || 'OUTRA',
    ativo: j.ativo !== false && j.estado !== 'INATIVO' && j.estado !== 'CANCELADO',
    data_inscricao: j.data_inscricao || null,
  };
}

async function fetchComRetry(url, opts, tentativas = RETRY_MAX) {
  let ultimoErro;
  for (let i = 0; i <= tentativas; i++) {
    try {
      const res = await fetch(url, opts);
      // Retry apenas em 5xx ou 429 — 4xx são erros do nosso lado
      if (res.status >= 500 || res.status === 429) {
        ultimoErro = new Error(`API RTRI devolveu ${res.status}`);
        if (i < tentativas) {
          await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS * (i + 1)));
          continue;
        }
      }
      return res;
    } catch (e) {
      ultimoErro = e;
      if (i < tentativas) await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS * (i + 1)));
    }
  }
  throw ultimoErro;
}

async function consultarApiAr(rtriId) {
  if (!config.rtri.baseUrl) throw new Error('RTRI_BASE_URL não configurado');
  const res = await fetchComRetry(
    `${config.rtri.baseUrl}/entidades/${encodeURIComponent(rtriId)}`,
    {
      headers: config.rtri.apiKey ? { 'Authorization': `Bearer ${config.rtri.apiKey}` } : {},
      signal: AbortSignal.timeout(TIMEOUT_GET_MS),
    }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API AR devolveu ${res.status}`);
  return mapearEntidade(await res.json(), rtriId);
}

/**
 * Sincronização batch (cron diário em produção, modo http).
 * Suporta paginação se a API o expuser; aplica retries e métricas.
 */
export async function sincronizarRtri({ desde } = {}) {
  if (config.rtri.mode !== 'http') return { modo: 'mock', sincronizadas: 0 };
  if (!config.rtri.baseUrl) throw new Error('RTRI_BASE_URL não configurado');

  const headers = config.rtri.apiKey ? { 'Authorization': `Bearer ${config.rtri.apiKey}` } : {};
  let pagina = 1;
  let totalOk = 0, totalFalhas = 0;

  while (true) {
    const params = new URLSearchParams();
    if (desde) params.set('desde', desde);
    params.set('pagina', String(pagina));
    const res = await fetchComRetry(
      `${config.rtri.baseUrl}/entidades?${params.toString()}`,
      { headers, signal: AbortSignal.timeout(TIMEOUT_BATCH_MS) }
    );
    if (!res.ok) {
      incCounter('rtri_sync_falhas_total', { fase: 'fetch_pagina' });
      throw new Error(`API AR devolveu ${res.status} na página ${pagina}`);
    }
    const lista = await res.json();
    const items = lista.items || lista || [];
    for (const j of items) {
      try { await upsertCache(mapearEntidade(j)); totalOk++; }
      catch (e) {
        totalFalhas++;
        console.warn('[rtri] falha a persistir entidade:', e.message);
      }
    }
    if (!lista.proxima_pagina) break;
    pagina = lista.proxima_pagina;
    if (pagina > 1000) break; // sanidade contra loop infinito
  }

  incCounter('rtri_sync_total', { resultado: 'ok' }, totalOk);
  if (totalFalhas) incCounter('rtri_sync_total', { resultado: 'falha' }, totalFalhas);
  await db.run('INSERT INTO evento_auditoria (id, tipo_evento, payload) VALUES (?, ?, ?)',
    [crypto.randomUUID(), 'RTRI_SYNC',
     JSON.stringify({ modo: 'http', sincronizadas: totalOk, falhas: totalFalhas, desde: desde || null })]
  ).catch(() => {});
  return { modo: 'http', sincronizadas: totalOk, falhas: totalFalhas };
}

// ---------- Worker periódico (apenas em modo http) ----------
//
// Em vez de cron externo, agendamos um setInterval simples de N horas.
// Se o sistema reiniciar, a próxima execução faz-se imediatamente. Para
// produção com mais de uma réplica, mover para um leader-elect (Redis
// SETNX) — interface não muda.

let _workerHandle = null;

export function iniciarWorkerSincronizacao() {
  if (_workerHandle) return;
  if (config.rtri.mode !== 'http') return;
  const horas = parseInt(process.env.RTRI_SYNC_HORAS || '24', 10);
  const ms = Math.max(1, horas) * 3600 * 1000;
  _workerHandle = setInterval(() => {
    sincronizarRtri().catch(e => console.warn('[rtri-worker] erro:', e.message));
  }, ms);
  _workerHandle.unref?.();
  // Primeira execução assíncrona — não atrasa o boot
  setImmediate(() => sincronizarRtri().catch(e => console.warn('[rtri-worker] arranque:', e.message)));
}

export function pararWorkerSincronizacao() {
  if (_workerHandle) clearInterval(_workerHandle);
  _workerHandle = null;
}
