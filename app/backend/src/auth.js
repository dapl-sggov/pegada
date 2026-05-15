// auth.js — Autenticação, sessões e RBAC.
//
// Modelo de duas camadas (Memorando Executivo, Princípio 1 · RCM v2 n.º 11.1):
//   1. acesso à RING mediado por VPN (fora do âmbito desta aplicação)
//   2. autenticação aplicacional contra o diretório interno dos serviços
//
// O adapter de diretório tem dois drivers (config.auth.diretorio.driver):
//   • local — utilizadores na base de dados, password bcrypt (dev/protótipo)
//   • ldap  — diretório real (LDAP/AD) — a ativar em produção, sem refactor
//
// API assíncrona (driver dual SQLite/PostgreSQL).

import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { db } from './db.js';
import config from './config.js';
import { uuid } from './util.js';
import { generateSecret, totpUri, verifyTotp } from './totp.js';
import { autenticarDiretorio, sincronizarUtilizador } from './diretorio.js';
import { hashPassword, verifyPassword } from './auth-helpers.js';

export { hashPassword, verifyPassword };

const JWT_SECRET = config.auth.jwtSecret;
const JWT_TTL = config.auth.jwtTtl;
const COOKIE_NAME = config.auth.cookieName;

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, nome: user.nome_completo },
    JWT_SECRET, { expiresIn: JWT_TTL }
  );
}
export function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true, sameSite: 'lax', secure: config.auth.cookieSecure,
    maxAge: 8 * 60 * 60 * 1000, path: '/',
  });
}
export function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

async function getUserPapeis(userId) {
  return db.all('SELECT papel, gabinete_id FROM atribuicao_papel WHERE utilizador_id = ?', [userId]);
}

// ---------------------------------------------------------------------------
// Adapter de diretório interno
// ---------------------------------------------------------------------------
/**
 * Autentica um utilizador. Devolve o registo de utilizador ou null.
 * Driver `local`: valida a password (bcrypt) contra a base de dados.
 * Driver `ldap`: valida contra o diretório interno e sincroniza o utilizador
 *   local (provisionamento "just-in-time"). Implementação a ligar quando o
 *   acesso ao diretório estiver disponível — a interface não muda.
 */
export async function autenticarUtilizador(email, password) {
  const dirUser = await autenticarDiretorio(email, password);
  if (!dirUser) return null;
  // No driver `local` o registo já existe — sincronizarUtilizador é idempotente.
  // Nos drivers `ldap`/`http` faz provisionamento just-in-time + papéis.
  return sincronizarUtilizador(dirUser);
}

// ---------------------------------------------------------------------------
// Middlewares
// ---------------------------------------------------------------------------
export async function authMiddleware(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return next();
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const u = await db.get('SELECT id, email, nome_completo, ativo FROM utilizador WHERE id = ?', [payload.sub]);
    if (u && u.ativo) {
      req.user = {
        id: u.id, email: u.email, nome: u.nome_completo,
        papeis: await getUserPapeis(u.id),
      };
    }
  } catch {
    // token inválido/expirado: segue como anónimo
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

export function userHasGabineteScope(user, gabineteId) {
  if (!user) return false;
  if (user.papeis.some(p => ['SGGOV_ADMIN', 'SGGOV_QA', 'GSEPCM'].includes(p.papel))) return true;
  return user.papeis.some(p => p.gabinete_id === gabineteId);
}

// ---------------------------------------------------------------------------
// Gestão de utilizadores (usada pelo seed)
// ---------------------------------------------------------------------------
export async function createUser({ email, nome_completo, password, nif }) {
  const id = uuid();
  const hash = await hashPassword(password);
  await db.run(
    'INSERT INTO utilizador (id, email, nome_completo, password_hash, nif) VALUES (?, ?, ?, ?, ?)',
    [id, email, nome_completo, hash, nif || null]
  );
  return id;
}
export async function assignRole(userId, papel, gabineteId = null) {
  await db.run(
    `INSERT INTO atribuicao_papel (utilizador_id, papel, gabinete_id)
     VALUES (?, ?, ?) ON CONFLICT DO NOTHING`,
    [userId, papel, gabineteId]
  );
}

// ---------------------------------------------------------------------------
// TOTP (2FA) — obrigatório para papéis sensíveis (config.auth.totpRequiredRoles)
// ---------------------------------------------------------------------------
export async function setupTotp(userId) {
  const secret = generateSecret();
  await db.run('UPDATE utilizador SET totp_secret = ?, totp_ativo = 0 WHERE id = ?', [secret, userId]);
  const u = await db.get('SELECT email FROM utilizador WHERE id = ?', [userId]);
  return { secret, uri: totpUri(u.email, 'FPL Ponte', secret) };
}
export async function activateTotp(userId, token) {
  const u = await db.get('SELECT totp_secret FROM utilizador WHERE id = ?', [userId]);
  if (!u?.totp_secret || !verifyTotp(u.totp_secret, token)) return false;
  await db.run('UPDATE utilizador SET totp_ativo = 1 WHERE id = ?', [userId]);
  return true;
}
export async function disableTotp(userId) {
  await db.run('UPDATE utilizador SET totp_secret = NULL, totp_ativo = 0 WHERE id = ?', [userId]);
}
export async function verificarTotp(userId, token) {
  const u = await db.get('SELECT totp_secret, totp_ativo FROM utilizador WHERE id = ?', [userId]);
  if (!u?.totp_ativo || !u.totp_secret) return false;
  return verifyTotp(u.totp_secret, token);
}

// ---------------------------------------------------------------------------
// Federação simulada (mantida para compatibilidade com o frontend v0.2;
// na arquitetura definitiva, a autenticação é via diretório interno + VPN)
// ---------------------------------------------------------------------------
const federacaoStates = new Map();
export function iniciarFederacao(redirectTo = '/') {
  const state = crypto.randomBytes(16).toString('hex');
  federacaoStates.set(state, { ts: Date.now(), redirectTo });
  for (const [k, v] of federacaoStates) if (Date.now() - v.ts > 5 * 60_000) federacaoStates.delete(k);
  return state;
}
export function consumirEstadoFederacao(state) {
  const r = federacaoStates.get(state);
  if (!r) return null;
  federacaoStates.delete(state);
  return (Date.now() - r.ts > 5 * 60_000) ? null : r;
}
export async function loginPorNif(nif) {
  return db.get('SELECT * FROM utilizador WHERE nif = ? AND ativo = 1', [nif]) || null;
}

export { COOKIE_NAME };
