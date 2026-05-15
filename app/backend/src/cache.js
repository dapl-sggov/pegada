// cache.js — Cache / contadores partilhados (Redis em produção, in-memory em dev).
//
// Em produção (RING), com várias réplicas da aplicação, o rate-limiting e o
// cache têm de ser partilhados — usa-se Redis. Em desenvolvimento, ou se o
// Redis estiver indisponível e REDIS_OPTIONAL=true, cai graciosamente para
// uma implementação in-memory equivalente (não partilhada entre processos).
//
// API mínima necessária ao projeto: get / set / del / incr / expire / ttl.

import config from './config.js';

let _impl = null;

// ---------------------------------------------------------------------------
// Implementação in-memory (fallback)
// ---------------------------------------------------------------------------
function makeMemory() {
  const store = new Map(); // key -> { v, exp }
  const now = () => Date.now();
  const alive = (e) => e && (!e.exp || e.exp > now());
  const purge = () => { for (const [k, e] of store) if (!alive(e)) store.delete(k); };
  setInterval(purge, 60_000).unref?.();
  return {
    kind: 'memory',
    async get(k) { const e = store.get(k); return alive(e) ? e.v : null; },
    async set(k, v, ttlSec) { store.set(k, { v, exp: ttlSec ? now() + ttlSec * 1000 : 0 }); },
    async del(k) { store.delete(k); },
    async incr(k, ttlSec) {
      const e = store.get(k);
      const v = (alive(e) ? Number(e.v) : 0) + 1;
      store.set(k, { v, exp: alive(e) ? e.exp : (ttlSec ? now() + ttlSec * 1000 : 0) });
      return v;
    },
    async expire(k, ttlSec) { const e = store.get(k); if (alive(e)) e.exp = now() + ttlSec * 1000; },
    async ttl(k) { const e = store.get(k); return alive(e) && e.exp ? Math.ceil((e.exp - now()) / 1000) : -1; },
    async close() { store.clear(); },
  };
}

// ---------------------------------------------------------------------------
// Implementação Redis
// ---------------------------------------------------------------------------
async function makeRedis() {
  let Redis;
  try {
    const mod = await import('ioredis');
    Redis = mod.default || mod;
  } catch {
    throw new Error('ioredis não está instalado');
  }
  // Configuração defensiva — em CI/dev o Redis pode não estar a correr:
  //  • lazyConnect: não tenta ligar até `.connect()` ser chamado.
  //  • retryStrategy null: NÃO tenta reconectar se a primeira ligação falhar
  //    (caso contrário ioredis fica num loop infinito a emitir 'error'
  //    events não-tratados, enchendo a CI com 25k+ linhas).
  //  • maxRetriesPerRequest: 1 — falha rápido por comando.
  //  • enableOfflineQueue: false — comandos rejeitam imediatamente se
  //    o cliente estiver offline.
  const client = new Redis(config.redis.url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
    enableOfflineQueue: false,
    reconnectOnError: () => false,
  });
  // Handler de 'error' OBRIGATÓRIO antes de connect — ioredis emite
  // estes eventos mesmo quando rejeitamos a Promise, e sem handler o
  // Node trata como unhandled e gera ruído na consola.
  client.on('error', (e) => {
    if (e && e.code !== 'ECONNREFUSED' && e.code !== 'ENOTFOUND' && e.code !== 'ECONNRESET') {
      console.warn('[cache:redis]', e.message);
    }
  });
  try {
    await client.connect();
  } catch (e) {
    // Garante que não fica handle aberto a tentar reconectar
    try { client.disconnect(); } catch {}
    throw e;
  }
  return {
    kind: 'redis',
    async get(k) { return client.get(k); },
    async set(k, v, ttlSec) { ttlSec ? await client.set(k, v, 'EX', ttlSec) : await client.set(k, v); },
    async del(k) { await client.del(k); },
    async incr(k, ttlSec) {
      const v = await client.incr(k);
      if (v === 1 && ttlSec) await client.expire(k, ttlSec);
      return v;
    },
    async expire(k, ttlSec) { await client.expire(k, ttlSec); },
    async ttl(k) { return client.ttl(k); },
    async close() { try { await client.quit(); } catch { client.disconnect(); } },
  };
}

export async function initCache() {
  if (_impl) return _impl;
  try {
    _impl = await makeRedis();
    console.log('[cache] Redis ligado:', config.redis.url);
  } catch (e) {
    if (config.redis.optional) {
      _impl = makeMemory();
      console.warn('[cache] Redis indisponível — a usar cache in-memory (não partilhada). Motivo:', e.message);
    } else {
      throw new Error('Redis obrigatório mas indisponível: ' + e.message);
    }
  }
  return _impl;
}

function ensure() {
  if (!_impl) { _impl = makeMemory(); } // segurança: nunca rebenta
  return _impl;
}

export const cache = {
  get driver() { return _impl?.kind || 'memory'; },
  get(k) { return ensure().get(k); },
  set(k, v, ttl) { return ensure().set(k, v, ttl); },
  del(k) { return ensure().del(k); },
  incr(k, ttl) { return ensure().incr(k, ttl); },
  expire(k, ttl) { return ensure().expire(k, ttl); },
  ttl(k) { return ensure().ttl(k); },
  close() { return _impl ? _impl.close() : Promise.resolve(); },
};

export default cache;
