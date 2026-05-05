// Domínio FPL: serviços de criação, edição, versionamento, marcos.

import { db } from './db.js';
import { uuid, nowISO, jsonStringify } from './util.js';
import { validarMarco, transicaoEstadoApos, validarEntradaBlocoD } from './workflow.js';
import { notificar, destinatariosPorPapel, destinatariosGabinete } from './notificacoes.js';

function gerarNumeroProcesso(gabineteSigla) {
  const ano = new Date().getFullYear();
  const last = db.prepare(
    `SELECT numero_processo FROM fpl
     WHERE numero_processo LIKE ? ORDER BY numero_processo DESC LIMIT 1`
  ).get(`${ano}/${gabineteSigla}/%`);
  let n = 1;
  if (last) {
    const m = last.numero_processo.match(/\/(\d+)$/);
    if (m) n = parseInt(m[1], 10) + 1;
  }
  return `${ano}/${gabineteSigla}/${String(n).padStart(4, '0')}`;
}

function snapshotFpl(fplId) {
  const fpl = db.prepare('SELECT * FROM fpl WHERE id = ?').get(fplId);
  const blocoC = db.prepare('SELECT * FROM entrada_bloco_c WHERE fpl_id = ?').all(fplId);
  const blocoD = db.prepare('SELECT * FROM entrada_bloco_d WHERE fpl_id = ?').all(fplId);
  return { fpl, bloco_c: blocoC, bloco_d: blocoD };
}

