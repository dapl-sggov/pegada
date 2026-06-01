// routes.js — Endpoints REST mínimos.

import { Router } from 'express';
import config from './config.js';
import { db } from './db.js';
import {
  loginMock, entraStartUrl, entraCallback, logout,
  requireAuth, requireRole, userHasGabineteScope,
} from './auth.js';
import * as fpl from './fpl.js';
import * as anx from './anexos.js';
import * as canon from './canonico.js';
import { gerarFichaPublica } from './ficha_publica.js';
import { correrBackup } from './backup.js';
import { rateLimitLogin, registarTentativaLogin, contaBloqueada, CSRF_NAMES } from './security.js';
import { uuid } from './util.js';

const router = Router();
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

async function fplComEscopo(req, res) {
  const f = await fpl.getFpl(req.params.id);
  if (!f) { res.status(404).json({ error: 'FPL não encontrada' }); return null; }
  if (!userHasGabineteScope(req.user, f.gabinete_id)) {
    res.status(403).json({ error: 'Sem permissão' }); return null;
  }
  return f;
}

// ========================= AUTH =========================
router.post('/auth/login', rateLimitLogin, ah(async (req, res) => {
  const { email } = req.body || {};
  if (config.auth.driver !== 'mock') {
    return res.status(400).json({ error: 'Login direto disponível apenas em modo mock. Use /auth/entra/start.' });
  }
  const blq = await contaBloqueada((email || '').toLowerCase());
  if (blq) return res.status(423).json({ error: `Conta bloqueada. Desbloqueia em ${new Date(blq.desbloqueia_em).toLocaleString('pt-PT')}.` });
  const r = await loginMock(email, req, res);
  if (r.erro) {
    await registarTentativaLogin((email || '').toLowerCase(), req.ip, false);
    return res.status(r.status).json({ error: r.erro });
  }
  await registarTentativaLogin(email.toLowerCase(), req.ip, true);
  res.json(r.utilizador);
}));

router.post('/auth/logout', ah(async (req, res) => {
  await logout(req, res);
  res.json({ ok: true });
}));

router.get('/auth/me', requireAuth, ah(async (req, res) => {
  res.json({
    id: req.user.id, email: req.user.email, nome: req.user.nome,
    papeis: req.user.papeis, csrf_token: req.csrfToken,
    auth_driver: config.auth.driver,
  });
}));

router.get('/auth/csrf', (req, res) => res.json({ token: req.csrfToken, header: CSRF_NAMES.header }));

// Entra ID (stub)
router.get('/auth/entra/start', (req, res) => {
  const state = uuid();
  const url = entraStartUrl(state);
  if (!url) return res.status(503).json({ error: 'Entra ID não configurado.' });
  // Em produção, persistir o state numa cookie httpOnly curta para validação no callback.
  res.cookie('fpl_entra_state', state, { httpOnly: true, sameSite: 'lax', maxAge: 5 * 60_000, secure: config.auth.cookieSecure });
  res.redirect(url);
});

