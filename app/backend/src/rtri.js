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

import { db } from './db.js';
import config from './config.js';

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

// ---------- Modo http (placeholder do contrato com a AR) ----------
async function consultarApiAr(rtriId) {
  if (!config.rtri.baseUrl) throw new Error('RTRI_BASE_URL não configurado');
  const res = await fetch(`${config.rtri.baseUrl}/entidades/${encodeURIComponent(rtriId)}`, {
    headers: config.rtri.apiKey ? { 'Authorization': `Bearer ${config.rtri.apiKey}` } : {},
    signal: AbortSignal.timeout(5000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API AR devolveu ${res.status}`);
  const j = await res.json();
  // Mapeamento do formato da AR para o nosso (ajustável quando o protocolo for fixado)
  return {
    rtri_id: j.id || j.rtri_id || rtriId,
    designacao: j.designacao || j.nome,
    natureza_juridica: j.natureza_juridica || j.natureza,
    ativo: j.ativo !== false && j.estado !== 'INATIVO',
    data_inscricao: j.data_inscricao,
  };
}

// Sincronização batch (cron diário em produção — modo http)
export async function sincronizarRtri() {
  if (config.rtri.mode !== 'http') return { modo: 'mock', sincronizadas: 0 };
  if (!config.rtri.baseUrl) throw new Error('RTRI_BASE_URL não configurado');
  const res = await fetch(`${config.rtri.baseUrl}/entidades`, {
    headers: config.rtri.apiKey ? { 'Authorization': `Bearer ${config.rtri.apiKey}` } : {},
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`API AR devolveu ${res.status}`);
  const lista = await res.json();
  let n = 0;
  for (const j of (lista.items || lista)) {
    await upsertCache({
      rtri_id: j.id || j.rtri_id, designacao: j.designacao || j.nome,
      natureza_juridica: j.natureza_juridica || j.natureza,
      ativo: j.ativo !== false, data_inscricao: j.data_inscricao,
    });
    n++;
  }
  return { modo: 'http', sincronizadas: n };
}
