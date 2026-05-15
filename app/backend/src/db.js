// db.js — Camada de acesso a dados dual-driver.
//
// Expõe uma API ASSÍNCRONA única que funciona com dois back-ends:
//   • SQLite (node:sqlite, nativo)  — desenvolvimento, testes, modo legado/transição
//   • PostgreSQL (pg)               — produção (RING)
//
// O código de domínio usa sempre `await db.get/all/run/exec/tx(...)` e nunca
// sabe qual o driver por baixo. Os placeholders escrevem-se sempre com `?`
// (estilo SQLite); quando o driver é Postgres, são convertidos para `$1,$2,...`.
//
// Escolha do driver (ver config.js):
//   - DATABASE_URL definido e DB_FORCE_SQLITE != true  → Postgres
//   - caso contrário                                    → SQLite
//
// Em produção, `config.assertConfigProducao()` garante DATABASE_URL.

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import config from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Seleção de driver
// ---------------------------------------------------------------------------
const usePg = !!config.database.url
  && !config.database.forceSqlite
  && !config.database.url.startsWith('sqlite:');

export const DRIVER = usePg ? 'pg' : 'sqlite';

let _impl = null;        // implementação concreta (resolvida no init)
let _initPromise = null;

// ---------------------------------------------------------------------------
// Conversão de placeholders `?` → `$n` (apenas para Postgres)
// ---------------------------------------------------------------------------
function toPgParams(sql) {
  let i = 0;
  // não converte `?` dentro de literais de string simples — o nosso código
  // nunca usa `?` literal em SQL, por isso a conversão direta é segura.
  return sql.replace(/\?/g, () => `$${++i}`);
}

// ---------------------------------------------------------------------------
// Implementação SQLite (node:sqlite — síncrono, envolvido em Promises)
// ---------------------------------------------------------------------------
async function makeSqlite() {
  const { DatabaseSync } = await import('node:sqlite');
  const DATA_DIR = path.resolve(__dirname, '../../data');
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const dbPath = config.database.url.startsWith('sqlite:')
    ? config.database.url.slice('sqlite:'.length)
    : path.join(DATA_DIR, 'fpl.sqlite');
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
    async close() { sdb.close(); },
    raw: sdb,
  };
}

// ---------------------------------------------------------------------------
// Implementação PostgreSQL (pg — assíncrono nativo)
// ---------------------------------------------------------------------------
async function makePg() {
  let pg;
  try {
    pg = await import('pg');
  } catch {
    throw new Error(
      'DATABASE_URL aponta para PostgreSQL mas o pacote "pg" não está instalado. ' +
      'Execute `npm install` (pg é uma optionalDependency) ou defina DB_FORCE_SQLITE=true.'
    );
  }
  const { Pool } = pg.default || pg;
  const pool = new Pool({
    connectionString: config.database.url,
    max: config.database.poolMax,
    ssl: config.database.ssl ? { rejectUnauthorized: false } : undefined,
  });
  // valida a ligação cedo
  const c = await pool.connect(); c.release();

  return {
    kind: 'pg',
    async get(sql, params = []) {
      const r = await pool.query(toPgParams(sql), params);
      return r.rows[0] ?? null;
    },
    async all(sql, params = []) {
      const r = await pool.query(toPgParams(sql), params);
      return r.rows;
    },
    async run(sql, params = []) {
      const r = await pool.query(toPgParams(sql), params);
      return { changes: r.rowCount, lastInsertRowid: null };
    },
    async exec(sql) { await pool.query(sql); },
    async tx(fn) {
      const client = await pool.connect();
      const txImpl = {
        kind: 'pg',
        async get(s, p = []) { const r = await client.query(toPgParams(s), p); return r.rows[0] ?? null; },
        async all(s, p = []) { const r = await client.query(toPgParams(s), p); return r.rows; },
        async run(s, p = []) { const r = await client.query(toPgParams(s), p); return { changes: r.rowCount, lastInsertRowid: null }; },
        async exec(s) { await client.query(s); },
      };
      try {
        await client.query('BEGIN');
        const r = await fn(txImpl);
        await client.query('COMMIT');
        return r;
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch {}
        throw e;
      } finally {
        client.release();
      }
    },
    async close() { await pool.end(); },
    raw: pool,
  };
}

// ---------------------------------------------------------------------------
// Inicialização (idempotente)
// ---------------------------------------------------------------------------
export async function initDb() {
  if (_impl) return _impl;
  if (_initPromise) return _initPromise;
  _initPromise = (usePg ? makePg() : makeSqlite()).then((impl) => {
    _impl = impl;
    return impl;
  });
  return _initPromise;
}

function ensure() {
  if (!_impl) throw new Error('Base de dados não inicializada — chame `await initDb()` no arranque.');
  return _impl;
}

// ---------------------------------------------------------------------------
// API pública — assíncrona, idêntica para os dois drivers
// ---------------------------------------------------------------------------
export const db = {
  get driver() { return DRIVER; },
  get(sql, params) { return ensure().get(sql, params); },
  all(sql, params) { return ensure().all(sql, params); },
  run(sql, params) { return ensure().run(sql, params); },
  exec(sql) { return ensure().exec(sql); },
  tx(fn) { return ensure().tx(fn); },
  close() { return _impl ? _impl.close() : Promise.resolve(); },
  get raw() { return ensure().raw; },
};

// Conveniência: instante "agora menos N dias/horas" em ISO, para passar como
// parâmetro em vez de usar funções de data específicas de cada SGBD.
export function cutoffISO({ days = 0, hours = 0, minutes = 0 } = {}) {
  const ms = (days * 86400 + hours * 3600 + minutes * 60) * 1000;
  return new Date(Date.now() - ms).toISOString();
}

export default db;
