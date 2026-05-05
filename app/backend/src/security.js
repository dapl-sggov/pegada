// Hardening de segurança: rate limiting, CSRF (double-submit cookie),
// security headers (Helmet-like), bloqueio de conta após N falhas.

import crypto from 'node:crypto';
import { db } from './db.js';

// Cria tabelas de segurança
export function initSecurity() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tentativa_login (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      ip TEXT,
      sucesso INTEGER NOT NULL,
      timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_tentativa_email_ts ON tentativa_login(email, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_tentativa_ip_ts ON tentativa_login(ip, timestamp DESC);

    CREATE TABLE IF NOT EXISTS conta_bloqueada (
      email TEXT PRIMARY KEY,
      bloqueada_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      desbloqueia_em TEXT NOT NULL,
      motivo TEXT
    );
  `);
}

// ============ Security headers ============
export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  // CSP: bloqueia inline scripts (excepto módulos próprios), restringe origens
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'", // inline styles necessários para alguns componentes
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; '));
  // HSTS — só ativar em produção sob TLS
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

// ============ Rate limit (in-memory) ============
const buckets = new Map();
function rl(key, max, windowMs) {
  const now = Date.now();
  const bucket = buckets.get(key) || { hits: [], blocked_until: 0 };
  if (bucket.blocked_until > now) return { allowed: false, retryAfter: Math.ceil((bucket.blocked_until - now) / 1000) };
  bucket.hits = bucket.hits.filter(t => now - t < windowMs);
  bucket.hits.push(now);
  if (bucket.hits.length > max) {
    bucket.blocked_until = now + windowMs;
    buckets.set(key, bucket);
    return { allowed: false, retryAfter: Math.ceil(windowMs / 1000) };
  }
  buckets.set(key, bucket);
  return { allowed: true };
}

export function rateLimit({ max = 100, windowMs = 60_000, keyFn = req => req.ip }) {
  return (req, res, next) => {
    const r = rl(keyFn(req), max, windowMs);
    if (!r.allowed) {
      res.setHeader('Retry-After', String(r.retryAfter));
      return res.status(429).json({ error: 'Demasiados pedidos. Tente novamente em breve.', retry_after_s: r.retryAfter });
    }
    next();
  };
}

// Rate limit específico para login (mais agressivo + por email)
export function rateLimitLogin(req, res, next) {
  const email = (req.body?.email || '').toLowerCase();
  const ipKey = 'login:ip:' + req.ip;
  const emailKey = 'login:email:' + email;
  const r1 = rl(ipKey, 20, 5 * 60_000); // 20 / 5min por IP
  const r2 = rl(emailKey, 5, 5 * 60_000); // 5 / 5min por email
  if (!r1.allowed || !r2.allowed) {
    return res.status(429).json({ error: 'Demasiadas tentativas. Tente novamente em 5 minutos.' });
  }
  next();
}

// ============ Tentativas + bloqueio de conta ============
const MAX_LOGIN_FAILS = 8;
const LOCK_MINUTES = 30;

export function registarTentativaLogin(email, ip, sucesso) {
  db.prepare('INSERT INTO tentativa_login (email, ip, sucesso) VALUES (?, ?, ?)').run(email, ip || null, sucesso ? 1 : 0);
  // Limpa antigas (>7 dias)
  db.prepare("DELETE FROM tentativa_login WHERE timestamp < datetime('now','-7 days')").run();
  if (sucesso) {
    // limpa bloqueio se existir
    db.prepare('DELETE FROM conta_bloqueada WHERE email = ?').run(email);
    return;
  }
  // Conta falhas recentes
  const fails = db.prepare(`
    SELECT COUNT(*) as n FROM tentativa_login
    WHERE email = ? AND sucesso = 0 AND timestamp > datetime('now','-30 minutes')
  `).get(email).n;
  if (fails >= MAX_LOGIN_FAILS) {
    const desbloqueia = new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString();
    db.prepare(`
      INSERT OR REPLACE INTO conta_bloqueada (email, desbloqueia_em, motivo)
      VALUES (?, ?, ?)
    `).run(email, desbloqueia, `${MAX_LOGIN_FAILS} tentativas falhadas em 30 min`);
  }
}

export function contaBloqueada(email) {
  const r = db.prepare('SELECT * FROM conta_bloqueada WHERE email = ?').get(email);
  if (!r) return null;
  if (new Date(r.desbloqueia_em) < new Date()) {
    db.prepare('DELETE FROM conta_bloqueada WHERE email = ?').run(email);
    return null;
  }
  return r;
}

// ============ CSRF (double-submit cookie) ============
const CSRF_COOKIE = 'fpl_csrf';
const CSRF_HEADER = 'x-csrf-token';

export function ensureCsrfToken(req, res, next) {
  let token = req.cookies?.[CSRF_COOKIE];
  if (!token) {
    token = crypto.randomBytes(24).toString('base64url');
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false, // tem de ser legível pelo JS para ser enviado no header
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 8 * 60 * 60 * 1000,
      path: '/',
    });
  }
  req.csrfToken = token;
  next();
}

export function requireCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  // Login + endpoints públicos: dispensa
  if (req.path.startsWith('/auth/login')) return next();
  if (req.path.startsWith('/publico/')) return next();
  // hooks externos têm autenticação por chave (separada)
  if (req.path.startsWith('/hooks/')) return next();
  const cookie = req.cookies?.[CSRF_COOKIE];
  const header = req.headers[CSRF_HEADER];
  if (!cookie || !header || cookie !== header) {
    return res.status(403).json({ error: 'CSRF token inválido ou em falta. Recarregue a página.' });
  }
  next();
}

export const CSRF_NAMES = { cookie: CSRF_COOKIE, header: CSRF_HEADER };