router.get('/auth/entra/callback', ah(async (req, res) => {
  try {
    await entraCallback(req.query.code, req.query.state, req, res);
    res.redirect('/');
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
}));

// ========================= Gabinetes =========================
router.get('/gabinetes', ah(async (req, res) => {
  res.json(await db.all('SELECT id, sigla, nome FROM gabinete WHERE ativo = 1 ORDER BY sigla'));
}));

// ========================= FPL =========================
router.get('/fpl', requireAuth, ah(async (req, res) => {
  const isSggov = req.user.papeis.some(p => ['SGGOV_ADMIN', 'SGGOV_QA', 'GSEPCM'].includes(p.papel));
  let gabinete_id = req.query.gabinete_id || null;
  if (!isSggov) gabinete_id = req.user.papeis.find(p => p.gabinete_id)?.gabinete_id || '__none__';
  res.json(await fpl.listarFpl({
    gabinete_id, estado: req.query.estado, q: req.query.q,
    page: parseInt(req.query.page || '1', 10), perPage: parseInt(req.query.perPage || '50', 10),
  }));
}));

router.post('/fpl', requireAuth, ah(async (req, res) => {
  const { tipo_diploma, titulo, titulo_curto, gabinete_id, coproponentes } = req.body || {};
  if (!tipo_diploma || !titulo || !gabinete_id) return res.status(400).json({ error: 'tipo_diploma, titulo, gabinete_id obrigatórios' });
  if (!userHasGabineteScope(req.user, gabinete_id)) return res.status(403).json({ error: 'Sem permissão para este gabinete' });
  res.status(201).json(await fpl.criarFpl({ tipo_diploma, titulo, titulo_curto, gabinete_id, coproponentes }, req.user, req));
}));

router.get('/fpl/:id', requireAuth, ah(async (req, res) => {
  const f = await fplComEscopo(req, res); if (!f) return;
  res.json(f);
}));

router.patch('/fpl/:id/bloco-b', requireAuth, ah(async (req, res) => {
  const f = await fplComEscopo(req, res); if (!f) return;
  res.json(await fpl.atualizarBlocoB(req.params.id, req.body || {}, req.user, req));
}));

router.patch('/fpl/:id/bloco-e', requireAuth, ah(async (req, res) => {
  const f = await fplComEscopo(req, res); if (!f) return;
  res.json(await fpl.atualizarBlocoE(req.params.id, req.body || {}, req.user, req));
}));

// Audições (D.1 + D.2)
router.post('/fpl/:id/audicoes', requireAuth, ah(async (req, res) => {
  const f = await fplComEscopo(req, res); if (!f) return;
  try { res.status(201).json({ id: await fpl.adicionarAudicao(req.params.id, req.body, req.user, req) }); }
  catch (e) { res.status(e.code || 400).json({ error: e.message, errors: e.errors }); }
}));

router.patch('/fpl/:id/audicoes/:aid', requireAuth, ah(async (req, res) => {
  const f = await fplComEscopo(req, res); if (!f) return;
  try { res.json(await fpl.atualizarAudicao(req.params.id, req.params.aid, req.body, req.user, req)); }
  catch (e) { res.status(e.code || 400).json({ error: e.message, errors: e.errors }); }
}));

router.delete('/fpl/:id/audicoes/:aid', requireAuth, ah(async (req, res) => {
  const f = await fplComEscopo(req, res); if (!f) return;
  try { res.json(await fpl.eliminarAudicao(req.params.id, req.params.aid, req.user, req)); }
  catch (e) { res.status(e.code || 400).json({ error: e.message }); }
}));

// D.3 — Ingestão JSON INTEGRA
router.post('/fpl/:id/integra', requireAuth, ah(async (req, res) => {
  const f = await fplComEscopo(req, res); if (!f) return;
  try { res.json(await fpl.ingerirIntegra(req.params.id, req.body, req.user, req)); }
  catch (e) { res.status(e.code || 400).json({ error: e.message }); }
}));

// Marcos
router.post('/fpl/:id/marcos/:marco/validar', requireAuth, ah(async (req, res) => {
  const f = await fplComEscopo(req, res); if (!f) return;
  const r = await fpl.validarMarcoFpl(req.params.id, req.params.marco, req.user, req);
  if (!r.ok) return res.status(422).json({ error: 'Validação falhou', pendencias: r.pendencias });
  res.json(r);
}));

router.post('/fpl/:id/aprovar-cm', requireAuth, requireRole('GSEPCM', 'SGGOV_ADMIN'), ah(async (req, res) => {
  try { res.json(await fpl.aprovarEmCM(req.params.id, req.body?.referencia_dr, req.user, req)); }
  catch (e) { res.status(e.code || 400).json({ error: e.message }); }
}));

router.post('/fpl/:id/correcao', requireAuth, requireRole('SGGOV_QA', 'SGGOV_ADMIN'), ah(async (req, res) => {
  res.json(await fpl.pedirCorrecao(req.params.id, req.body || {}, req.user, req));
}));

// Versões e eventos
router.get('/fpl/:id/versoes', requireAuth, ah(async (req, res) => {
  const f = await fplComEscopo(req, res); if (!f) return;
  res.json(await fpl.listarVersoes(req.params.id));
}));
router.get('/fpl/:id/versoes/:vid', requireAuth, ah(async (req, res) => {
  const f = await fplComEscopo(req, res); if (!f) return;
  const v = await fpl.getVersao(req.params.id, req.params.vid);
  if (!v) return res.status(404).json({ error: 'Versão não encontrada' });
  res.json(v);
}));
router.get('/fpl/:id/eventos', requireAuth, ah(async (req, res) => {
  const f = await fplComEscopo(req, res); if (!f) return;
  res.json(await fpl.listarEventos(req.params.id));
}));

// ========================= Anexos =========================
router.get('/fpl/:id/anexos', requireAuth, ah(async (req, res) => {
  const f = await fplComEscopo(req, res); if (!f) return;
  res.json(await anx.listarAnexos(req.params.id, req.query.bloco));
}));
router.post('/fpl/:id/anexos', requireAuth, ah(async (req, res) => {
  const f = await fplComEscopo(req, res); if (!f) return;
  try {
    const { fields, files } = await anx.parseMultipart(req);
    res.status(201).json(await anx.uploadAnexo({
      fplId: req.params.id, bloco: fields.bloco || null, entradaId: fields.entrada_id || null,
      file: files[0], user: req.user,
    }));
  } catch (e) { res.status(e.code || 400).json({ error: e.message }); }
}));
router.get('/anexos/:aid', requireAuth, ah(async (req, res) => {
  const a = await anx.getAnexo(req.params.aid);
  if (!a) return res.status(404).json({ error: 'Não encontrado' });
  const f = await fpl.getFpl(a.fpl_id);
  if (!userHasGabineteScope(req.user, f?.gabinete_id)) return res.status(403).json({ error: 'Sem permissão' });
  await anx.streamAnexo(a, res);
}));
router.delete('/anexos/:aid', requireAuth, ah(async (req, res) => {
  const a = await anx.getAnexo(req.params.aid);
  if (!a) return res.status(404).json({ error: 'Não encontrado' });
  const f = await fpl.getFpl(a.fpl_id);
  if (!userHasGabineteScope(req.user, f?.gabinete_id)) return res.status(403).json({ error: 'Sem permissão' });
  res.json(await anx.eliminarAnexo(req.params.aid));
}));

// ========================= JSON canónico / Ficha pública =========================
router.get('/fpl/:id/canonico', requireAuth, ah(async (req, res) => {
  const f = await fplComEscopo(req, res); if (!f) return;
  const c = await canon.toCanonico(req.params.id);
  res.json(c);
}));

router.get('/fpl/:id/ficha-publica', requireAuth, ah(async (req, res) => {
  const f = await fplComEscopo(req, res); if (!f) return;
  const html = await gerarFichaPublica(req.params.id);
  res.type('html').send(html);
}));

// Versão pública (sem autenticação) — apenas para FPLs PUBLICADAS.
router.get('/publico/ficha/:id', ah(async (req, res) => {
  const f = await fpl.getFpl(req.params.id);
  if (!f || f.estado !== 'PUBLICADO') return res.status(404).type('html').send('<h1>Ficha não publicada.</h1>');
  res.type('html').send(await gerarFichaPublica(req.params.id));
}));

router.get('/export/canonicos', requireAuth, requireRole('SGGOV_ADMIN', 'SGGOV_QA', 'GSEPCM'), ah(async (req, res) => {
  res.json(await canon.listarCanonicos({
    estado: req.query.estado, gabinete_id: req.query.gabinete_id, desde: req.query.desde,
  }));
}));

router.post('/import/canonico', requireAuth, requireRole('SGGOV_ADMIN'), ah(async (req, res) => {
  try { res.json(await canon.fromCanonico(req.body, req.user)); }
  catch (e) { res.status(400).json({ error: e.message }); }
}));

// ========================= Dashboard =========================
router.get('/admin/dashboard', requireAuth, requireRole('SGGOV_QA', 'SGGOV_ADMIN', 'GSEPCM'), ah(async (req, res) => {
  const total = (await db.get('SELECT COUNT(*) as n FROM fpl')).n;
  const por_estado = await db.all('SELECT estado, COUNT(*) as n FROM fpl GROUP BY estado');
  const top_gabinetes = await db.all(
    `SELECT g.id, g.sigla, COUNT(f.id) as n FROM fpl f JOIN gabinete g ON g.id = f.gabinete_id
     GROUP BY g.id, g.sigla ORDER BY n DESC LIMIT 8`
  );
  res.json({ total, por_estado, top_gabinetes });
}));

// ========================= Backup manual =========================
router.post('/admin/backup', requireAuth, requireRole('SGGOV_ADMIN'), ah(async (req, res) => {
  res.json(await correrBackup());
}));

export default router;
