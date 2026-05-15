// consultalex.js — Adapter Consulta.Lex: webhook + import CSV manual (fallback).
// API assíncrona.
//
// Modos (config.consultaLex.mode):
//   • manual  — só import CSV pela UI
//   • webhook — recebe eventos de consulta encerrada
//   • http    — (futuro) consulta ativa à API do Consulta.Lex
//
// Segurança do webhook (modo "webhook"):
//   1. Header `X-CL-Timestamp: <ISO 8601>` com timestamp do envio.
//      Pedidos com mais de 5 minutos são rejeitados (anti-replay).
//   2. Header `X-CL-Signature: sha256=<hex>` com HMAC-SHA256 calculada
//      sobre `<timestamp>.<corpo-bruto-utf8>` usando a chave partilhada.
//      Comparação é feita em tempo constante (timingSafeEqual).
//   3. Para clientes mais antigos que ainda enviam só `X-CL-Key`, o modo
//      legacy é aceite quando CL_LEGACY_KEY_HEADER=true (a desativar
//      progressivamente).
//
// O `cl_ref` funciona como nonce natural — duas tentativas de import com
// o mesmo ref para a mesma FPL são idempotentes (não duplicam contributos
// graças a UNIQUE em (cl_ref, fpl_id, data, entidade) — ver migrate.js).

import crypto from 'node:crypto';
import { db } from './db.js';
import config from './config.js';
import { uuid, jsonStringify } from './util.js';
import { notificar, destinatariosGabinete } from './notificacoes.js';
import { incCounter } from './metrics.js';

const CL_WEBHOOK_KEY = config.consultaLex.webhookKey;
const CL_MAX_SKEW_MS = 5 * 60 * 1000;
const CL_LEGACY_HEADER = String(process.env.CL_LEGACY_KEY_HEADER || 'false') === 'true';

export async function listarContributos(fplId) {
  return db.all('SELECT * FROM contributo_consulta WHERE fpl_id = ? ORDER BY data_contributo', [fplId]);
}

// ---------------------------------------------------------------------------
// Verificação de assinatura do webhook
// ---------------------------------------------------------------------------

/**
 * Devolve null se o pedido for autêntico, ou uma string de erro caso contrário.
 * Verifica HMAC-SHA256 sobre `<timestamp>.<rawBody>` em tempo constante e
 * rejeita pedidos com mais de CL_MAX_SKEW_MS de skew.
 */
function verificarAssinatura(req) {
  const tsHeader = req.headers['x-cl-timestamp'];
  const sigHeader = req.headers['x-cl-signature'];

  // Modo legacy (a desativar): apenas chave partilhada
  if (CL_LEGACY_HEADER && req.headers['x-cl-key'] !== undefined) {
    const recebido = String(req.headers['x-cl-key']);
    const esperado = String(CL_WEBHOOK_KEY);
    const a = Buffer.from(recebido), b = Buffer.from(esperado);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return 'chave-invalida';
    return null;
  }

  if (!tsHeader || !sigHeader) return 'cabecalhos-em-falta';

  const ts = Date.parse(tsHeader);
  if (Number.isNaN(ts)) return 'timestamp-invalido';
  const skew = Math.abs(Date.now() - ts);
  if (skew > CL_MAX_SKEW_MS) return 'timestamp-expirado';

  if (!req.rawBody || !Buffer.isBuffer(req.rawBody)) return 'corpo-em-falta';

  const m = String(sigHeader).match(/^sha256=([a-f0-9]{64})$/i);
  if (!m) return 'assinatura-formato';

  const recebida = Buffer.from(m[1], 'hex');
  const calculada = crypto
    .createHmac('sha256', CL_WEBHOOK_KEY)
    .update(tsHeader + '.', 'utf8')
    .update(req.rawBody)
    .digest();

  if (recebida.length !== calculada.length) return 'assinatura-invalida';
  if (!crypto.timingSafeEqual(recebida, calculada)) return 'assinatura-invalida';
  return null;
}

// Webhook: { cl_ref, fpl_numero, periodo:{inicio,fim}, contributos:[...] }
export async function processarWebhook(req, res) {
  const erro = verificarAssinatura(req);
  if (erro) {
    incCounter('cl_webhook_total', { resultado: 'recusado', motivo: erro });
    return res.status(401).json({ error: 'Webhook não autenticado', motivo: erro });
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
  incCounter('cl_webhook_total', { resultado: 'aceite', motivo: 'ok' });
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
