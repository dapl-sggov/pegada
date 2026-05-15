// anexos.js — Upload (multipart manual), object storage (fs/MinIO), SHA-256,
// scan antivírus simulado, visibilidade. API assíncrona.

import crypto from 'node:crypto';
import { db } from './db.js';
import { storage } from './storage.js';
import config from './config.js';
import { uuid, jsonStringify } from './util.js';

const MAX_BYTES = config.storage.maxBytes;
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const EXT_FROM_MIME = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};
const SUSPICIOUS_PATTERNS = [
  /EICAR-STANDARD-ANTIVIRUS-TEST-FILE/i,
  /<script[^>]*>[\s\S]*?alert\(/i,
];

/** Parser multipart/form-data minimalista (1 ficheiro + campos auxiliares). */
export function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const ct = req.headers['content-type'] || '';
    const m = /boundary=(?:"([^"]+)"|([^;]+))/.exec(ct);
    if (!m) return reject(new Error('Sem boundary multipart'));
    const boundary = '--' + (m[1] || m[2]).trim();
    const chunks = [];
    let total = 0;
    req.on('data', c => {
      total += c.length;
      if (total > MAX_BYTES + 4096) {
        req.destroy();
        return reject(Object.assign(new Error('Excede tamanho máximo'), { code: 413 }));
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        const buf = Buffer.concat(chunks);
        const fields = {}; const files = [];
        const boundaryBuf = Buffer.from(boundary);
        let pos = buf.indexOf(boundaryBuf);
        while (pos !== -1) {
          let start = pos + boundaryBuf.length;
          if (buf.slice(start, start + 2).equals(Buffer.from('--'))) break;
          start += 2;
          const headersEnd = buf.indexOf(Buffer.from('\r\n\r\n'), start);
          if (headersEnd < 0) break;
          const headers = buf.slice(start, headersEnd).toString('utf8');
          const next = buf.indexOf(boundaryBuf, headersEnd + 4);
          const bodyEnd = next < 0 ? buf.length : next - 2;
          const body = buf.slice(headersEnd + 4, bodyEnd);
          const cd = /Content-Disposition: form-data; name="([^"]+)"(?:; filename="([^"]*)")?/.exec(headers);
          const ct2 = /Content-Type: ([^\r\n]+)/.exec(headers);
          if (cd) {
            if (cd[2] !== undefined) {
              files.push({ field: cd[1], filename: cd[2], mime: (ct2 ? ct2[1].trim() : 'application/octet-stream'), data: body });
            } else {
              fields[cd[1]] = body.toString('utf8');
            }
          }
          pos = next;
        }
        resolve({ fields, files });
      } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function scanForViruses(buf) {
  const slice = buf.slice(0, Math.min(buf.length, 1024 * 1024)).toString('utf8');
  for (const pat of SUSPICIOUS_PATTERNS) if (pat.test(slice)) return 'INFETADO';
  return 'LIMPO';
}

export async function listarAnexos(fplId, blocoFilter = null) {
  let sql = `SELECT a.*, u.nome_completo AS upload_por_nome
             FROM anexo a JOIN utilizador u ON u.id = a.upload_por WHERE a.fpl_id = ?`;
  const params = [fplId];
  if (blocoFilter) { sql += ' AND a.bloco = ?'; params.push(blocoFilter); }
  sql += ' ORDER BY a.upload_em DESC';
  return db.all(sql, params);
}

export async function getAnexo(id) {
  return db.get('SELECT * FROM anexo WHERE id = ?', [id]);
}

export async function uploadAnexo({ fplId, bloco, entradaId, visibilidade, file, user }) {
  if (!file) throw Object.assign(new Error('Ficheiro obrigatório'), { code: 400 });
  if (file.data.length === 0) throw Object.assign(new Error('Ficheiro vazio'), { code: 400 });
  if (file.data.length > MAX_BYTES) throw Object.assign(new Error('Ficheiro excede o tamanho máximo'), { code: 413 });
  if (!ALLOWED_MIME.has(file.mime)) {
    throw Object.assign(new Error(`Tipo MIME não permitido (${file.mime}). Aceite-se PDF, DOC(X), XLS(X).`), { code: 415 });
  }
  if (!['A', 'B', 'C', 'D', 'E'].includes(bloco)) {
    throw Object.assign(new Error('Bloco inválido'), { code: 400 });
  }
  const sha256 = crypto.createHash('sha256').update(file.data).digest('hex');
  const ext = EXT_FROM_MIME[file.mime] || 'bin';
  const id = uuid();
  const storageKey = `${id}.${ext}`;
  await storage.put(storageKey, file.data, file.mime);
  const avStatus = scanForViruses(file.data);
  await db.run(
    `INSERT INTO anexo (id, fpl_id, bloco, entrada_id, nome_original, mime_type, tamanho_bytes,
                        sha256, storage_path, visibilidade, upload_por, antivirus_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, fplId, bloco, entradaId || null, file.filename || 'anexo', file.mime, file.data.length,
     sha256, storageKey, (visibilidade === 'PUBLICO' ? 'PUBLICO' : 'INTERNO'), user.id, avStatus]
  );
  await db.run(
    `INSERT INTO evento_auditoria (id, fpl_id, tipo_evento, autor_id, payload) VALUES (?, ?, 'ANEXO_CARREGADO', ?, ?)`,
    [uuid(), fplId, user.id, jsonStringify({ anexo_id: id, nome: file.filename, bytes: file.data.length, mime: file.mime, sha256, antivirus_status: avStatus, bloco })]
  );
  if (avStatus === 'INFETADO') {
    return { id, antivirus_status: avStatus, warning: 'Antivírus detetou padrão suspeito; ficheiro em quarentena.' };
  }
  return { id, antivirus_status: avStatus };
}

export async function streamAnexo(anexo, res) {
  if (anexo.antivirus_status === 'INFETADO') {
    return res.status(403).json({ error: 'Ficheiro em quarentena (antivírus)' });
  }
  const buf = await storage.get(anexo.storage_path);
  if (!buf) return res.status(404).json({ error: 'Ficheiro não disponível' });
  res.setHeader('Content-Type', anexo.mime_type);
  res.setHeader('Content-Length', anexo.tamanho_bytes);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(anexo.nome_original)}"`);
  res.setHeader('X-Content-SHA256', anexo.sha256);
  res.send(buf);
}

export async function eliminarAnexo(anexoId, user) {
  const a = await getAnexo(anexoId);
  if (!a) throw Object.assign(new Error('Anexo não encontrado'), { code: 404 });
  await storage.del(a.storage_path);
  await db.run('DELETE FROM anexo WHERE id = ?', [anexoId]);
  await db.run(
    `INSERT INTO evento_auditoria (id, fpl_id, tipo_evento, autor_id, payload) VALUES (?, ?, 'ANEXO_ELIMINADO', ?, ?)`,
    [uuid(), a.fpl_id, user.id, jsonStringify({ anexo_id: anexoId, nome: a.nome_original })]
  );
  return { ok: true };
}

export const ANEXO_LIMITES = { MAX_BYTES, ALLOWED_MIME: [...ALLOWED_MIME] };
