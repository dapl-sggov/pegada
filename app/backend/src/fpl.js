// fpl.js — Domínio FPL.
//
// CRUD + transições de marco + audit log + snapshot canónico por versão.
// Sem JWS, sem notificações automáticas, sem auditoria_qa estruturada
// (o ciclo de revisão SGGOV vive agora no audit log + correções editáveis
// directamente). Hash SHA-256 do snapshot é gravado na publicação (M5).

import crypto from 'node:crypto';
import { db } from './db.js';
import { uuid, nowISO } from './util.js';
import { validarMarco, transicaoEstadoApos, validarAudicao } from './workflow.js';
import { toCanonico } from './canonico.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function gerarNumeroProcesso(sigla) {
  const ano = new Date().getFullYear();
  const last = await db.get(
    `SELECT numero_processo FROM fpl WHERE numero_processo LIKE ? ORDER BY numero_processo DESC LIMIT 1`,
    [`${ano}/${sigla}/%`]
  );
  let n = 1;
  if (last) { const m = last.numero_processo.match(/\/(\d+)$/); if (m) n = parseInt(m[1], 10) + 1; }
  return `${ano}/${sigla}/${String(n).padStart(4, '0')}`;
}

async function novaVersao(fplId, autorId, marco = null, descricao = '') {
  const cur = await db.get('SELECT versao_atual FROM fpl WHERE id = ?', [fplId]);
  const novoN = (cur?.versao_atual || 0) + 1;
  const snap = await toCanonico(fplId);
  await db.run(
    `INSERT INTO versao_fpl (id, fpl_id, numero, autor_id, snapshot_json, marco, descricao)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [uuid(), fplId, novoN, autorId, JSON.stringify(snap), marco, descricao]
  );
  await db.run('UPDATE fpl SET versao_atual = ? WHERE id = ?', [novoN, fplId]);
  return novoN;
}

async function logEvento({ fplId, tipo, autorId, payload, req }) {
  await db.run(
    `INSERT INTO evento (id, fpl_id, tipo, autor_id, payload, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [uuid(), fplId, tipo, autorId,
     payload ? JSON.stringify(payload) : null,
     req?.ip || null, req?.headers?.['user-agent'] || null]
  );
}

// ---------------------------------------------------------------------------
// CRUD principal
// ---------------------------------------------------------------------------
export async function criarFpl({ tipo_diploma, titulo, titulo_curto, gabinete_id, coproponentes }, user, req) {
  const gab = await db.get('SELECT sigla FROM gabinete WHERE id = ?', [gabinete_id]);
  if (!gab) throw Object.assign(new Error('Gabinete inválido'), { code: 400 });
  const id = uuid();
  const numero = await gerarNumeroProcesso(gab.sigla);
  await db.run(
    `INSERT INTO fpl (id, numero_processo, tipo_diploma, titulo, titulo_curto, gabinete_id,
                      coproponentes, estado, criado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'RASCUNHO', ?)`,
    [id, numero, tipo_diploma, titulo, titulo_curto || null, gabinete_id,
     coproponentes ? JSON.stringify(coproponentes) : null, user.id]
  );
  await novaVersao(id, user.id, null, 'FPL criada');
  await logEvento({ fplId: id, tipo: 'FPL_CRIADA', autorId: user.id, payload: { numero, titulo }, req });
  return getFpl(id);
}

export async function listarFpl({ gabinete_id, estado, q, page = 1, perPage = 50 }) {
  let sql = `SELECT f.*, g.sigla as gabinete_sigla, g.nome as gabinete_nome
             FROM fpl f JOIN gabinete g ON g.id = f.gabinete_id WHERE 1=1`;
  const params = [];
  if (gabinete_id) { sql += ' AND f.gabinete_id = ?'; params.push(gabinete_id); }
  if (estado) { sql += ' AND f.estado = ?'; params.push(estado); }
  if (q) { sql += ' AND (f.titulo LIKE ? OR f.numero_processo LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY f.data_criacao DESC';
  const all = await db.all(sql, params);
  const start = (page - 1) * perPage;
  return { items: all.slice(start, start + perPage), total: all.length, page, perPage };
}

export async function getFpl(id) {
  const f = await db.get(
    `SELECT f.*, g.sigla as gabinete_sigla, g.nome as gabinete_nome
     FROM fpl f JOIN gabinete g ON g.id = f.gabinete_id WHERE f.id = ?`, [id]
  );
  if (!f) return null;
  f.audicoes = await db.all('SELECT * FROM audicao WHERE fpl_id = ? ORDER BY data_pedido DESC NULLS LAST', [id])
    .catch(() => db.all('SELECT * FROM audicao WHERE fpl_id = ? ORDER BY data_pedido DESC', [id]));
  f.integra = await db.all('SELECT * FROM interacao_integra WHERE fpl_id = ? ORDER BY data_interacao DESC', [id]);
  return f;
}

export async function atualizarBlocoB(id, fields, user, req) {
  const allowed = ['tipo_origem', 'referencia_origem', 'sintese_problema', 'avaliacao_previa'];
  const sets = [], params = [];
  for (const k of allowed) if (fields[k] !== undefined) { sets.push(`${k} = ?`); params.push(fields[k]); }
  if (sets.length) {
    params.push(id);
    await db.run(`UPDATE fpl SET ${sets.join(', ')} WHERE id = ?`, params);
    await novaVersao(id, user.id, null, 'Bloco B atualizado');
    await logEvento({ fplId: id, tipo: 'BLOCO_B_ATUALIZADO', autorId: user.id, payload: fields, req });
  }
  return getFpl(id);
}

/**
 * Atualiza datas do cronograma — previsões dos marcos + período da CP.
 * Permite ao ponto focal definir quando prevê validar cada marco e
 * quando o período da consulta pública decorre. Campos em formato 'YYYY-MM-DD'.
 */
export async function atualizarDatas(id, fields, user, req) {
  const allowed = ['cl_inicio', 'cl_fim', 'm0_prevista', 'm2_prevista', 'm3_prevista', 'm4_prevista', 'm5_prevista'];
  const sets = [], params = [];
  for (const k of allowed) if (fields[k] !== undefined) { sets.push(`${k} = ?`); params.push(fields[k] || null); }
  if (sets.length) {
    params.push(id);
    await db.run(`UPDATE fpl SET ${sets.join(', ')} WHERE id = ?`, params);
    await novaVersao(id, user.id, null, 'Cronograma atualizado');
    await logEvento({ fplId: id, tipo: 'CRONOGRAMA_ATUALIZADO', autorId: user.id, payload: fields, req });
  }
  return getFpl(id);
}

export async function atualizarBlocoE(id, fields, user, req) {
  const allowed = ['cl_link', 'cl_n_contributos', 'cl_sintese'];
  const sets = [], params = [];
  for (const k of allowed) if (fields[k] !== undefined) { sets.push(`${k} = ?`); params.push(fields[k]); }
  if (sets.length) {
    params.push(id);
    await db.run(`UPDATE fpl SET ${sets.join(', ')} WHERE id = ?`, params);
    await novaVersao(id, user.id, null, 'Bloco E atualizado');
    await logEvento({ fplId: id, tipo: 'BLOCO_E_ATUALIZADO', autorId: user.id, payload: fields, req });
  }
  return getFpl(id);
}

// ---------------------------------------------------------------------------
// Audições (Bloco D.1 obrigatórias / D.2 GSEPCM)
// ---------------------------------------------------------------------------
export async function adicionarAudicao(fplId, entrada, user, req) {
  const errs = validarAudicao(entrada);
  if (errs.length) throw Object.assign(new Error('Validação falhou'), { code: 422, errors: errs });
  const id = uuid();
  await db.run(
    `INSERT INTO audicao (id, fpl_id, categoria, entidade, base_legal, forma,
                          data_pedido, data_resposta, estado,
                          sintese_posicao, decisao_incorporacao, justificacao_decisao)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, fplId, entrada.categoria, entrada.entidade, entrada.base_legal || null,
     entrada.forma || null, entrada.data_pedido || null, entrada.data_resposta || null,
     entrada.estado || 'PEDIDA',
     entrada.sintese_posicao || null, entrada.decisao_incorporacao || null,
     entrada.justificacao_decisao || null]
  );
  await novaVersao(fplId, user.id, null, `Audição adicionada (${entrada.entidade})`);
  await logEvento({ fplId, tipo: 'AUDICAO_ADICIONADA', autorId: user.id,
    payload: { id, categoria: entrada.categoria, entidade: entrada.entidade }, req });
  return id;
}

export async function atualizarAudicao(fplId, audId, fields, user, req) {
  const cur = await db.get('SELECT * FROM audicao WHERE id = ? AND fpl_id = ?', [audId, fplId]);
  if (!cur) throw Object.assign(new Error('Audição não encontrada'), { code: 404 });
  const merged = { ...cur, ...fields };
  const errs = validarAudicao(merged);
  if (errs.length) throw Object.assign(new Error('Validação falhou'), { code: 422, errors: errs });
  const allowed = ['categoria', 'entidade', 'base_legal', 'forma', 'data_pedido', 'data_resposta',
                   'estado', 'sintese_posicao', 'decisao_incorporacao', 'justificacao_decisao'];
  const sets = [], params = [];
  for (const k of allowed) if (fields[k] !== undefined) { sets.push(`${k} = ?`); params.push(fields[k]); }
  sets.push('atualizado_em = ?'); params.push(nowISO());
  params.push(audId, fplId);
  await db.run(`UPDATE audicao SET ${sets.join(', ')} WHERE id = ? AND fpl_id = ?`, params);
  await novaVersao(fplId, user.id, null, 'Audição atualizada');
  await logEvento({ fplId, tipo: 'AUDICAO_ATUALIZADA', autorId: user.id, payload: { id: audId, fields }, req });
  return db.get('SELECT * FROM audicao WHERE id = ?', [audId]);
}

export async function eliminarAudicao(fplId, audId, user, req) {
  const cur = await db.get('SELECT * FROM audicao WHERE id = ? AND fpl_id = ?', [audId, fplId]);
  if (!cur) throw Object.assign(new Error('Audição não encontrada'), { code: 404 });
  await db.run('DELETE FROM audicao WHERE id = ?', [audId]);
  await novaVersao(fplId, user.id, null, 'Audição eliminada');
  await logEvento({ fplId, tipo: 'AUDICAO_ELIMINADA', autorId: user.id, payload: { id: audId, entidade: cur.entidade }, req });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Ingestão INTEGRA (Bloco D.3)
// ---------------------------------------------------------------------------
/**
 * Ingere um JSON do INTEGRA por gabinete. Aceita o formato da tab "Pegada
 * legislativa" do INTEGRA: cada entrada vai para uma linha em
 * interacao_integra, preservando o payload bruto.
 *
 * @param {string} fplId
 * @param {{gabinete: string, entradas: object[]}} json
 */
export async function ingerirIntegra(fplId, json, user, req) {
  if (!json || !json.gabinete || !Array.isArray(json.entradas)) {
    throw Object.assign(new Error('JSON INTEGRA inválido: faltam {gabinete, entradas[]}'), { code: 400 });
  }
  let inseridos = 0;
  for (const e of json.entradas) {
    await db.run(
      `INSERT INTO interacao_integra (id, fpl_id, gabinete_origem, payload, data_interacao, entidade, importado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uuid(), fplId, json.gabinete, JSON.stringify(e),
       e.data || null, e.entidade || null, user.id]
    );
    inseridos++;
  }
  await novaVersao(fplId, user.id, null, `INTEGRA: ${inseridos} interações de ${json.gabinete}`);
  await logEvento({ fplId, tipo: 'INTEGRA_INGERIDO', autorId: user.id,
    payload: { gabinete: json.gabinete, n: inseridos }, req });
  return { gabinete: json.gabinete, inseridos };
}

// ---------------------------------------------------------------------------
// Marcos
// ---------------------------------------------------------------------------
export async function validarMarcoFpl(fplId, marco, user, req) {
  const fpl = await getFpl(fplId);
  if (!fpl) throw Object.assign(new Error('FPL não encontrada'), { code: 404 });
  const result = await validarMarco(fpl, marco);
  if (!result.ok) return { ok: false, pendencias: result.pendencias };

  const novoEstado = transicaoEstadoApos(marco, fpl.estado);
  const ts = nowISO();
  const sets = [`${marco.toLowerCase()}_em = ?`, 'estado = ?'];
  const params = [ts, novoEstado];
  if (['M0', 'M1', 'M4', 'M5'].includes(marco)) {
    sets.push(`${marco.toLowerCase()}_por = ?`);
    params.push(user.id);
  }
  if (marco === 'M5') {
    sets.push('data_publicacao = ?');
    params.push(ts);
  }
  params.push(fplId);
  await db.run(`UPDATE fpl SET ${sets.join(', ')} WHERE id = ?`, params);

  // Hash SHA-256 do snapshot na publicação (M5) — integridade leve, sem JWS.
  if (marco === 'M5') {
    const snap = await toCanonico(fplId);
    const h = crypto.createHash('sha256').update(JSON.stringify(snap)).digest('hex');
    await db.run('UPDATE fpl SET hash_publicacao = ? WHERE id = ?', [h, fplId]);
  }

  await novaVersao(fplId, user.id, marco, `Marco ${marco} validado`);
  await logEvento({ fplId, tipo: `${marco}_VALIDADO`, autorId: user.id,
    payload: { marco, novo_estado: novoEstado }, req });
  return { ok: true, fpl: await getFpl(fplId) };
}

export async function aprovarEmCM(fplId, referenciaDr, user, req) {
  const fpl = await getFpl(fplId);
  if (!fpl) throw Object.assign(new Error('FPL não encontrada'), { code: 404 });
  if (fpl.estado !== 'EM_CM') throw Object.assign(new Error('A FPL tem de estar em EM_CM'), { code: 409 });
  await db.run('UPDATE fpl SET estado = ?, referencia_dr = ? WHERE id = ?',
    ['APROVADO', referenciaDr || null, fplId]);
  await novaVersao(fplId, user.id, null, 'Aprovado em CM');
  await logEvento({ fplId, tipo: 'APROVADO_CM', autorId: user.id, payload: { referencia_dr: referenciaDr }, req });
  return getFpl(fplId);
}

// ---------------------------------------------------------------------------
// Versões e eventos
// ---------------------------------------------------------------------------
export async function listarVersoes(fplId) {
  return db.all(
    `SELECT v.id, v.numero, v.autor_id, v.timestamp, v.marco, v.descricao,
            u.nome_completo as autor_nome
     FROM versao_fpl v JOIN utilizador u ON u.id = v.autor_id
     WHERE v.fpl_id = ? ORDER BY v.numero DESC`, [fplId]
  );
}

export async function getVersao(fplId, vId) {
  const v = await db.get('SELECT * FROM versao_fpl WHERE id = ? AND fpl_id = ?', [vId, fplId]);
  if (!v) return null;
  let snap = null;
  try { snap = v.snapshot_json ? JSON.parse(v.snapshot_json) : null; } catch {}
  return { ...v, snapshot: snap };
}

export async function listarEventos(fplId) {
  return db.all(
    `SELECT e.*, u.nome_completo as autor_nome
     FROM evento e LEFT JOIN utilizador u ON u.id = e.autor_id
     WHERE e.fpl_id = ? ORDER BY e.timestamp DESC LIMIT 200`, [fplId]
  );
}

// ---------------------------------------------------------------------------
// Revisão SGGOV (audit-log driven)
// ---------------------------------------------------------------------------
export async function pedirCorrecao(fplId, { observacoes }, user, req) {
  const fpl = await getFpl(fplId);
  if (!fpl) throw Object.assign(new Error('FPL não encontrada'), { code: 404 });
  await logEvento({ fplId, tipo: 'CORRECAO_PEDIDA', autorId: user.id,
    payload: { observacoes }, req });
  return { ok: true };
}
