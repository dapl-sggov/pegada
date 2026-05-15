// fpl.js — Domínio FPL: criação, edição, versionamento, validação de marcos.
// Integra a emissão de comprovativo criptográfico nos marcos bloqueantes.
// API assíncrona (driver dual SQLite/PostgreSQL).

import { db } from './db.js';
import { uuid, nowISO, jsonStringify } from './util.js';
import { validarMarco, transicaoEstadoApos, validarEntradaBlocoD, MARCOS_BLOQUEANTES } from './workflow.js';
import { validarIdentificador } from './rtri.js';
import { emitirComprovativo } from './comprovativo.js';
import { incCounter } from './metrics.js';
import { notificar, destinatariosPorPapel } from './notificacoes.js';

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------
async function gerarNumeroProcesso(gabineteSigla) {
  const ano = new Date().getFullYear();
  const last = await db.get(
    `SELECT numero_processo FROM fpl WHERE numero_processo LIKE ? ORDER BY numero_processo DESC LIMIT 1`,
    [`${ano}/${gabineteSigla}/%`]
  );
  let n = 1;
  if (last) { const m = last.numero_processo.match(/\/(\d+)$/); if (m) n = parseInt(m[1], 10) + 1; }
  return `${ano}/${gabineteSigla}/${String(n).padStart(4, '0')}`;
}

async function snapshotFpl(fplId) {
  const fpl = await db.get('SELECT * FROM fpl WHERE id = ?', [fplId]);
  const bloco_c = await db.all('SELECT * FROM entrada_bloco_c WHERE fpl_id = ?', [fplId]);
  const bloco_d = await db.all('SELECT * FROM entrada_bloco_d WHERE fpl_id = ?', [fplId]);
  return { fpl, bloco_c, bloco_d };
}

