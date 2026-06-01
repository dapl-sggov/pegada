// db.js — Acesso a dados.
//
// SQLite (node:sqlite, nativo, zero dependências). Síncrono por baixo,
// envolvido em Promises para que o domínio possa continuar a usar `await`.
// API: db.get, db.all, db.run, db.exec, db.tx, db.close.

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import config from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let _impl = null;

async function makeSqlite() {
  const { DatabaseSync } = await import('node:sqlite');
  const DATA_DIR = path.resolve(__dirname, '../../data');
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const dbPath = config.database.file || path.join(DATA_DIR, 'fpl.sqlite');
  const sdb = new DatabaseSync(dbPath);
  sdb.exec('PRAGMA journal_mode = WAL;');
  sdb.exec('PRAGMA foreign_keys = ON;');

  const stmtCache = new Map();
  const prep = (sql) => {
    let s = stmtCache.get(sql);
    if (!s) { s = sdb.prepare(sql); stmtCache.set(sql, s); }
    return s;
  };

  return {
    kind: 'sqlite',
    path: dbPath,
    async get(sql, params = []) { return prep(sql).get(...params) ?? null; },
    async all(sql, params = []) { return prep(sql).all(...params); },
    async run(sql, params = []) {
      const r = prep(sql).run(...params);
      return { changes: r.changes, lastInsertRowid: r.lastInsertRowid };
    },
    async exec(sql) { sdb.exec(sql); },
    async tx(fn) {
      sdb.exec('BEGIN');
      try { const r = await fn(this); sdb.exec('COMMIT'); return r; }
      catch (e) { try { sdb.exec('ROLLBACK'); } catch {} throw e; }
    },
    async close() { try { stmtCache.clear(); sdb.close(); } catch {} },
    raw: sdb,
  };
}

export async function initDb() {
  if (_impl) return _impl;
  _impl = await makeSqlite();
  return _impl;
}

function ensure() {
  if (!_impl) throw new Error('Base de dados não inicializada — chame `await initDb()`.');
  return _impl;
}

export const DRIVER = 'sqlite';

export const db = {
  get driver() { return DRIVER; },
  get path() { return ensure().path; },
  get(sql, params) { return ensure().get(sql, params); },
  all(sql, params) { return ensure().all(sql, params); },
  run(sql, params) { return ensure().run(sql, params); },
  exec(sql) { return ensure().exec(sql); },
  tx(fn) { return ensure().tx(fn); },
  close() { return _impl ? _impl.close() : Promise.resolve(); },
  get raw() { return ensure().raw; },
};

export function cutoffISO({ days = 0, hours = 0, minutes = 0 } = {}) {
  const ms = (days * 86400 + hours * 3600 + minutes * 60) * 1000;
  return new Date(Date.now() - ms).toISOString();
}

export default db;
