// storage.js — Compat shim. A lógica real vive em anexos.js (filesystem).
// Mantém um initStorage() para o server.js poder invocar sem condicionais.

import fs from 'node:fs';
import path from 'node:path';
import config from './config.js';

export async function initStorage() {
  const dir = path.resolve(config.storage.dir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return { driver: 'fs', dir };
}

export const storage = { driver: 'fs' };
