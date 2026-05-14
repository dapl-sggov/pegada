// security.js — Hardening: rate limiting (via cache partilhada), CSRF
// (double-submit cookie), security headers, bloqueio de conta após N falhas.
// API assíncrona; rate-limit usa Redis em produção (in-memory em dev).

import crypto from 'node:crypto';
import { db, cutoffISO } from './db.js';
import { cache } from './cache.js';
import config from './config.js';
import { uuid } from './util.js';

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------
export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:", "font-src 'self' data:", "connect-src 'self'",
    "frame-ancestors 'none'", "form-action 'self'", "base-uri 'self'", "object-src 'none'",
  ].join('; '));
  if (config.isProd) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

// ---------------------------------------------------------------------------
// Rate limiting — contadores na cache partilhada (Redis ou in-memory)
// ---------------------------------------------------------------------------
async function hit(key, max, windowSec) {
  const n = await cache.incr('rl:' + key, windowSec);
  if (n > max) {
    const ttl = await cache.ttl('rl:' + key);
    return { allowed: false, retryAfter: ttl > 0 ? ttl : windowSec };
  }
  return { allowed: true };
}

export function rateLimit({ max = 100, windowMs = 60_000, keyFn = req => req.ip }) {
  const windowSec = Math.ceil(windowMs / 1000);
  return async (req, res, next) => {
    try {
      const r = await hit(keyFn(req), max, windowSec);
      if (!r.allowed) {
        res.setHeader('Retry-After', String(r.retryAfter));
        return res.status(429).json({ error: 'Demasiados pedidos. Tente novamente em breve.', retry_after_s: r.retryAfter });
      }
    } catch { /* cache indisponível: não bloqueia o serviço */ }
    next();
  };
}

export async function rateLimitLogin(req, res, next) {
  try {
    const email = (req.body?.email || '').toLowerCase();
    const r1 = await hit('login:ip:' + req.ip, 20, 300);
    const r2 = await hit('login:email:' + email, 5, 300);
    if (!r1.allowed || !r2.allowed) {
      return res.status(429).json({ error: 'Demasiadas tentativas. Tente novamente em 5 minutos.' });
    }
  } catch { /* idem */ }
  next();
}

// ---------------------------------------------------------------------------
// Tentativas de login + bloqueio de conta
// ---------------------------------------------------------------------------
const MAX_LOGIN_FAILS = 8;
const LOCK_MINUTES = 30;

export async function registarTentativaLogin(email, ip, sucesso) {
  await db.run(
    'INSERT INTO tentativa_login (id, email, ip, sucesso) VALUES (?, ?, ?, ?)',
    [uuid(), email, ip || null, sucesso ? 1 : 0]
  );
  // limpa antigas (retenção configurável)
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
      [email, desbloqueia, `${MAX_LOGIN_FAILS} tentativas falhadas em 30 min`]
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
      maxAge: 8 * 60 * 60 * 1000, path: '/',
    });
  }
  req.csrfToken = token;
  next();
}

export function requireCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.path.startsWith('/auth/login')) return next();
  if (req.path.startsWith('/publico/')) return next();
  if (req.path.startsWith('/export/')) return next(); // leitura por papéis SGGOV
  if (req.path.startsWith('/hooks/')) return next();   // autenticação por chave própria
  const cookie = req.cookies?.[CSRF_COOKIE];
  const header = req.headers[CSRF_HEADER];
  if (!cookie || !header || cookie !== header) {
    return res.status(403).json({ error: 'CSRF token inválido ou em falta. Recarregue a página.' });
  }
  next();
}

export const CSRF_NAMES = { cookie: CSRF_COOKIE, header: CSRF_HEADER };
