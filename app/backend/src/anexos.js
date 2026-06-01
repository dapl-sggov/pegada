// anexos.js — Anexos no filesystem local.
// Sem S3, sem MinIO. Pasta única configurada em config.storage.dir.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import config from './config.js';
import { db } from './db.js';
import { uuid } from './util.js';

function garantirDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

export async function listarAnexos(fplId, bloco) {
  let sql = 'SELECT * FROM anexo WHERE fpl_id = ?';
  const params = [fplId];
  if (bloco) { sql += ' AND bloco = ?'; params.push(bloco); }
  sql += ' ORDER BY upload_em DESC';
  return db.all(sql, params);
}

export async function uploadAnexo({ fplId, bloco, entradaId, file, user }) {
  if (!file) throw Object.assign(new Error('Ficheiro em falta'), { code: 400 });
  if (file.size > config.storage.maxBytes) {
    throw Object.assign(new Error(`Tamanho excede ${config.storage.maxBytes} bytes`), { code: 413 });
  }
  garantirDir(config.storage.dir);
  const sha = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const id = uuid();
  const storagePath = path.join(config.storage.dir, `${id}_${file.originalname}`);
  fs.writeFileSync(storagePath, file.buffer);
  await db.run(
    `INSERT INTO anexo (id, fpl_id, bloco, entrada_id, nome_original, mime_type,
                        tamanho_bytes, sha256, storage_path, upload_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, fplId, bloco || null, entradaId || null, file.originalname,
     file.mimetype || 'application/octet-stream', file.size, sha, storagePath, user.id]
  );
  return { id, sha256: sha, nome: file.originalname, tamanho: file.size };
}

export async function getAnexo(id) {
  return db.get('SELECT * FROM anexo WHERE id = ?', [id]);
}

export async function streamAnexo(a, res) {
  if (!fs.existsSync(a.storage_path)) return res.status(404).end();
  res.setHeader('Content-Type', a.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(a.nome_original)}"`);
  fs.createReadStream(a.storage_path).pipe(res);
}

export async function eliminarAnexo(id) {
  const a = await getAnexo(id);
  if (!a) throw Object.assign(new Error('Anexo não encontrado'), { code: 404 });
  try { fs.unlinkSync(a.storage_path); } catch {}
  await db.run('DELETE FROM anexo WHERE id = ?', [id]);
  return { ok: true };
}

// Parser simples de multipart (sem deps): aceita 1 ficheiro por request.
export async function parseMultipart(req) {
  const ctype = req.headers['content-type'] || '';
  const m = ctype.match(/boundary=(.+)$/);
  if (!m) throw Object.assign(new Error('multipart/form-data esperado'), { code: 400 });
  const boundary = '--' + m[1];
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const buf = Buffer.concat(chunks);
  const parts = [];
  let i = 0;
  while (i < buf.length) {
    const start = buf.indexOf(boundary, i);
    if (start < 0) break;
    const next = buf.indexOf(boundary, start + boundary.length);
    if (next < 0) break;
    const part = buf.slice(start + boundary.length, next);
    parts.push(part);
    i = next;
  }
  const fields = {}; const files = [];
  for (const p of parts) {
    const headEnd = p.indexOf('\r\n\r\n');
    if (headEnd < 0) continue;
    const head = p.slice(0, headEnd).toString('utf8');
    let body = p.slice(headEnd + 4);
    if (body.slice(-2).toString() === '\r\n') body = body.slice(0, -2);
    const cd = head.match(/Content-Disposition:[^\n]*name="([^"]+)"(?:; filename="([^"]+)")?/i);
    if (!cd) continue;
    const name = cd[1]; const filename = cd[2];
    if (filename) {
      const ct = head.match(/Content-Type:\s*([^\r\n]+)/i)?.[1] || 'application/octet-stream';
      files.push({ fieldName: name, originalname: filename, mimetype: ct, size: body.length, buffer: body });
    } else {
      fields[name] = body.toString('utf8');
    }
  }
  return { fields, files };
}
