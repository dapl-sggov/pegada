// routes.js — Endpoints REST. Handlers assíncronos (driver dual de BD).
// O wrapper `ah` propaga erros assíncronos para o error handler do Express.

import { Router } from 'express';
import {
  verifyPassword, signToken, setSessionCookie, clearSessionCookie,
  requireAuth, requireRole, userHasGabineteScope, autenticarUtilizador,
  setupTotp, activateTotp, disableTotp, verificarTotp,
  iniciarFederacao, consumirEstadoFederacao, loginPorNif,
} from './auth.js';
import { db } from './db.js';
import config from './config.js';
import * as fpl from './fpl.js';
import * as rtri from './rtri.js';
import * as anx from './anexos.js';
import * as notif from './notificacoes.js';
import * as cl from './consultalex.js';
import * as exp from './export.js';
import * as cmp from './comprovativo.js';
import { rateLimitLogin, registarTentativaLogin, contaBloqueada, CSRF_NAMES } from './security.js';
import { uuid, jsonStringify } from './util.js';
import { parseMultipart } from './anexos.js';

const router = Router();

// Wrapper para handlers assíncronos — encaminha rejeições para o error handler.
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Helper: carrega FPL + verifica escopo. Devolve a FPL ou termina a resposta.
async function fplComEscopo(req, res) {
  const f = await fpl.getFpl(req.params.id);
  if (!f) { res.status(404).json({ error: 'FPL não encontrada' }); return null; }
  if (!userHasGabineteScope(req.user, f.gabinete_id)) { res.status(403).json({ error: 'Sem permissão' }); return null; }
  return f;
}

// ========================= AUTH =========================
router.post('/auth/login', rateLimitLogin, ah(async (req, res) => {
  const { email, password, totp_token } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email e password obrigatórios' });
  const blq = await contaBloqueada(email);
  if (blq) {
    return res.status(423).json({ error: `Conta temporariamente bloqueada por excesso de tentativas. Desbloqueia em ${new Date(blq.desbloqueia_em).toLocaleString('pt-PT')}.` });
  }
  const u = await autenticarUtilizador(email, password);
  if (!u) {
    await registarTentativaLogin(email, req.ip, false);
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }
  if (u.totp_ativo) {
    if (!totp_token) return res.status(401).json({ error: 'Código 2FA obrigatório', requires_2fa: true });
    if (!(await verificarTotp(u.id, totp_token))) {
      await registarTentativaLogin(email, req.ip, false);
      return res.status(401).json({ error: 'Código 2FA inválido', requires_2fa: true });
    }
  }
  await registarTentativaLogin(email, req.ip, true);
  setSessionCookie(res, signToken(u));
  const papeis = await db.all('SELECT papel, gabinete_id FROM atribuicao_papel WHERE utilizador_id = ?', [u.id]);
  res.json({ id: u.id, email: u.email, nome: u.nome_completo, papeis, totp_ativo: !!u.totp_ativo });
}));

router.post('/auth/logout', (req, res) => { clearSessionCookie(res); res.json({ ok: true }); });

router.get('/auth/me', requireAuth, ah(async (req, res) => {
  const u = await db.get('SELECT totp_ativo FROM utilizador WHERE id = ?', [req.user.id]);
  res.json({
    id: req.user.id, email: req.user.email, nome: req.user.nome,
    papeis: req.user.papeis, totp_ativo: !!u?.totp_ativo, csrf_token: req.csrfToken,
  });
}));

router.get('/auth/csrf', (req, res) => res.json({ token: req.csrfToken, header: CSRF_NAMES.header }));

// ----- 2FA TOTP -----
router.post('/auth/totp/setup', requireAuth, ah(async (req, res) => res.json(await setupTotp(req.user.id))));
router.post('/auth/totp/activate', requireAuth, ah(async (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'Token TOTP obrigatório' });
  if (!(await activateTotp(req.user.id, token))) return res.status(400).json({ error: 'Token TOTP inválido — verifique o relógio do dispositivo' });
  res.json({ ok: true });
}));
router.post('/auth/totp/disable', requireAuth, ah(async (req, res) => { await disableTotp(req.user.id); res.json({ ok: true }); }));

