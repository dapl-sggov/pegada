// security.js — Hardening mínimo: cabeçalhos, CSRF, rate-limit in-memory,
// bloqueio de conta por tentativas. Sem Redis.

import crypto from 'node:crypto';
import { db, cutoffISO } from './db.js';
import config from './config.js';
import { uuid } from './util.js';

// ---------------------------------------------------------------------------
// Cabeçalhos
// ---------------------------------------------------------------------------
export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "script-src-attr 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; '));
  if (config.isProd) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
}

// ---------------------------------------------------------------------------
// Rate limiting in-memory (chega para uma instância)
// ---------------------------------------------------------------------------
const buckets = new Map(); // key → {n, reset}

function bump(key, max, windowMs) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    return { allowed: true };
  }
  b.n += 1;
  if (b.n > max) return { allowed: false, retryAfter: Math.ceil((b.reset - now) / 1000) };
  return { allowed: true };
}

// Limpeza periódica
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
}, 60_000).unref?.();

export function rateLimit({ max = 240, windowMs = 60_000, keyFn = req => req.ip || 'anon' }) {
  return (req, res, next) => {
    const r = bump('rl:' + keyFn(req), max, windowMs);
    if (!r.allowed) {
      res.setHeader('Retry-After', String(r.retryAfter));
      return res.status(429).json({ error: 'Demasiados pedidos.', retry_after_s: r.retryAfter });
    }
    next();
  };
}

export function rateLimitLogin(req, res, next) {
  if (process.env.NODE_ENV === 'test' || process.env.RATE_LIMIT_DISABLE === '1') return next();
  const email = (req.body?.email || '').toLowerCase();
  const r1 = bump('login:ip:' + (req.ip || 'anon'), 20, 5 * 60_000);
  const r2 = bump('login:email:' + email, 5, 5 * 60_000);
  if (!r1.allowed || !r2.allowed) {
    return res.status(429).json({ error: 'Demasiadas tentativas. Tente em 5 minutos.' });
  }
  next();
}

// ---------------------------------------------------------------------------
// Tentativas de login + bloqueio
// ---------------------------------------------------------------------------
const MAX_LOGIN_FAILS = 8;
const LOCK_MINUTES = 30;

export async function registarTentativaLogin(email, ip, sucesso) {
  await db.run(
    'INSERT INTO tentativa_login (id, email, ip, sucesso) VALUES (?, ?, ?, ?)',
    [uuid(), email, ip || null, sucesso ? 1 : 0]
  );
  await db.run('DELETE FROM tentativa_login WHERE timestamp < ?', [cutoffISO({ days: config.retention.tentativasLoginDias })]);
  if (sucesso) {
    await db.run('DELETE FROM conta_bloqueada WHERE email = ?', [email]);
    return;
  }
  const fails = await db.get(
    'SELECT COUNT(*) as n FROM tentativa_login WHERE email = ? AND sucesso = 0 AND timestamp > ?',
    [email, cutoffISO({ minutes: 30 })]
  );
  if (fails && fails.n >= MAX_LOGIN_FAILS) {
    const desbloqueia = new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString();
    await db.run(
      `INSERT INTO conta_bloqueada (email, desbloqueia_em, motivo)
       VALUES (?, ?, ?)
       ON CONFLICT (email) DO UPDATE SET desbloqueia_em = excluded.desbloqueia_em, motivo = excluded.motivo, bloqueada_em = CURRENT_TIMESTAMP`,
      [email, desbloqueia, `${MAX_LOGIN_FAILS} tentativas falhadas`]
    );
  }
}

export async function contaBloqueada(email) {
  const r = await db.get('SELECT * FROM conta_bloqueada WHERE email = ?', [email]);
  if (!r) return null;
  if (new Date(r.desbloqueia_em) < new Date()) {
    await db.run('DELETE FROM conta_bloqueada WHERE email = ?', [email]);
    return null;
  }
  return r;
}

// ---------------------------------------------------------------------------
// CSRF (double-submit cookie)
// ---------------------------------------------------------------------------
const CSRF_COOKIE = 'fpl_csrf';
const CSRF_HEADER = 'x-csrf-token';

export function ensureCsrfToken(req, res, next) {
  let token = req.cookies?.[CSRF_COOKIE];
  if (!token) {
    token = crypto.randomBytes(24).toString('base64url');
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false, sameSite: 'lax', secure: config.auth.cookieSecure,
      maxAge: 8 * 3600_000, path: '/',
    });
  }
  req.csrfToken = token;
  next();
}

export function requireCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.path.startsWith('/auth/login') || req.path.startsWith('/auth/entra')) return next();
  if (req.path.startsWith('/publico/')) return next();
  const cookie = req.cookies?.[CSRF_COOKIE];
  const header = req.headers[CSRF_HEADER];
  if (!cookie || !header || cookie !== header) {
    return res.status(403).json({ error: 'CSRF token inválido ou em falta.' });
  }
  next();
}

export const CSRF_NAMES = { cookie: CSRF_COOKIE, header: CSRF_HEADER };
