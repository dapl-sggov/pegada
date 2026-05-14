// storage.js — Abstração de object storage para anexos.
//
// Dois drivers, escolhidos por configuração (STORAGE_DRIVER):
//   • fs  — filesystem local (desenvolvimento, modo legado)
//   • s3  — MinIO / S3-compatível (produção, dentro da RING)
//
// O código de domínio (anexos.js) usa sempre a mesma API e não sabe qual
// o driver por baixo. API: put / get / del / exists.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let _impl = null;

// ---------------------------------------------------------------------------
// Driver filesystem
// ---------------------------------------------------------------------------
function makeFs() {
  const dir = path.isAbsolute(config.storage.fsDir)
    ? config.storage.fsDir
    : path.resolve(__dirname, '../..', config.storage.fsDir.replace(/^\.\//, ''));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const full = (key) => path.join(dir, key.replace(/[^a-zA-Z0-9._-]/g, '_'));
  return {
    kind: 'fs',
    async put(key, buffer) { fs.writeFileSync(full(key), buffer); return { key }; },
    async get(key) {
      const p = full(key);
      if (!fs.existsSync(p)) return null;
      return fs.readFileSync(p);
    },
    async del(key) { try { fs.unlinkSync(full(key)); } catch {} },
    async exists(key) { return fs.existsSync(full(key)); },
    locator(key) { return full(key); },
  };
}

// ---------------------------------------------------------------------------
// Driver S3 / MinIO
// ---------------------------------------------------------------------------
async function makeS3() {
  let aws;
  try {
    aws = await import('@aws-sdk/client-s3');
  } catch {
    throw new Error(
      'STORAGE_DRIVER=s3 mas @aws-sdk/client-s3 não está instalado. ' +
      'Execute `npm install` (é uma optionalDependency) ou use STORAGE_DRIVER=fs.'
    );
  }
  const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } = aws;
  const s3cfg = config.storage.s3;
  const client = new S3Client({
    endpoint: s3cfg.endpoint,
    region: s3cfg.region,
    forcePathStyle: s3cfg.forcePathStyle,
    credentials: { accessKeyId: s3cfg.accessKey, secretAccessKey: s3cfg.secretKey },
  });
  const Bucket = s3cfg.bucket;
  const streamToBuffer = async (stream) => {
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    return Buffer.concat(chunks);
  };
  return {
    kind: 's3',
    async put(key, buffer, mime) {
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: buffer, ContentType: mime }));
      return { key };
    },
    async get(key) {
      try {
        const r = await client.send(new GetObjectCommand({ Bucket, Key: key }));
        return await streamToBuffer(r.Body);
      } catch (e) {
        if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) return null;
        throw e;
      }
    },
    async del(key) {
      try { await client.send(new DeleteObjectCommand({ Bucket, Key: key })); } catch {}
    },
    async exists(key) {
      try { await client.send(new HeadObjectCommand({ Bucket, Key: key })); return true; }
      catch { return false; }
    },
    locator(key) { return `s3://${Bucket}/${key}`; },
  };
}

export async function initStorage() {
  if (_impl) return _impl;
  _impl = config.storage.driver === 's3' ? await makeS3() : makeFs();
  return _impl;
}

function ensure() {
  if (!_impl) throw new Error('Storage não inicializado — chame `await initStorage()` no arranque.');
  return _impl;
}

export const storage = {
  get driver() { return _impl?.kind || config.storage.driver; },
  put(key, buffer, mime) { return ensure().put(key, buffer, mime); },
  get(key) { return ensure().get(key); },
  del(key) { return ensure().del(key); },
  exists(key) { return ensure().exists(key); },
  locator(key) { return ensure().locator(key); },
};

export default storage;
