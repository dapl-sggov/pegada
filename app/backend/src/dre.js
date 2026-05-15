// dre.js — Adapter para o Diário da República.
//
// Função primária: confirmar a publicação efetiva de um diploma cuja FPL
// está em estado APROVADO mas ainda não em PUBLICADO. Quando a publicação
// é detetada, o estado avança automaticamente para PUBLICADO e o ponto
// focal é notificado para validar M5 (que emite o último comprovativo).
//
// Modos (config.dre.mode):
//   • manual — o ponto focal indica manualmente a referência DR e a data
//   • http   — polling periódico ao DRE (padrão diário às 09:00, configurável)
//
// O DRE expõe uma API pública em https://dre.pt — contrato exato a
// confirmar com a equipa do DRE. O adapter usa um endpoint de pesquisa
// genérico e adapta-se ao formato da resposta em mapearResposta().
//
// Como a confirmação de publicação é um evento de informação (não
// emite comprovativo por si só), uma falha temporária do DRE não bloqueia
// nada — apenas atrasa a notificação.

import { db } from './db.js';
import config from './config.js';
import { uuid, jsonStringify } from './util.js';
import { incCounter } from './metrics.js';
import { notificar } from './notificacoes.js';

const TIMEOUT_MS = 8_000;

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Marca manualmente uma FPL como tendo sido publicada (modo `manual` ou
 * compl. ao polling). Devolve a FPL atualizada.
 */
export async function registarPublicacaoManual(fplId, { referencia_dr, data_publicacao, url }, user) {
  const fpl = await db.get('SELECT * FROM fpl WHERE id = ?', [fplId]);
  if (!fpl) throw Object.assign(new Error('FPL não encontrada'), { code: 404 });
  if (fpl.estado_workflow !== 'APROVADO' && fpl.estado_workflow !== 'EM_CM') {
    throw Object.assign(new Error('FPL deve estar em APROVADO/EM_CM antes de registar publicação'), { code: 409 });
  }
  await db.run(
    `UPDATE fpl SET referencia_dr = ?, data_publicacao = ?, dre_url = ?
     WHERE id = ?`,
    [referencia_dr, data_publicacao || new Date().toISOString().slice(0, 10), url || null, fplId]
  );
  await db.run(
    `INSERT INTO evento_auditoria (id, fpl_id, tipo_evento, autor_id, payload)
     VALUES (?, ?, 'DRE_PUBLICACAO_REGISTADA', ?, ?)`,
    [uuid(), fplId, user?.id || null,
     jsonStringify({ referencia_dr, data_publicacao, url, origem: 'manual' })]
  );
  return db.get('SELECT * FROM fpl WHERE id = ?', [fplId]);
}

/**
 * Polling: para cada FPL APROVADA sem `referencia_dr`, consulta o DRE
 * pelo número de processo (ou critério equivalente). Atualiza a FPL se
 * encontrar e notifica os destinatários.
 */
export async function polling() {
  if (config.dre.mode !== 'http') return { modo: 'manual', verificadas: 0 };
  const candidatas = await db.all(
    `SELECT id, numero_processo, titulo, gabinete_id, criado_por, tipo_diploma
     FROM fpl
     WHERE estado_workflow IN ('APROVADO','EM_CM')
       AND (referencia_dr IS NULL OR referencia_dr = '')
     LIMIT 200`
  );
  let detetadas = 0;
  for (const f of candidatas) {
    try {
      const r = await consultarDre(f);
      if (r) {
        await db.run(
          `UPDATE fpl SET referencia_dr = ?, data_publicacao = ?, dre_url = ? WHERE id = ?`,
          [r.referencia_dr, r.data_publicacao, r.url, f.id]
        );
        await db.run(
          `INSERT INTO evento_auditoria (id, fpl_id, tipo_evento, payload)
           VALUES (?, ?, 'DRE_PUBLICACAO_DETETADA', ?)`,
          [uuid(), f.id, jsonStringify({ ...r, origem: 'polling' })]
        );
        await notificar({
          tipo: 'DRE_PUBLICACAO_DETETADA',
          destinatarios: [f.criado_por],
          fpl: { id: f.id, numero_processo: f.numero_processo, titulo: f.titulo, titulo_curto: null },
          ctx: r,
        }).catch(e => console.warn('[dre] notif:', e.message));
        detetadas++;
        incCounter('dre_publicacoes_detetadas_total', { tipo: f.tipo_diploma });
      }
    } catch (e) {
      console.warn(`[dre] erro a verificar FPL ${f.numero_processo}:`, e.message);
      incCounter('dre_polling_falhas_total', {});
    }
  }
  return { modo: 'http', verificadas: candidatas.length, detetadas };
}

// ---------------------------------------------------------------------------
// Consulta ao DRE — contrato a confirmar com a equipa do DRE
// ---------------------------------------------------------------------------
//
// Esquema típico do DRE (a confirmar):
//   GET https://dre.pt/api/pesquisa?q=<numero_processo>&tipo=<DL|L|RCM|...>
//   → 200 { resultados: [{ id, sumario, data_publicacao, serie, numero_dr, link, ... }] }
//
// O adapter normaliza para { referencia_dr, data_publicacao, url }.

async function consultarDre(fpl) {
  if (!config.dre.baseUrl) return null;
  const url = `${config.dre.baseUrl}/api/pesquisa?q=${encodeURIComponent(fpl.numero_processo)}` +
              `&tipo=${encodeURIComponent(fpl.tipo_diploma)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'accept': 'application/json' } });
    if (!res.ok) return null;
    const j = await res.json();
    const m = (j.resultados || []).find(r =>
      String(r.sumario || '').includes(fpl.numero_processo) ||
      // Heurística secundária: matching pelo título exato (case-insensitive, primeiros 80 chars)
      similaridade(String(r.sumario || ''), String(fpl.titulo || '')) > 0.75
    );
    if (!m) return null;
    return mapearResposta(m);
  } finally { clearTimeout(t); }
}

function mapearResposta(j) {
  return {
    referencia_dr: j.numero_dr || j.referencia || j.id || null,
    data_publicacao: (j.data_publicacao || '').slice(0, 10) || null,
    url: j.link || j.url || null,
  };
}

function similaridade(a, b) {
  // Jaccard sobre palavras (tokens de 4+ chars). Simples e suficiente.
  const tok = s => new Set(String(s).toLowerCase().match(/[a-záéíóúâêôãõç]{4,}/g) || []);
  const A = tok(a), B = tok(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

// ---------------------------------------------------------------------------
// Worker periódico
// ---------------------------------------------------------------------------

let _workerHandle = null;

export function iniciarWorkerPolling() {
  if (_workerHandle) return;
  if (config.dre.mode !== 'http') return;
  const horas = parseInt(process.env.DRE_POLL_HORAS || '4', 10);
  const ms = Math.max(1, horas) * 3600 * 1000;
  _workerHandle = setInterval(() => {
    polling().catch(e => console.warn('[dre-worker] erro:', e.message));
  }, ms);
  _workerHandle.unref?.();
  setImmediate(() => polling().catch(e => console.warn('[dre-worker] arranque:', e.message)));
}

export function pararWorkerPolling() {
  if (_workerHandle) clearInterval(_workerHandle);
  _workerHandle = null;
}