async function novaVersao(fplId, autorId, marco = null, descricao = '') {
  const fpl = await db.get('SELECT versao_atual FROM fpl WHERE id = ?', [fplId]);
  const novoN = (fpl?.versao_atual || 0) + 1;
  await db.run(
    `INSERT INTO versao_fpl (id, fpl_id, numero, autor_id, snapshot, marco_validado, descricao)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [uuid(), fplId, novoN, autorId, jsonStringify(await snapshotFpl(fplId)), marco, descricao]
  );
  await db.run('UPDATE fpl SET versao_atual = ? WHERE id = ?', [novoN, fplId]);
  return novoN;
}

async function logEvento({ fplId, tipo, autorId, payload, req }) {
  await db.run(
    `INSERT INTO evento_auditoria (id, fpl_id, tipo_evento, autor_id, payload, ip_origem, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [uuid(), fplId, tipo, autorId, jsonStringify(payload || {}), req?.ip || null, req?.headers?.['user-agent'] || null]
  );
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
export async function criarFpl({ tipo_diploma, titulo, titulo_curto, gabinete_id, coproponentes, regime_simplificado }, user, req) {
  const gab = await db.get('SELECT sigla FROM gabinete WHERE id = ?', [gabinete_id]);
  if (!gab) throw new Error('Gabinete inválido');
  const id = uuid();
  const numero = await gerarNumeroProcesso(gab.sigla);
  await db.run(
    `INSERT INTO fpl (id, numero_processo, tipo_diploma, titulo, titulo_curto, gabinete_id,
                      coproponentes, regime_simplificado, criado_por, estado_workflow)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'CRIADO')`,
    [id, numero, tipo_diploma, titulo, titulo_curto || null, gabinete_id,
     coproponentes ? jsonStringify(coproponentes) : null, regime_simplificado || null, user.id]
  );
  await novaVersao(id, user.id, null, 'FPL criada');
  await logEvento({ fplId: id, tipo: 'FPL_CRIADA', autorId: user.id, payload: { numero, tipo_diploma, titulo }, req });
  return getFpl(id);
}

export async function listarFpl({ gabinete_id, estado, q, page = 1, perPage = 50 }) {
  let sql = `SELECT f.*, g.sigla as gabinete_sigla, g.nome as gabinete_nome
             FROM fpl f JOIN gabinete g ON g.id = f.gabinete_id WHERE 1=1`;
  const params = [];
  if (gabinete_id) { sql += ' AND f.gabinete_id = ?'; params.push(gabinete_id); }
  if (estado) { sql += ' AND f.estado_workflow = ?'; params.push(estado); }
  if (q) { sql += ' AND (f.titulo LIKE ? OR f.numero_processo LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY f.data_criacao DESC';
  const all = await db.all(sql, params);
  const start = (page - 1) * perPage;
  return { items: all.slice(start, start + perPage), total: all.length, page, perPage };
}

export async function getFpl(id) {
  const fpl = await db.get(
    `SELECT f.*, g.sigla as gabinete_sigla, g.nome as gabinete_nome
     FROM fpl f JOIN gabinete g ON g.id = f.gabinete_id WHERE f.id = ?`, [id]
  );
  if (!fpl) return null;
  fpl.bloco_c = await db.all('SELECT * FROM entrada_bloco_c WHERE fpl_id = ? ORDER BY data DESC', [id]);
  fpl.bloco_d = await db.all('SELECT * FROM entrada_bloco_d WHERE fpl_id = ? ORDER BY data DESC', [id]);
  return fpl;
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

export async function atualizarBlocoE(id, fields, user, req) {
  const allowed = ['consulta_lex_ref', 'consulta_lex_inicio', 'consulta_lex_fim',
    'consulta_lex_n_contributos', 'consulta_lex_sintese', 'consulta_lex_decisao'];
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

export async function adicionarEntradaBlocoD(fplId, entrada, user, req) {
  const errors = validarEntradaBlocoD(entrada);
  if (errors.length) throw Object.assign(new Error('Validação falhou'), { code: 422, errors });
  const { status: rtri_status } = await validarIdentificador(entrada.rtri_id, entrada.natureza_juridica);
  const id = uuid();
  await db.run(
    `INSERT INTO entrada_bloco_d
       (id, fpl_id, data, forma, entidade_designacao, rtri_id, rtri_status, natureza_juridica,
        pessoas_governo, pessoas_interlocutor, objeto, sintese_posicao, decisao_incorporacao, justificacao_decisao)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, fplId, entrada.data, entrada.forma, entrada.entidade_designacao,
     entrada.rtri_id || null, rtri_status, entrada.natureza_juridica,
     jsonStringify(entrada.pessoas_governo || []), jsonStringify(entrada.pessoas_interlocutor || []),
     entrada.objeto, entrada.sintese_posicao, entrada.decisao_incorporacao || null, entrada.justificacao_decisao || null]
  );
  await novaVersao(fplId, user.id, null, `Bloco D: adicionada entrada (${entrada.entidade_designacao})`);
  await logEvento({ fplId, tipo: 'BLOCO_D_ADICIONADO', autorId: user.id, payload: { entrada_id: id, entidade: entrada.entidade_designacao }, req });
  return id;
}

export async function atualizarEntradaBlocoD(fplId, entradaId, fields, user, req) {
  const cur = await db.get('SELECT * FROM entrada_bloco_d WHERE id = ? AND fpl_id = ?', [entradaId, fplId]);
  if (!cur) throw Object.assign(new Error('Entrada não encontrada'), { code: 404 });
  const merged = { ...cur, ...fields };
  const errors = validarEntradaBlocoD(merged);
  if (errors.length) throw Object.assign(new Error('Validação falhou'), { code: 422, errors });
  const allowed = ['data', 'forma', 'entidade_designacao', 'rtri_id', 'natureza_juridica',
    'pessoas_governo', 'pessoas_interlocutor', 'objeto', 'sintese_posicao', 'decisao_incorporacao', 'justificacao_decisao'];
  const sets = [], params = [];
  for (const k of allowed) {
    if (fields[k] !== undefined) {
      const v = (k === 'pessoas_governo' || k === 'pessoas_interlocutor') ? jsonStringify(fields[k]) : fields[k];
      sets.push(`${k} = ?`); params.push(v);
    }
  }
  sets.push('atualizado_em = ?'); params.push(nowISO());
  params.push(entradaId, fplId);
  await db.run(`UPDATE entrada_bloco_d SET ${sets.join(', ')} WHERE id = ? AND fpl_id = ?`, params);
  await novaVersao(fplId, user.id, null, 'Bloco D: entrada atualizada');
  await logEvento({ fplId, tipo: 'BLOCO_D_ATUALIZADO', autorId: user.id, payload: { entrada_id: entradaId, fields }, req });
  return db.get('SELECT * FROM entrada_bloco_d WHERE id = ?', [entradaId]);
}

export async function adicionarEntradaBlocoC(fplId, entrada, user, req) {
  if (!entrada.data || !entrada.entidade || !entrada.forma || !entrada.objeto || !entrada.sintese_posicao) {
    throw Object.assign(new Error('Campos obrigatórios em falta'), { code: 422 });
  }
  const id = uuid();
  await db.run(
    `INSERT INTO entrada_bloco_c (id, fpl_id, data, entidade, cargo, forma, objeto, sintese_posicao)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, fplId, entrada.data, entrada.entidade, entrada.cargo || null, entrada.forma, entrada.objeto, entrada.sintese_posicao]
  );
  await novaVersao(fplId, user.id, null, `Bloco C: adicionada entrada (${entrada.entidade})`);
  await logEvento({ fplId, tipo: 'BLOCO_C_ADICIONADO', autorId: user.id, payload: { entrada_id: id, entidade: entrada.entidade }, req });
  return id;
}

// ---------------------------------------------------------------------------
// Validação de marco — com emissão de comprovativo criptográfico
// ---------------------------------------------------------------------------
export async function validarMarcoFpl(fplId, marco, user, req, opts = {}) {
  const fpl = await getFpl(fplId);
  if (!fpl) throw Object.assign(new Error('FPL não encontrada'), { code: 404 });

  const result = await validarMarco(fpl, marco);
  if (!result.ok) {
    incCounter('fpl_marcos_validados_total', { marco, resultado: 'bloqueado' });
    return { ok: false, pendencias: result.pendencias };
  }

  // M3 e M4 exigem declaração de completude assinada (Bloco F)
  if (['M3', 'M4'].includes(marco) && !opts.declaracao_assinada) {
    return { ok: false, pendencias: [{ campo: 'declaracao', regra: 'declaracao_obrigatoria', detalhe: 'Necessário assinar a declaração de completude (Bloco F)' }] };
  }

  const novoEstado = transicaoEstadoApos(marco, fpl.estado_workflow);
  const ts = nowISO();
  const colTs = `${marco.toLowerCase()}_validado_em`;
  const sets = [`${colTs} = ?`, 'estado_workflow = ?'];
  const params = [ts, novoEstado];
  if (['M0', 'M3', 'M4'].includes(marco)) { sets.push(`${marco.toLowerCase()}_validado_por = ?`); params.push(user.id); }
  if (['M3', 'M4'].includes(marco)) {
    sets.push(`${marco.toLowerCase()}_declaracao = ?`);
    params.push(opts.declaracao_texto || 'Confirmo que a presente FPL reflete todas as interações ocorridas no perímetro do diploma e que os campos obrigatórios estão integralmente preenchidos.');
  }
  if (marco === 'M5') { sets.push('data_publicacao = ?'); params.push(ts); }
  params.push(fplId);
  await db.run(`UPDATE fpl SET ${sets.join(', ')} WHERE id = ?`, params);

  // Emissão do comprovativo criptográfico (marcos bloqueantes)
  let comprovativo = null;
  if (MARCOS_BLOQUEANTES.includes(marco)) {
    const fplAtualizada = await getFpl(fplId);
    const snapshot = await snapshotFpl(fplId);
    comprovativo = await emitirComprovativo({ fpl: fplAtualizada, marco, user, snapshot });
  }

  await novaVersao(fplId, user.id, marco,
    `Marco ${marco} validado${comprovativo ? ' · comprovativo emitido (' + comprovativo.jti + ')' : ''}`);
  await logEvento({
    fplId, tipo: `${marco}_VALIDADO`, autorId: user.id,
    payload: { marco, novo_estado: novoEstado, comprovativo_jti: comprovativo?.jti || null }, req,
  });

  // Notificações
  try {
    if (marco === 'M3') {
      await notificar({ tipo: 'M3_VALIDADO', destinatarios: await destinatariosPorPapel('GSEPCM'), fpl });
    } else if (marco === 'M4') {
      await notificar({ tipo: 'M4_VALIDADO', destinatarios: await destinatariosPorPapel('GSEPCM'), fpl });
    } else if (marco === 'M5') {
      await notificar({ tipo: 'M5_VALIDADO', destinatarios: [fpl.criado_por], fpl });
    }
  } catch (e) { console.warn('[fpl] notificação falhou:', e.message); }

  incCounter('fpl_marcos_validados_total', { marco, resultado: 'ok' });
  if (comprovativo) incCounter('fpl_comprovativos_emitidos_total', { marco });

  return { ok: true, fpl: await getFpl(fplId), comprovativo };
}

export async function listarVersoes(fplId) {
  return db.all(
    `SELECT v.id, v.numero, v.autor_id, v.timestamp, v.marco_validado, v.descricao, u.nome_completo as autor_nome
     FROM versao_fpl v JOIN utilizador u ON u.id = v.autor_id
     WHERE v.fpl_id = ? ORDER BY v.numero DESC`, [fplId]
  );
}

export async function listarEventos(fplId) {
  return db.all(
    `SELECT e.*, u.nome_completo as autor_nome
     FROM evento_auditoria e LEFT JOIN utilizador u ON u.id = e.autor_id
     WHERE e.fpl_id = ? ORDER BY e.timestamp DESC LIMIT 100`, [fplId]
  );
}

// Marca a FPL como aprovada em Conselho de Ministros (pré-condição de M5).
export async function aprovarEmCM(fplId, referenciaDr, user, req) {
  const fpl = await getFpl(fplId);
  if (!fpl) throw Object.assign(new Error('FPL não encontrada'), { code: 404 });
  if (fpl.estado_workflow !== 'EM_CM') {
    throw Object.assign(new Error('A FPL tem de estar em "EM_CM" para ser aprovada'), { code: 409 });
  }
  await db.run('UPDATE fpl SET estado_workflow = ?, referencia_dr = ? WHERE id = ?', ['APROVADO', referenciaDr || null, fplId]);
  await novaVersao(fplId, user.id, null, 'Aprovado em Conselho de Ministros');
  await logEvento({ fplId, tipo: 'APROVADO_CM', autorId: user.id, payload: { referencia_dr: referenciaDr }, req });
  return getFpl(fplId);
}
