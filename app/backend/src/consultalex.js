// consultalex.js — Adapter Consulta.Lex: webhook + import CSV manual (fallback).
// API assíncrona. O webhook é autenticado por chave pré-partilhada (X-CL-Key).
//
// Modos (config.consultaLex.mode):
//   • manual  — só import CSV pela UI
//   • webhook — recebe eventos de consulta encerrada
//   • http    — (futuro) consulta ativa à API do Consulta.Lex

import { db } from './db.js';
import config from './config.js';
import { uuid, jsonStringify } from './util.js';
import { notificar, destinatariosGabinete } from './notificacoes.js';

const CL_WEBHOOK_KEY = config.consultaLex.webhookKey;

export async function listarContributos(fplId) {
  return db.all('SELECT * FROM contributo_consulta WHERE fpl_id = ? ORDER BY data_contributo', [fplId]);
}

// Webhook: { cl_ref, fpl_numero, periodo:{inicio,fim}, contributos:[...] }
export async function processarWebhook(req, res) {
  if (req.headers['x-cl-key'] !== CL_WEBHOOK_KEY) {
    return res.status(401).json({ error: 'Chave inválida' });
  }
  const { cl_ref, fpl_numero, periodo, contributos } = req.body || {};
  if (!cl_ref || !fpl_numero || !Array.isArray(contributos)) {
    return res.status(400).json({ error: 'Payload inválido (cl_ref, fpl_numero, contributos[])' });
  }
  const fpl = await db.get('SELECT * FROM fpl WHERE numero_processo = ?', [fpl_numero]);
  if (!fpl) return res.status(404).json({ error: 'FPL não encontrada para esse número' });

  await db.run(
    `UPDATE fpl SET consulta_lex_ref = ?, consulta_lex_inicio = ?, consulta_lex_fim = ?, consulta_lex_n_contributos = ?
     WHERE id = ?`,
    [cl_ref, periodo?.inicio || null, periodo?.fim || null, contributos.length, fpl.id]
  );
  for (const c of contributos) {
    await db.run(
      `INSERT INTO contributo_consulta (id, fpl_id, cl_ref, data_contributo, entidade, tipo_entidade, tema, sintese, origem)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'WEBHOOK')`,
      [uuid(), fpl.id, cl_ref, c.data || new Date().toISOString().slice(0, 10),
       c.entidade || 'Anónimo', c.tipo_entidade || null, c.tema || null, c.sintese || null]
    );
  }
  await db.run(
    `INSERT INTO evento_auditoria (id, fpl_id, tipo_evento, autor_id, payload) VALUES (?, ?, 'WEBHOOK_CONSULTA_LEX', NULL, ?)`,
    [uuid(), fpl.id, jsonStringify({ cl_ref, n: contributos.length })]
  );
  const dest = await destinatariosGabinete(fpl.gabinete_id);
  await notificar({ tipo: 'CONSULTA_LEX_RECEBIDA', destinatarios: dest, fpl, ctx: { cl_ref, n_contributos: contributos.length } });
  res.json({ ok: true, importados: contributos.length, fpl_id: fpl.id });
}

// Import CSV manual (fallback). Formato: data,entidade,tipo_entidade,tema,sintese
export async function importarCsv(fplId, cl_ref, csvText, user) {
  const fpl = await db.get('SELECT * FROM fpl WHERE id = ?', [fplId]);
  if (!fpl) throw Object.assign(new Error('FPL não encontrada'), { code: 404 });
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) throw Object.assign(new Error('CSV vazio'), { code: 400 });
  const header = lines[0].toLowerCase();
  const startIdx = (header.includes('entidade') || header.includes('data')) ? 1 : 0;
  let imported = 0;
  for (let i = startIdx; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length < 2) continue;
    const [data, entidade, tipo_entidade, tema, sintese] = cols;
    await db.run(
      `INSERT INTO contributo_consulta (id, fpl_id, cl_ref, data_contributo, entidade, tipo_entidade, tema, sintese, origem)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'CSV')`,
      [uuid(), fplId, cl_ref, data || new Date().toISOString().slice(0, 10),
       entidade || 'Anónimo', tipo_entidade || null, tema || null, sintese || null]
    );
    imported++;
  }
  const tot = await db.get('SELECT COUNT(*) as n FROM contributo_consulta WHERE fpl_id = ?', [fplId]);
  const total = tot ? tot.n : imported;
  await db.run(
    'UPDATE fpl SET consulta_lex_ref = COALESCE(consulta_lex_ref, ?), consulta_lex_n_contributos = ? WHERE id = ?',
    [cl_ref, total, fplId]
  );
  await db.run(
    `INSERT INTO evento_auditoria (id, fpl_id, tipo_evento, autor_id, payload) VALUES (?, ?, 'CSV_CONSULTA_LEX_IMPORTADO', ?, ?)`,
    [uuid(), fplId, user.id, jsonStringify({ cl_ref, importados: imported })]
  );
  return { importados: imported, total };
}

function parseCsvLine(line) {
  const out = []; let cur = ''; let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuote) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuote = false;
      else cur += c;
    } else {
      if (c === ',') { out.push(cur); cur = ''; }
      else if (c === '"' && cur === '') inQuote = true;
      else cur += c;
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}

export { CL_WEBHOOK_KEY };
