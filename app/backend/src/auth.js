// auth.js — Autenticação.
//
// Dois drivers:
//
//   • mock   — DEV. Fluxo /api/auth/login com email simples; lê o utilizador
//              da tabela `utilizador` (populada pelo seed). Sem password.
//              Adequado para correr o sistema em desenvolvimento e demos.
//
//   • entra  — PRODUÇÃO. OIDC/OAuth2 contra Entra ID (Microsoft 365 do
//              Governo). Stub: a UnIT/DSTD têm de fornecer tenantId,
//              clientId, clientSecret, redirectUri. Quando isso estiver
//              em mão, basta preencher loginEntra() abaixo.
//
// Em ambos os modos, a sessão é representada por um cookie httpOnly com um
// ID aleatório que aponta para uma linha em `sessao`. Sem JWT.

import crypto from 'node:crypto';
import { db } from './db.js';
import config from './config.js';
import { uuid, nowISO } from './util.js';

const COOKIE = config.auth.cookieName;

// ---------------------------------------------------------------------------
// Gestão de sessão (cookie + tabela)
// ---------------------------------------------------------------------------
async function criarSessao(userId, req) {
  const id = crypto.randomBytes(24).toString('base64url');
  const expira = new Date(Date.now() + config.auth.sessionTtlHours * 3600_000).toISOString();
  await db.run(
    `INSERT INTO sessao (id, utilizador_id, criada_em, expira_em, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, userId, nowISO(), expira, req?.ip || null, req?.headers?.['user-agent'] || null]
  );
  return id;
}

export function setSessionCookie(res, sid) {
  res.cookie(COOKIE, sid, {
    httpOnly: true, sameSite: 'lax', secure: config.auth.cookieSecure,
    maxAge: config.auth.sessionTtlHours * 3600_000, path: '/',
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

async function getUserPapeis(userId) {
  return db.all('SELECT papel, gabinete_id FROM atribuicao_papel WHERE utilizador_id = ?', [userId]);
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
export async function authMiddleware(req, res, next) {
  const sid = req.cookies?.[COOKIE];
  if (!sid) return next();
  try {
    const s = await db.get('SELECT * FROM sessao WHERE id = ?', [sid]);
    if (s && new Date(s.expira_em) > new Date()) {
      const u = await db.get('SELECT id, email, nome_completo, ativo FROM utilizador WHERE id = ?', [s.utilizador_id]);
      if (u && u.ativo) {
        req.user = {
          id: u.id, email: u.email, nome: u.nome_completo,
          papeis: await getUserPapeis(u.id),
        };
        req._sid = sid;
      }
    } else if (s) {
      await db.run('DELETE FROM sessao WHERE id = ?', [sid]);
    }
  } catch {
    // sessão inválida — segue como anónimo
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
    if (!has) return res.status(403).json({ error: 'Sem permissão', papeis_requeridos: allowed });
    next();
  };
}

export function userHasGabineteScope(user, gabineteId) {
  if (!user) return false;
  if (user.papeis.some(p => ['SGGOV_ADMIN', 'SGGOV_QA', 'GSEPCM'].includes(p.papel))) return true;
  return user.papeis.some(p => p.gabinete_id === gabineteId);
}

// ---------------------------------------------------------------------------
// Driver `mock` — login DEV/demo
// ---------------------------------------------------------------------------
export async function loginMock(email, req, res) {
  if (!email) return { erro: 'Email obrigatório', status: 400 };
  const u = await db.get('SELECT * FROM utilizador WHERE email = ? AND ativo = 1', [email.toLowerCase()]);
  if (!u) return { erro: 'Utilizador desconhecido (mock)', status: 401 };
  const sid = await criarSessao(u.id, req);
  setSessionCookie(res, sid);
  const papeis = await getUserPapeis(u.id);
  return {
    utilizador: { id: u.id, email: u.email, nome: u.nome_completo, papeis },
  };
}

// ---------------------------------------------------------------------------
// Driver `entra` — OIDC/Microsoft 365 do Governo (STUB)
// ---------------------------------------------------------------------------
//
// Fluxo completo a implementar quando a DSTD fornecer:
//   • ENTRA_TENANT_ID     — tenant gov.pt
//   • ENTRA_CLIENT_ID     — clientId da aplicação registada
//   • ENTRA_CLIENT_SECRET — secret (preferível: credential certificate)
//   • ENTRA_REDIRECT_URI  — URI registada (https://<host>/auth/entra/callback)
//
// O fluxo será o standard OIDC Authorization Code:
//   1. GET /auth/entra/start  → redirect para login.microsoftonline.com
//   2. callback                → troca code por tokens, valida id_token,
//                                provisiona utilizador local just-in-time,
//                                atribui papéis por mapping (config.auth.entra.adminMap)
//                                ou pelo domínio do email (@maen.gov.pt → PONTO_FOCAL)
//   3. cria sessão            → setSessionCookie e redirect para /
//
// Por agora os endpoints existem e devolvem 501 — quando os parâmetros
// estiverem prontos, esta função é preenchida e o endpoint passa a funcionar.

export function entraStartUrl(state) {
  const e = config.auth.entra;
  if (!e.tenantId || !e.clientId) return null;
  const params = new URLSearchParams({
    client_id: e.clientId,
    response_type: 'code',
    redirect_uri: e.redirectUri,
    response_mode: 'query',
    scope: 'openid profile email User.Read',
    state,
  });
  return `https://login.microsoftonline.com/${e.tenantId}/oauth2/v2.0/authorize?${params}`;
}

export async function entraCallback(/* code, state, req, res */) {
  // TODO: trocar code por tokens via POST a /oauth2/v2.0/token, validar
  // id_token JWT (kid/JWKS), extrair email/nome, provisionar utilizador,
  // criar sessão. Stub deliberado.
  throw Object.assign(
    new Error('Integração Entra ID por finalizar — aguardar config DSTD.'),
    { status: 501 }
  );
}

// ---------------------------------------------------------------------------
// Provisionamento JIT (usado pelo entraCallback quando estiver pronto)
// ---------------------------------------------------------------------------
export async function provisionarUtilizador({ email, nome }) {
  email = String(email).toLowerCase();
  let u = await db.get('SELECT * FROM utilizador WHERE email = ?', [email]);
  if (!u) {
    const id = uuid();
    await db.run(
      `INSERT INTO utilizador (id, email, nome_completo, ativo) VALUES (?, ?, ?, 1)`,
      [id, email, nome || email]
    );
    u = await db.get('SELECT * FROM utilizador WHERE id = ?', [id]);
    // Atribui papel inicial pelo mapping ou pelo domínio
    const papel = papelInicialParaEmail(email);
    if (papel) {
      await db.run(
        `INSERT INTO atribuicao_papel (utilizador_id, papel, gabinete_id) VALUES (?, ?, ?)
         ON CONFLICT DO NOTHING`,
        [u.id, papel.papel, papel.gabinete_id]
      );
    }
  }
  return u;
}

async function papelInicialParaEmail(email) {
  // 1) Mapping explícito em ENTRA_ADMIN_MAP
  const map = (config.auth.entra.adminMap || '').split(';').map(s => s.trim()).filter(Boolean);
  for (const item of map) {
    const [mail, papel] = item.split(':').map(s => s?.trim());
    if (mail && papel && mail.toLowerCase() === email) {
      return { papel, gabinete_id: null };
    }
  }
  // 2) Por domínio: @<sigla>.gov.pt → PONTO_FOCAL desse gabinete
  const m = email.match(/^[^@]+@([a-z]+)\.gov\.pt$/i);
  if (m) {
    const sigla = m[1].toLowerCase();
    const gab = await db.get('SELECT id FROM gabinete WHERE LOWER(sigla) = ?', [sigla]);
    if (gab) return { papel: 'PONTO_FOCAL', gabinete_id: gab.id };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------
export async function logout(req, res) {
  if (req._sid) await db.run('DELETE FROM sessao WHERE id = ?', [req._sid]);
  clearSessionCookie(res);
}

export { COOKIE as COOKIE_NAME };
