import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { db } from './db.js';
import { uuid } from './util.js';
import { generateSecret, totpUri, verifyTotp } from './totp.js';

const JWT_SECRET = process.env.JWT_SECRET || 'demo-fpl-ponte-jwt-secret-change-in-prod';
const JWT_TTL = '8h';
const COOKIE_NAME = 'fpl_session';

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, nome: user.nome_completo },
    JWT_SECRET,
    { expiresIn: JWT_TTL }
  );
}

export function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // true in production behind TLS
    maxAge: 8 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

function getUserPapeis(userId) {
  return db
    .prepare('SELECT papel, gabinete_id FROM atribuicao_papel WHERE utilizador_id = ?')
    .all(userId);
}

export function authMiddleware(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return next();
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const u = db.prepare('SELECT id, email, nome_completo, ativo FROM utilizador WHERE id = ?').get(payload.sub);
    if (!u || !u.ativo) return next();
    req.user = {
      id: u.id,
      email: u.email,
      nome: u.nome_completo,
      papeis: getUserPapeis(u.id),
    };
  } catch {
    // invalid token: ignore
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
  next();
}

export function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
    const has = req.user.papeis.some(p => allowed.includes(p.papel));
    if (!has) return res.status(403).json({ error: 'Sem permissão para esta operação', papeis_requeridos: allowed });
    next();
  };
}

// helper: check if user has access to a given gabinete
export function userHasGabineteScope(user, gabineteId) {
  if (!user) return false;
  // SGGOV roles see everything
  if (user.papeis.some(p => ['SGGOV_ADMIN', 'SGGOV_QA', 'GSEPCM'].includes(p.papel))) return true;
  // Ponto focal scoped
  return user.papeis.some(p => p.gabinete_id === gabineteId);
}

export async function createUser({ email, nome_completo, password, nif }) {
  const id = uuid();
  const hash = await hashPassword(password);
  db.prepare(`
    INSERT INTO utilizador (id, email, nome_completo, password_hash, nif)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, email, nome_completo, hash, nif || null);
  return id;
}

export function assignRole(userId, papel, gabineteId = null) {
  db.prepare(`
    INSERT OR IGNORE INTO atribuicao_papel (utilizador_id, papel, gabinete_id)
    VALUES (?, ?, ?)
  `).run(userId, papel, gabineteId);
}

// ============ TOTP (2FA) ============
export function setupTotp(userId) {
  const secret = generateSecret();
  db.prepare('UPDATE utilizador SET totp_secret = ?, totp_ativo = 0 WHERE id = ?').run(secret, userId);
  const u = db.prepare('SELECT email FROM utilizador WHERE id = ?').get(userId);
  const uri = totpUri(u.email, 'FPL Ponte', secret);
  return { secret, uri };
}

export function activateTotp(userId, token) {
  const u = db.prepare('SELECT totp_secret FROM utilizador WHERE id = ?').get(userId);
  if (!u?.totp_secret) return false;
  if (!verifyTotp(u.totp_secret, token)) return false;
  db.prepare('UPDATE utilizador SET totp_ativo = 1 WHERE id = ?').run(userId);
  return true;
}

export function disableTotp(userId) {
  db.prepare('UPDATE utilizador SET totp_secret = NULL, totp_ativo = 0 WHERE id = ?').run(userId);
}

export function verificarTotp(userId, token) {
  const u = db.prepare('SELECT totp_secret, totp_ativo FROM utilizador WHERE id = ?').get(userId);
  if (!u?.totp_ativo || !u.totp_secret) return false;
  return verifyTotp(u.totp_secret, token);
}

// ============ Federação simulada (autenticação.gov.pt-like) ============
// Numa implementação real, isto seria OIDC com a AMA. Aqui simulamos um fluxo:
// 1. Utilizador clica em "Entrar com Cartão de Cidadão" → redireciona para /api/auth/cmd/start
// 2. Gera-se um state token e devolve-se para uma página simulada de "consentimento"
// 3. Página simulada confirma → /api/auth/cmd/callback?state=...&nif=...&nome=...
// 4. Mapeia-se NIF para utilizador local; se não existir, recusa.

const federacaoStates = new Map(); // state → { ts, redirectTo }

export function iniciarFederacao(redirectTo = '/') {
  const state = crypto.randomBytes(16).toString('hex');
  federacaoStates.set(state, { ts: Date.now(), redirectTo });
  // limpar antigos
  for (const [k, v] of federacaoStates) {
    if (Date.now() - v.ts > 5 * 60_000) federacaoStates.delete(k);
  }
  return state;
}

export function consumirEstadoFederacao(state) {
  const r = federacaoStates.get(state);
  if (!r) return null;
  federacaoStates.delete(state);
  if (Date.now() - r.ts > 5 * 60_000) return null;
  return r;
}

export function loginPorNif(nif) {
  const u = db.prepare('SELECT * FROM utilizador WHERE nif = ? AND ativo = 1').get(nif);
  return u || null;
}

export { COOKIE_NAME };
