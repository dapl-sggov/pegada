// Adapter Consulta.Lex: webhook + import CSV manual + cache de contributos.
// Webhook é autenticado por chave pré-partilhada (X-CL-Key).

import { db } from './db.js';
import { uuid, jsonStringify } from './util.js';
import { notificar, destinatariosPorPapel, destinatariosGabinete } from './notificacoes.js';

const CL_WEBHOOK_KEY = process.env.CL_WEBHOOK_KEY || 'cl-demo-key-change-in-prod';

export function initConsultaLex() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contributo_consulta (
      id TEXT PRIMARY KEY,
      fpl_id TEXT NOT NULL REFERENCES fpl(id),
      cl_ref TEXT NOT NULL,
      data_contributo TEXT NOT NULL,
      entidade TEXT NOT NULL,
      tipo_entidade TEXT,
      tema TEXT,
      sintese TEXT,
      importado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      origem TEXT NOT NULL DEFAULT 'WEBHOOK'  -- WEBHOOK, CSV
    );
    CREATE INDEX IF NOT EXISTS idx_contrib_fpl ON contributo_consulta(fpl_id);
  `);
}

export function listarContributos(fplId) {
  return db.prepare('SELECT * FROM contributo_consulta WHERE fpl_id = ? ORDER BY data_contributo').all(fplId);
}

// Webhook: recebe { cl_ref, fpl_numero, periodo: {inicio, fim}, contributos: [...] }
export function processarWebhook(req, res) {
  const key = req.headers['x-cl-key'];
  if (key !== CL_WEBHOOK_KEY) return res.status(401).json({ error: 'Chave inválida' });
  const body = req.body || {};
  const { cl_ref, fpl_numero, periodo, contributos } = body;
  if (!cl_ref || !fpl_numero || !Array.isArray(contributos)) {
    return res.status(400).json({ error: 'Payload inválido (cl_ref, fpl_numero, contributos[])' });
  }
  const fpl = db.prepare('SELECT * FROM fpl WHERE numero_processo = ?').get(fpl_numero);
  if (!fpl) return res.status(404).json({ error: 'FPL não encontrada para esse número' });
  // Atualiza Bloco E
  db.prepare(`
    UPDATE fpl SET consulta_lex_ref = ?, consulta_lex_inicio = ?, consulta_lex_fim = ?,
                   consulta_lex_n_contributos = ?
    WHERE id = ?
  `).run(cl_ref, periodo?.inicio || null, periodo?.fim || null, contributos.length, fpl.id);
  // Insere contributos
  const ins = db.prepare(`
    INSERT INTO contributo_consulta (id, fpl_id, cl_ref, data_contributo, entidade, tipo_entidade, tema, sintese, origem)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'WEBHOOK')
  `);
  for (const c of contributos) {
    ins.run(uuid(), fpl.id, cl_ref, c.data || new Date().toISOString().slice(0, 10),
      c.entidade || 'Anónimo', c.tipo_entidade || null, c.tema || null, c.sintese || null);
  }
  // Audit + notificação
  db.prepare(`
    INSERT INTO evento_auditoria (id, fpl_id, tipo_evento, autor_id, payload)
    VALUES (?, ?, 'WEBHOOK_CONSULTA_LEX', NULL, ?)
  `).run(uuid(), fpl.id, jsonStringify({ cl_ref, n: contributos.length }));
  // Notifica destinatários do gabinete proponente
  const dest = destinatariosGabinete(fpl.gabinete_id);
  notificar({
    tipo: 'CONSULTA_LEX_RECEBIDA',
    destinatarios: dest,
    fpl,
    ctx: { cl_ref, n_contributos: contributos.length },
  });
  res.json({ ok: true, importados: contributos.length, fpl_id: fpl.id });
}

// Import CSV manual (fallback)
// Formato esperado: data,entidade,tipo_entidade,tema,sintese
export function importarCsv(fplId, cl_ref, csvText, user) {
  const fpl = db.prepare('SELECT * FROM fpl WHERE id = ?').get(fplId);
  if (!fpl) throw Object.assign(new Error('FPL não encontrada'), { code: 404 });
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) throw Object.assign(new Error('CSV vazio'), { code: 400 });
  // Salta cabeçalho se existir
  const header = lines[0].toLowerCase();
  const startIdx = (header.includes('entidade') || header.includes('data')) ? 1 : 0;
  const ins = db.prepare(`
    INSERT INTO contributo_consulta (id, fpl_id, cl_ref, data_contributo, entidade, tipo_entidade, tema, sintese, origem)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'CSV')
  `);
  let imported = 0;
  for (let i = startIdx; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length < 2) continue;
    const [data, entidade, tipo_entidade, tema, sintese] = cols;
    ins.run(uuid(), fplId, cl_ref, data || new Date().toISOString().slice(0, 10),
      entidade || 'Anónimo', tipo_entidade || null, tema || null, sintese || null);
    imported++;
  }
  // Atualiza Bloco E n_contributos
  const total = db.prepare('SELECT COUNT(*) as n FROM contributo_consulta WHERE fpl_id = ?').get(fplId).n;
  db.prepare('UPDATE fpl SET consulta_lex_ref = COALESCE(consulta_lex_ref, ?), consulta_lex_n_contributos = ? WHERE id = ?').run(cl_ref, total, fplId);
  // Audit
  db.prepare(`
    INSERT INTO evento_auditoria (id, fpl_id, tipo_evento, autor_id, payload)
    VALUES (?, ?, 'CSV_CONSULTA_LEX_IMPORTADO', ?, ?)
  `).run(uuid(), fplId, user.id, jsonStringify({ cl_ref, importados: imported }));
  return { importados: imported, total };
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuote) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQuote = false; }
      else cur += c;
    } else {
      if (c === ',') { out.push(cur); cur = ''; }
      else if (c === '"' && cur === '') { inQuote = true; }
      else cur += c;
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}

export { CL_WEBHOOK_KEY };
