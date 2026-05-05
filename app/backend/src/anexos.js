// Módulo de anexos: upload (multipart manual), storage filesystem,
// SHA-256, scan antivírus simulado, visibilidade.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { uuid, jsonStringify } from './util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = path.resolve(__dirname, '../../data/anexos');
if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
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

// Padrões de "vírus" simulados — assinaturas EICAR-like ou nomes suspeitos
const SUSPICIOUS_PATTERNS = [
  /EICAR-STANDARD-ANTIVIRUS-TEST-FILE/i,
  /<script[^>]*>.*alert\(/is,
];

/**
 * Parser multipart/form-data minimalista, suficiente para um único ficheiro + campos auxiliares.
 * Pure-JS para evitar dependência multer (que tem problemas com Express 4 LTS).
 */
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
        return reject(Object.assign(new Error('Excede tamanho máximo (20 MB)'), { code: 413 }));
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        const buf = Buffer.concat(chunks);
        const fields = {};
        const files = [];
        const sep = Buffer.from('\r\n');
        const boundaryBuf = Buffer.from(boundary);
        const endBoundaryBuf = Buffer.from(boundary + '--');
        // split by boundary
        let pos = buf.indexOf(boundaryBuf);
        while (pos !== -1) {
          // skip boundary line
          let start = pos + boundaryBuf.length;
          if (buf.slice(start, start + 2).equals(Buffer.from('--'))) break; // end
          start += 2; // skip \r\n
          // headers end at \r\n\r\n
          const headersEnd = buf.indexOf(Buffer.from('\r\n\r\n'), start);
          if (headersEnd < 0) break;
          const headers = buf.slice(start, headersEnd).toString('utf8');
          const next = buf.indexOf(boundaryBuf, headersEnd + 4);
          const bodyEnd = next < 0 ? buf.length : next - 2; // strip trailing \r\n
          const body = buf.slice(headersEnd + 4, bodyEnd);
          const cd = /Content-Disposition: form-data; name="([^"]+)"(?:; filename="([^"]*)")?/.exec(headers);
          const ct2 = /Content-Type: ([^\r\n]+)/.exec(headers);
          if (cd) {
            const name = cd[1];
            const filename = cd[2];
            if (filename !== undefined) {
              files.push({ field: name, filename, mime: (ct2 ? ct2[1].trim() : 'application/octet-stream'), data: body });
            } else {
              fields[name] = body.toString('utf8');
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
  const text = buf.slice(0, Math.min(buf.length, 1024 * 1024)).toString('utf8', 0, Math.min(buf.length, 1024 * 1024));
  for (const pat of SUSPICIOUS_PATTERNS) {
    if (pat.test(text)) return 'INFETADO';
  }
  return 'LIMPO';
}

export function listarAnexos(fplId, blocoFilter = null) {
  let sql = `
    SELECT a.*, u.nome_completo AS upload_por_nome
    FROM anexo a JOIN utilizador u ON u.id = a.upload_por
    WHERE a.fpl_id = ?
  `;
  const params = [fplId];
  if (blocoFilter) { sql += ' AND a.bloco = ?'; params.push(blocoFilter); }
  sql += ' ORDER BY a.upload_em DESC';
  return db.prepare(sql).all(...params);
}

export function getAnexo(id) {
  return db.prepare('SELECT * FROM anexo WHERE id = ?').get(id);
}

export async function uploadAnexo({ fplId, bloco, entradaId, visibilidade, file, user }) {
  if (!file) throw Object.assign(new Error('Ficheiro obrigatório'), { code: 400 });
  if (file.data.length === 0) throw Object.assign(new Error('Ficheiro vazio'), { code: 400 });
  if (file.data.length > MAX_BYTES) throw Object.assign(new Error('Ficheiro excede 20 MB'), { code: 413 });
  if (!ALLOWED_MIME.has(file.mime)) {
    throw Object.assign(new Error(`Tipo MIME não permitido (${file.mime}). Aceite-se PDF, DOC(X), XLS(X).`), { code: 415 });
  }
  if (!['A', 'B', 'C', 'D', 'E'].includes(bloco)) {
    throw Object.assign(new Error('Bloco inválido'), { code: 400 });
  }
  const sha256 = crypto.createHash('sha256').update(file.data).digest('hex');
  const ext = EXT_FROM_MIME[file.mime] || 'bin';
  const id = uuid();
  const storagePath = path.join(STORAGE_DIR, `${id}.${ext}`);
  fs.writeFileSync(storagePath, file.data);
  const avStatus = scanForViruses(file.data);
  db.prepare(`
    INSERT INTO anexo (id, fpl_id, bloco, entrada_id, nome_original, mime_type, tamanho_bytes,
                       sha256, storage_path, visibilidade, upload_por, antivirus_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, fplId, bloco, entradaId || null, file.filename || 'anexo',
    file.mime, file.data.length, sha256, storagePath,
    (visibilidade === 'PUBLICO' ? 'PUBLICO' : 'INTERNO'),
    user.id, avStatus
  );
  // Audit
  db.prepare(`
    INSERT INTO evento_auditoria (id, fpl_id, tipo_evento, autor_id, payload)
    VALUES (?, ?, 'ANEXO_CARREGADO', ?, ?)
  `).run(uuid(), fplId, user.id,
    jsonStringify({ anexo_id: id, nome: file.filename, bytes: file.data.length, mime: file.mime, sha256, antivirus_status: avStatus, bloco, entrada_id: entradaId || null }));
  if (avStatus === 'INFETADO') {
    // Marca o ficheiro mas não o serve
    return { id, antivirus_status: avStatus, warning: 'Antivírus detetou padrão suspeito; ficheiro guardado em quarentena.' };
  }
  return { id, antivirus_status: avStatus };
}

export function streamAnexo(anexo, res) {
  if (anexo.antivirus_status === 'INFETADO') {
    res.status(403).json({ error: 'Ficheiro em quarentena (antivírus)' });
    return;
  }
  if (!fs.existsSync(anexo.storage_path)) {
    res.status(404).json({ error: 'Ficheiro não disponível' });
    return;
  }
  res.setHeader('Content-Type', anexo.mime_type);
  res.setHeader('Content-Length', anexo.tamanho_bytes);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(anexo.nome_original)}"`);
  res.setHeader('X-Content-SHA256', anexo.sha256);
  fs.createReadStream(anexo.storage_path).pipe(res);
}

export function eliminarAnexo(anexoId, user) {
  const a = getAnexo(anexoId);
  if (!a) throw Object.assign(new Error('Anexo não encontrado'), { code: 404 });
  try { if (fs.existsSync(a.storage_path)) fs.unlinkSync(a.storage_path); } catch {}
  db.prepare('DELETE FROM anexo WHERE id = ?').run(anexoId);
  db.prepare(`
    INSERT INTO evento_auditoria (id, fpl_id, tipo_evento, autor_id, payload)
    VALUES (?, ?, 'ANEXO_ELIMINADO', ?, ?)
  `).run(uuid(), a.fpl_id, user.id, jsonStringify({ anexo_id: anexoId, nome: a.nome_original }));
  return { ok: true };
}

export const ANEXO_LIMITES = { MAX_BYTES, ALLOWED_MIME: [...ALLOWED_MIME] };