function novaVersao(fplId, autorId, marco = null, descricao = '') {
  const fpl = db.prepare('SELECT versao_atual FROM fpl WHERE id = ?').get(fplId);
  const novoN = (fpl?.versao_atual || 0) + 1;
  db.prepare(`
    INSERT INTO versao_fpl (id, fpl_id, numero, autor_id, snapshot, marco_validado, descricao)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(uuid(), fplId, novoN, autorId, jsonStringify(snapshotFpl(fplId)), marco, descricao);
  db.prepare('UPDATE fpl SET versao_atual = ? WHERE id = ?').run(novoN, fplId);
  return novoN;
}

function logEvento({ fplId, tipo, autorId, payload, req }) {
  db.prepare(`
    INSERT INTO evento_auditoria (id, fpl_id, tipo_evento, autor_id, payload, ip_origem, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    uuid(), fplId, tipo, autorId, jsonStringify(payload || {}),
    req?.ip || null, req?.headers?.['user-agent'] || null
  );
}

export function criarFpl({ tipo_diploma, titulo, titulo_curto, gabinete_id, coproponentes, regime_simplificado }, user, req) {
  const gab = db.prepare('SELECT sigla FROM gabinete WHERE id = ?').get(gabinete_id);
  if (!gab) throw new Error('Gabinete inválido');
  const id = uuid();
  const numero = gerarNumeroProcesso(gab.sigla);
  db.prepare(`
    INSERT INTO fpl (id, numero_processo, tipo_diploma, titulo, titulo_curto, gabinete_id,
                     coproponentes, regime_simplificado, criado_por, estado_workflow)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'CRIADO')
  `).run(id, numero, tipo_diploma, titulo, titulo_curto || null, gabinete_id,
         coproponentes ? jsonStringify(coproponentes) : null,
         regime_simplificado || null, user.id);
  novaVersao(id, user.id, null, 'FPL criada');
  logEvento({ fplId: id, tipo: 'FPL_CRIADA', autorId: user.id, payload: { numero, tipo_diploma, titulo }, req });
  return getFpl(id);
}

export function listarFpl({ gabinete_id, estado, q, page = 1, perPage = 50 }) {
  let sql = 'SELECT f.*, g.sigla as gabinete_sigla, g.nome as gabinete_nome FROM fpl f JOIN gabinete g ON g.id = f.gabinete_id WHERE 1=1';
  const params = [];
  if (gabinete_id) { sql += ' AND f.gabinete_id = ?'; params.push(gabinete_id); }
  if (estado) { sql += ' AND f.estado_workflow = ?'; params.push(estado); }
  if (q) { sql += ' AND (f.titulo LIKE ? OR f.numero_processo LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY f.data_criacao DESC';
  const all = db.prepare(sql).all(...params);
  const total = all.length;
  const start = (page - 1) * perPage;
  return { items: all.slice(start, start + perPage), total, page, perPage };
}

export function getFpl(id) {
  const fpl = db.prepare(`
    SELECT f.*, g.sigla as gabinete_sigla, g.nome as gabinete_nome
    FROM fpl f JOIN gabinete g ON g.id = f.gabinete_id WHERE f.id = ?
  `).get(id);
  if (!fpl) return null;
  const bloco_c = db.prepare('SELECT * FROM entrada_bloco_c WHERE fpl_id = ? ORDER BY data DESC').all(id);
  const bloco_d = db.prepare('SELECT * FROM entrada_bloco_d WHERE fpl_id = ? ORDER BY data DESC').all(id);
  return { ...fpl, bloco_c, bloco_d };
}

export function atualizarBlocoB(id, fields, user, req) {
  const allowed = ['tipo_origem', 'referencia_origem', 'sintese_problema', 'avaliacao_previa'];
  const sets = [], params = [];
  for (const k of allowed) {
    if (fields[k] !== undefined) { sets.push(`${k} = ?`); params.push(fields[k]); }
  }
  if (sets.length === 0) return getFpl(id);
  params.push(id);
  db.prepare(`UPDATE fpl SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  novaVersao(id, user.id, null, 'Bloco B atualizado');
  logEvento({ fplId: id, tipo: 'BLOCO_B_ATUALIZADO', autorId: user.id, payload: fields, req });
  return getFpl(id);
}

export function atualizarBlocoE(id, fields, user, req) {
  const allowed = ['consulta_lex_ref', 'consulta_lex_inicio', 'consulta_lex_fim',
                   'consulta_lex_n_contributos', 'consulta_lex_sintese', 'consulta_lex_decisao'];
  const sets = [], params = [];
  for (const k of allowed) {
    if (fields[k] !== undefined) { sets.push(`${k} = ?`); params.push(fields[k]); }
  }
  if (sets.length === 0) return getFpl(id);
  params.push(id);
  db.prepare(`UPDATE fpl SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  novaVersao(id, user.id, null, 'Bloco E atualizado');
  logEvento({ fplId: id, tipo: 'BLOCO_E_ATUALIZADO', autorId: user.id, payload: fields, req });
  return getFpl(id);
}

export function adicionarEntradaBlocoD(fplId, entrada, user, req) {
  const errors = validarEntradaBlocoD(entrada);
  if (errors.length) throw Object.assign(new Error('Validação falhou'), { code: 422, errors });
  // RTRI status
  let rtri_status = entrada.natureza_juridica === 'RTRI_INSCRITO' || entrada.natureza_juridica === 'RTRI_FORCA_LEI' ? 'PENDENTE' : 'NAO_APLICAVEL';
  if (entrada.rtri_id) {
    const ent = db.prepare('SELECT 1 FROM entidade_rtri WHERE rtri_id = ? AND ativo = 1').get(entrada.rtri_id);
    rtri_status = ent ? 'VALIDADO' : 'PENDENTE';
  }
  const id = uuid();
  db.prepare(`
    INSERT INTO entrada_bloco_d
      (id, fpl_id, data, forma, entidade_designacao, rtri_id, rtri_status, natureza_juridica,
       pessoas_governo, pessoas_interlocutor, objeto, sintese_posicao, decisao_incorporacao, justificacao_decisao)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, fplId, entrada.data, entrada.forma, entrada.entidade_designacao,
    entrada.rtri_id || null, rtri_status, entrada.natureza_juridica,
    jsonStringify(entrada.pessoas_governo || []),
    jsonStringify(entrada.pessoas_interlocutor || []),
    entrada.objeto, entrada.sintese_posicao,
    entrada.decisao_incorporacao || null, entrada.justificacao_decisao || null
  );
  novaVersao(fplId, user.id, null, `Bloco D: adicionada entrada (${entrada.entidade_designacao})`);
  logEvento({ fplId, tipo: 'BLOCO_D_ADICIONADO', autorId: user.id, payload: { entrada_id: id, entidade: entrada.entidade_designacao }, req });
  return id;
}

export function atualizarEntradaBlocoD(fplId, entradaId, fields, user, req) {
  const cur = db.prepare('SELECT * FROM entrada_bloco_d WHERE id = ? AND fpl_id = ?').get(entradaId, fplId);
  if (!cur) throw Object.assign(new Error('Entrada não encontrada'), { code: 404 });
  const merged = { ...cur, ...fields };
  const errors = validarEntradaBlocoD(merged);
  if (errors.length) throw Object.assign(new Error('Validação falhou'), { code: 422, errors });
  const allowed = ['data', 'forma', 'entidade_designacao', 'rtri_id', 'natureza_juridica',
                   'pessoas_governo', 'pessoas_interlocutor', 'objeto', 'sintese_posicao',
                   'decisao_incorporacao', 'justificacao_decisao'];
  const sets = [], params = [];
  for (const k of allowed) {
    if (fields[k] !== undefined) {
      const v = (k === 'pessoas_governo' || k === 'pessoas_interlocutor') ? jsonStringify(fields[k]) : fields[k];
      sets.push(`${k} = ?`); params.push(v);
    }
  }
  sets.push('atualizado_em = ?'); params.push(nowISO());
  params.push(entradaId, fplId);
  db.prepare(`UPDATE entrada_bloco_d SET ${sets.join(', ')} WHERE id = ? AND fpl_id = ?`).run(...params);
  novaVersao(fplId, user.id, null, `Bloco D: entrada atualizada`);
  logEvento({ fplId, tipo: 'BLOCO_D_ATUALIZADO', autorId: user.id, payload: { entrada_id: entradaId, fields }, req });
  return db.prepare('SELECT * FROM entrada_bloco_d WHERE id = ?').get(entradaId);
}

export function adicionarEntradaBlocoC(fplId, entrada, user, req) {
  if (!entrada.data || !entrada.entidade || !entrada.forma || !entrada.objeto || !entrada.sintese_posicao) {
    throw Object.assign(new Error('Campos obrigatórios em falta'), { code: 422 });
  }
  const id = uuid();
  db.prepare(`
    INSERT INTO entrada_bloco_c (id, fpl_id, data, entidade, cargo, forma, objeto, sintese_posicao)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, fplId, entrada.data, entrada.entidade, entrada.cargo || null,
         entrada.forma, entrada.objeto, entrada.sintese_posicao);
  novaVersao(fplId, user.id, null, `Bloco C: adicionada entrada (${entrada.entidade})`);
  logEvento({ fplId, tipo: 'BLOCO_C_ADICIONADO', autorId: user.id, payload: { entrada_id: id, entidade: entrada.entidade }, req });
  return id;
}

export function validarMarcoFpl(fplId, marco, user, req, opts = {}) {
  const fpl = getFpl(fplId);
  if (!fpl) throw Object.assign(new Error('FPL não encontrada'), { code: 404 });
  const result = validarMarco(fpl, marco);
  if (!result.ok) {
    return { ok: false, pendencias: result.pendencias };
  }
  // Para M3 e M4 exigir declaração explícita
  if (['M3', 'M4'].includes(marco) && !opts.declaracao_assinada) {
    return { ok: false, pendencias: [{ campo: 'declaracao', regra: 'declaracao_obrigatoria', detalhe: 'Necessário assinar declaração de completude (Bloco F)' }] };
  }
  const novoEstado = transicaoEstadoApos(marco, fpl.estado_workflow);
  const ts = nowISO();
  const colTs = `${marco.toLowerCase()}_validado_em`;
  const colBy = ['M0', 'M3', 'M4'].includes(marco) ? `${marco.toLowerCase()}_validado_por` : null;
  const sets = [`${colTs} = ?`, 'estado_workflow = ?'];
  const params = [ts, novoEstado];
  if (colBy) { sets.push(`${colBy} = ?`); params.push(user.id); }
  if (['M3', 'M4'].includes(marco)) {
    sets.push(`${marco.toLowerCase()}_declaracao = ?`);
    params.push(opts.declaracao_texto || 'Confirmo que a presente FPL reflete todas as interações ocorridas no perímetro do diploma e que os campos obrigatórios estão integralmente preenchidos.');
  }
  if (marco === 'M5') {
    sets.push('data_publicacao = ?');
    params.push(ts);
  }
  params.push(fplId);
  db.prepare(`UPDATE fpl SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  novaVersao(fplId, user.id, marco, `Marco ${marco} validado`);
  logEvento({ fplId, tipo: `${marco}_VALIDADO`, autorId: user.id, payload: { marco, novo_estado: novoEstado }, req });
  // Notificações
  const fplAtualizada = getFpl(fplId);
  try {
    if (marco === 'M3') {
      notificar({
        tipo: 'M3_VALIDADO',
        destinatarios: [...destinatariosPorPapel('GSEPCM'), ...destinatariosPorPapel('SGGOV_QA')],
        fpl: fplAtualizada,
      });
    } else if (marco === 'M4') {
      notificar({
        tipo: 'M4_VALIDADO',
        destinatarios: destinatariosPorPapel('GSEPCM'),
        fpl: fplAtualizada,
      });
    }
  } catch (e) { console.warn('[notif] falha:', e.message); }
  return { ok: true, fpl: fplAtualizada };
}

export function listarVersoes(fplId) {
  return db.prepare(`
    SELECT v.id, v.numero, v.autor_id, v.timestamp, v.marco_validado, v.descricao, u.nome_completo as autor_nome
    FROM versao_fpl v JOIN utilizador u ON u.id = v.autor_id
    WHERE v.fpl_id = ? ORDER BY v.numero DESC
  `).all(fplId);
}

export function listarEventos(fplId) {
  return db.prepare(`
    SELECT e.*, u.nome_completo as autor_nome
    FROM evento_auditoria e LEFT JOIN utilizador u ON u.id = e.autor_id
    WHERE e.fpl_id = ? ORDER BY e.timestamp DESC LIMIT 100
  `).all(fplId);
}