// ----- Federação simulada -----
router.get('/auth/federacao/start', (req, res) => {
  const state = iniciarFederacao(req.query.redirect || '/');
  res.json({ state, consent_url: `/federacao-simulada.html?state=${state}` });
});
router.post('/auth/federacao/callback', ah(async (req, res) => {
  const { state, nif } = req.body || {};
  if (!consumirEstadoFederacao(state)) return res.status(400).json({ error: 'Estado de federação inválido ou expirado' });
  const u = await loginPorNif(nif);
  if (!u) return res.status(403).json({ error: 'NIF não está associado a nenhum utilizador autorizado' });
  await registarTentativaLogin(u.email, req.ip, true);
  setSessionCookie(res, signToken(u));
  const papeis = await db.all('SELECT papel, gabinete_id FROM atribuicao_papel WHERE utilizador_id = ?', [u.id]);
  res.json({ id: u.id, email: u.email, nome: u.nome_completo, papeis });
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
  const { tipo_diploma, titulo, titulo_curto, gabinete_id, coproponentes, regime_simplificado } = req.body || {};
  if (!tipo_diploma || !titulo || !gabinete_id) return res.status(400).json({ error: 'Campos obrigatórios: tipo_diploma, titulo, gabinete_id' });
  if (!userHasGabineteScope(req.user, gabinete_id)) return res.status(403).json({ error: 'Sem permissão para criar FPL para este gabinete' });
  try {
    res.status(201).json(await fpl.criarFpl({ tipo_diploma, titulo, titulo_curto, gabinete_id, coproponentes, regime_simplificado }, req.user, req));
  } catch (e) { res.status(400).json({ error: e.message }); }
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

router.post('/fpl/:id/bloco-c', requireAuth, ah(async (req, res) => {
  const f = await fplComEscopo(req, res); if (!f) return;
  try { res.status(201).json({ id: await fpl.adicionarEntradaBlocoC(req.params.id, req.body, req.user, req) }); }
  catch (e) { res.status(e.code || 400).json({ error: e.message, errors: e.errors }); }
}));

router.post('/fpl/:id/bloco-d', requireAuth, ah(async (req, res) => {
  const f = await fplComEscopo(req, res); if (!f) return;
  try { res.status(201).json({ id: await fpl.adicionarEntradaBlocoD(req.params.id, req.body, req.user, req) }); }
  catch (e) { res.status(e.code || 400).json({ error: e.message, errors: e.errors }); }
}));

router.patch('/fpl/:id/bloco-d/:eid', requireAuth, ah(async (req, res) => {
  const f = await fplComEscopo(req, res); if (!f) return;
  try { res.json(await fpl.atualizarEntradaBlocoD(req.params.id, req.params.eid, req.body, req.user, req)); }
  catch (e) { res.status(e.code || 400).json({ error: e.message, errors: e.errors }); }
}));

router.post('/fpl/:id/marcos/:marco/validar', requireAuth, ah(async (req, res) => {
  const f = await fplComEscopo(req, res); if (!f) return;
  const result = await fpl.validarMarcoFpl(req.params.id, req.params.marco, req.user, req, {
    declaracao_assinada: !!req.body?.declaracao_assinada,
    declaracao_texto: req.body?.declaracao_texto,
  });
  if (!result.ok) return res.status(422).json({ error: 'Validação falhou', pendencias: result.pendencias });
  res.json(result);
}));

// Aprovação em Conselho de Ministros (pré-condição de M5)
router.post('/fpl/:id/aprovar-cm', requireAuth, requireRole('GSEPCM', 'SGGOV_ADMIN'), ah(async (req, res) => {
  try { res.json(await fpl.aprovarEmCM(req.params.id, req.body?.referencia_dr, req.user, req)); }
  catch (e) { res.status(e.code || 400).json({ error: e.message }); }
}));

router.get('/fpl/:id/versoes', requireAuth, ah(async (req, res) => {
  const f = await fplComEscopo(req, res); if (!f) return;
  res.json(await fpl.listarVersoes(req.params.id));
}));

router.get('/fpl/:id/eventos', requireAuth, ah(async (req, res) => {
  const f = await fplComEscopo(req, res); if (!f) return;
  res.json(await fpl.listarEventos(req.params.id));
}));

// ========================= Comprovativo criptográfico =========================
router.get('/fpl/:id/comprovativos', requireAuth, ah(async (req, res) => {
  const f = await fplComEscopo(req, res); if (!f) return;
  res.json(await cmp.listarComprovativos(req.params.id));
}));

router.get('/comprovativos/:jti', requireAuth, ah(async (req, res) => {
  const c = await cmp.getComprovativo(req.params.jti);
  if (!c) return res.status(404).json({ error: 'Comprovativo não encontrado' });
  res.json(c);
}));

// Verificação de um JWS (uso de auditoria — a verificação corrente do
// SmartLegis é offline e não chama este endpoint).
router.post('/comprovativos/verificar', requireAuth, ah(async (req, res) => {
  const { jws } = req.body || {};
  if (!jws) return res.status(400).json({ error: 'Campo "jws" obrigatório' });
  res.json(await cmp.verificarComprovativo(jws));
}));

// JWKS — chaves públicas consumidas pelo SmartLegis (público, só leitura)
router.get('/.well-known/fpl-jwks.json', ah(async (req, res) => {
  res.json(await cmp.getJwks());
}));

// ========================= Anexos =========================
router.get('/fpl/:id/anexos', requireAuth, ah(async (req, res) => {
  const f = await fplComEscopo(req, res); if (!f) return;
  res.json(await anx.listarAnexos(req.params.id, req.query.bloco));
}));

router.post('/fpl/:id/anexos', requireAuth, ah(async (req, res) => {
  const f = await fplComEscopo(req, res); if (!f) return;
  try {
    const { fields, files } = await parseMultipart(req);
    res.status(201).json(await anx.uploadAnexo({
      fplId: req.params.id, bloco: fields.bloco || 'D', entradaId: fields.entrada_id || null,
      visibilidade: fields.visibilidade || 'INTERNO', file: files[0], user: req.user,
    }));
  } catch (e) { res.status(e.code || 400).json({ error: e.message }); }
}));

router.get('/anexos/:aid', requireAuth, ah(async (req, res) => {
  const a = await anx.getAnexo(req.params.aid);
  if (!a) return res.status(404).json({ error: 'Anexo não encontrado' });
  const f = await fpl.getFpl(a.fpl_id);
  const isPublic = a.visibilidade === 'PUBLICO' && f?.estado_workflow === 'PUBLICADO';
  if (!isPublic && !userHasGabineteScope(req.user, f?.gabinete_id)) return res.status(403).json({ error: 'Sem permissão' });
  await anx.streamAnexo(a, res);
}));

router.delete('/anexos/:aid', requireAuth, ah(async (req, res) => {
  const a = await anx.getAnexo(req.params.aid);
  if (!a) return res.status(404).json({ error: 'Anexo não encontrado' });
  const f = await fpl.getFpl(a.fpl_id);
  if (!userHasGabineteScope(req.user, f?.gabinete_id)) return res.status(403).json({ error: 'Sem permissão' });
  try { res.json(await anx.eliminarAnexo(req.params.aid, req.user)); }
  catch (e) { res.status(e.code || 400).json({ error: e.message }); }
}));

// ========================= RTRI =========================
router.get('/rtri/entidades', requireAuth, ah(async (req, res) => {
  res.json(await rtri.pesquisarRtri(req.query.q || '', parseInt(req.query.limit || '10', 10)));
}));
router.get('/rtri/entidades/all', requireAuth, ah(async (req, res) => res.json(await rtri.listarTodas())));
router.get('/rtri/entidades/:rtriId', requireAuth, ah(async (req, res) => {
  const e = await rtri.obterEntidade(req.params.rtriId);
  if (!e) return res.status(404).json({ error: 'Não encontrada' });
  res.json(e);
}));
router.post('/rtri/sincronizar', requireAuth, requireRole('SGGOV_ADMIN', 'SGGOV_QA'), ah(async (req, res) => {
  res.json(await rtri.sincronizarRtri());
}));

// ========================= Auditoria QA =========================
router.post('/fpl/:id/auditoria', requireAuth, requireRole('SGGOV_QA', 'SGGOV_ADMIN'), ah(async (req, res) => {
  const f = await fpl.getFpl(req.params.id);
  if (!f) return res.status(404).json({ error: 'FPL não encontrada' });
  const { pontuacao, observacoes, pedido_correcao, descricao_correcao } = req.body || {};
  if (typeof pontuacao !== 'number' || pontuacao < 0 || pontuacao > 100) {
    return res.status(400).json({ error: 'Pontuação 0-100 obrigatória' });
  }
  const id = uuid();
  await db.run(
    `INSERT INTO auditoria_qa (id, fpl_id, auditor_id, pontuacao, observacoes, pedido_correcao, descricao_correcao)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, req.params.id, req.user.id, pontuacao, observacoes || null, pedido_correcao ? 1 : 0, descricao_correcao || null]
  );
  await db.run(
    `INSERT INTO evento_auditoria (id, fpl_id, tipo_evento, autor_id, payload, ip_origem, user_agent)
     VALUES (?, ?, 'AUDITORIA_QA_CRIADA', ?, ?, ?, ?)`,
    [uuid(), req.params.id, req.user.id, jsonStringify({ pontuacao, pedido_correcao: !!pedido_correcao }),
     req.ip || null, req.headers['user-agent'] || null]
  );
  const dest = await notif.destinatariosGabinete(f.gabinete_id);
  if (pedido_correcao) {
    await db.run("UPDATE fpl SET estado_workflow = 'EM_REVISAO_QA' WHERE id = ?", [req.params.id]);
    // os comprovativos válidos passam a SUBSTITUIDO — a FPL terá de ser revalidada
    await cmp.substituirComprovativosFpl(req.params.id, 'Pedido de correção da auditoria SGGOV');
    await notif.notificar({ tipo: 'AUDITORIA_PEDIDO_CORRECAO', destinatarios: dest, fpl: f, ctx: { pontuacao, descricao: descricao_correcao || '(sem descrição)' } });
  } else {
    await notif.notificar({ tipo: 'AUDITORIA_CONCLUIDA', destinatarios: dest, fpl: f, ctx: { pontuacao } });
  }
  res.status(201).json({ id });
}));

router.patch('/fpl/:id/auditoria/:aid', requireAuth, ah(async (req, res) => {
  const f = await fpl.getFpl(req.params.id);
  if (!f) return res.status(404).json({ error: 'FPL não encontrada' });
  const a = await db.get('SELECT * FROM auditoria_qa WHERE id = ? AND fpl_id = ?', [req.params.aid, req.params.id]);
  if (!a) return res.status(404).json({ error: 'Auditoria não encontrada' });
  const isQa = req.user.papeis.some(p => ['SGGOV_QA', 'SGGOV_ADMIN'].includes(p.papel));
  const isOwner = userHasGabineteScope(req.user, f.gabinete_id);
  const { estado_correcao } = req.body || {};
  if (estado_correcao === 'EM_CURSO' && isOwner) {
    await db.run("UPDATE auditoria_qa SET estado_correcao = 'EM_CURSO' WHERE id = ?", [req.params.aid]);
    await db.run(`INSERT INTO evento_auditoria (id, fpl_id, tipo_evento, autor_id, payload) VALUES (?, ?, 'CORRECAO_INICIADA', ?, ?)`,
      [uuid(), req.params.id, req.user.id, jsonStringify({ auditoria_id: req.params.aid })]);
  } else if (estado_correcao === 'SUBMETIDA' && isOwner) {
    await db.run("UPDATE auditoria_qa SET estado_correcao = 'SUBMETIDA' WHERE id = ?", [req.params.aid]);
    await db.run("UPDATE fpl SET estado_workflow = 'EM_RSE' WHERE id = ? AND estado_workflow = 'EM_REVISAO_QA'", [req.params.id]);
    await notif.notificar({ tipo: 'CORRECAO_SUBMETIDA', destinatarios: await notif.destinatariosPorPapel('SGGOV_QA'), fpl: f });
  } else if (estado_correcao === 'CONCLUIDA' && isQa) {
    await db.run("UPDATE auditoria_qa SET estado_correcao = 'CONCLUIDA' WHERE id = ?", [req.params.aid]);
    await db.run("UPDATE fpl SET estado_workflow = 'EM_RSE' WHERE id = ? AND estado_workflow = 'EM_REVISAO_QA'", [req.params.id]);
    await db.run(`INSERT INTO evento_auditoria (id, fpl_id, tipo_evento, autor_id, payload) VALUES (?, ?, 'CORRECAO_APROVADA', ?, ?)`,
      [uuid(), req.params.id, req.user.id, jsonStringify({ auditoria_id: req.params.aid })]);
  } else {
    return res.status(400).json({ error: 'Operação não permitida com o seu papel' });
  }
  res.json({ ok: true });
}));

router.get('/fpl/:id/auditoria', requireAuth, ah(async (req, res) => {
  const f = await fpl.getFpl(req.params.id);
  if (!f) return res.status(404).json({ error: 'FPL não encontrada' });
  const isSggov = req.user.papeis.some(p => ['SGGOV_QA', 'SGGOV_ADMIN'].includes(p.papel));
  if (!isSggov && !userHasGabineteScope(req.user, f.gabinete_id)) return res.status(403).json({ error: 'Sem permissão' });
  res.json(await db.all(
    `SELECT a.*, u.nome_completo as auditor_nome FROM auditoria_qa a JOIN utilizador u ON u.id = a.auditor_id
     WHERE a.fpl_id = ? ORDER BY a.data_auditoria DESC`, [req.params.id]
  ));
}));

// ========================= Notificações =========================
router.get('/notificacoes', requireAuth, ah(async (req, res) => {
  res.json({
    items: await notif.listarMinhas(req.user.id, { limit: 50 }),
    nao_lidas: await notif.contarNaoLidas(req.user.id),
  });
}));
router.post('/notificacoes/:id/lida', requireAuth, ah(async (req, res) => { await notif.marcarLida(req.params.id, req.user.id); res.json({ ok: true }); }));
router.post('/notificacoes/lidas-todas', requireAuth, ah(async (req, res) => { await notif.marcarTodasLidas(req.user.id); res.json({ ok: true }); }));
router.get('/admin/outbox', requireAuth, requireRole('SGGOV_ADMIN'), ah(async (req, res) => res.json(await notif.listarOutbox({ limit: 200 }))));
router.post('/admin/outbox/processar', requireAuth, requireRole('SGGOV_ADMIN'), ah(async (req, res) => res.json({ enviados: await notif.processarOutbox() })));

// ========================= Webhook Consulta.Lex =========================
router.post('/hooks/consulta-lex', ah((req, res) => cl.processarWebhook(req, res)));
router.post('/fpl/:id/consulta-lex/import-csv', requireAuth, ah(async (req, res) => {
  const f = await fplComEscopo(req, res); if (!f) return;
  const { cl_ref, csv } = req.body || {};
  if (!cl_ref || !csv) return res.status(400).json({ error: 'cl_ref e csv obrigatórios' });
  try { res.json(await cl.importarCsv(req.params.id, cl_ref, csv, req.user)); }
  catch (e) { res.status(e.code || 400).json({ error: e.message }); }
}));
router.get('/fpl/:id/contributos-cl', requireAuth, ah(async (req, res) => {
  const f = await fplComEscopo(req, res); if (!f) return;
  res.json(await cl.listarContributos(req.params.id));
}));

// ========================= Exportação p/ Portal do Governo =========================
// (acessível a partir da RING, por papéis SGGOV — a app não serve a face pública)
router.get('/export/fpl', requireAuth, requireRole('SGGOV_ADMIN', 'SGGOV_QA', 'GSEPCM'), ah(async (req, res) => {
  res.json(await exp.listarPublicadas({ gabinete: req.query.gabinete, tipo: req.query.tipo, q: req.query.q }));
}));
router.get('/export/fpl/:id', requireAuth, requireRole('SGGOV_ADMIN', 'SGGOV_QA', 'GSEPCM'), ah(async (req, res) => {
  const p = await exp.pacoteFpl(req.params.id);
  if (!p) return res.status(404).json({ error: 'FPL não encontrada ou ainda não publicada' });
  res.json(p);
}));
router.get('/export/lote', requireAuth, requireRole('SGGOV_ADMIN', 'SGGOV_QA', 'GSEPCM'), ah(async (req, res) => {
  res.json(await exp.loteDesde(req.query.desde || null));
}));
router.get('/export/datasets/fpl.json', requireAuth, requireRole('SGGOV_ADMIN', 'SGGOV_QA', 'GSEPCM'), ah(async (req, res) => {
  res.json(await exp.datasetJson());
}));
router.get('/export/datasets/fpl.csv', requireAuth, requireRole('SGGOV_ADMIN', 'SGGOV_QA', 'GSEPCM'), ah(async (req, res) => {
  res.type('text/csv').send(await exp.datasetCsv());
}));
router.get('/export/datasets/fpl.jsonld', requireAuth, requireRole('SGGOV_ADMIN', 'SGGOV_QA', 'GSEPCM'), ah(async (req, res) => {
  res.json(await exp.datasetJsonLd());
}));

// ========================= Dashboard SGGOV =========================
router.get('/admin/dashboard', requireAuth, requireRole('SGGOV_QA', 'SGGOV_ADMIN', 'GSEPCM'), ah(async (req, res) => {
  const total = (await db.get('SELECT COUNT(*) as n FROM fpl')).n;
  const por_estado = await db.all('SELECT estado_workflow as estado, COUNT(*) as n FROM fpl GROUP BY estado_workflow');
  const publicadas = (await db.get("SELECT COUNT(*) as n FROM fpl WHERE estado_workflow = 'PUBLICADO'")).n;
  const em_revisao = (await db.get("SELECT COUNT(*) as n FROM fpl WHERE estado_workflow = 'EM_REVISAO_QA'")).n;
  const comprovativos = (await db.get('SELECT COUNT(*) as n FROM comprovativo')).n;
  const top_gabinetes = await db.all(
    `SELECT g.sigla, COUNT(f.id) as n FROM fpl f JOIN gabinete g ON g.id = f.gabinete_id GROUP BY g.sigla ORDER BY n DESC LIMIT 5`
  );
  const top_entidades = await db.all(
    `SELECT entidade_designacao as entidade, rtri_id, COUNT(*) as n FROM entrada_bloco_d
     WHERE entidade_designacao IS NOT NULL GROUP BY entidade_designacao, rtri_id ORDER BY n DESC LIMIT 10`
  );
  const aud = await db.get('SELECT AVG(pontuacao) as m, COUNT(*) as n FROM auditoria_qa');
  res.json({
    total, publicadas, em_revisao, comprovativos, por_estado, top_gabinetes, top_entidades,
    auditorias: { media: aud?.m || 0, total: aud?.n || 0 },
  });
}));

export default router;
