import { Router } from 'express';
import {
  hashPassword, verifyPassword, signToken, setSessionCookie, clearSessionCookie,
  authMiddleware, requireAuth, requireRole, userHasGabineteScope, COOKIE_NAME,
  setupTotp, activateTotp, disableTotp, verificarTotp,
  iniciarFederacao, consumirEstadoFederacao, loginPorNif,
} from './auth.js';
import { db } from './db.js';
import * as fpl from './fpl.js';
import * as rtri from './rtri.js';
import * as anx from './anexos.js';
import * as notif from './notificacoes.js';
import * as cl from './consultalex.js';
import {
  rateLimitLogin, registarTentativaLogin, contaBloqueada, CSRF_NAMES,
} from './security.js';
import { uuid, jsonStringify, safeJsonParse } from './util.js';
import { parseMultipart } from './anexos.js';

const router = Router();

// ========== AUTH ==========
router.post('/auth/login', rateLimitLogin, async (req, res) => {
  const { email, password, totp_token } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email e password obrigatórios' });
  const blq = contaBloqueada(email);
  if (blq) {
    return res.status(423).json({ error: `Conta temporariamente bloqueada por excesso de tentativas. Desbloqueia em ${new Date(blq.desbloqueia_em).toLocaleString('pt-PT')}.` });
  }
  const u = db.prepare('SELECT * FROM utilizador WHERE email = ? AND ativo = 1').get(email);
  if (!u) {
    registarTentativaLogin(email, req.ip, false);
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }
  const ok = await verifyPassword(password, u.password_hash);
  if (!ok) {
    registarTentativaLogin(email, req.ip, false);
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }
  if (u.totp_ativo) {
    if (!totp_token) {
      return res.status(401).json({ error: 'Código 2FA obrigatório', requires_2fa: true });
    }
    if (!verificarTotp(u.id, totp_token)) {
      registarTentativaLogin(email, req.ip, false);
      return res.status(401).json({ error: 'Código 2FA inválido', requires_2fa: true });
    }
  }
  registarTentativaLogin(email, req.ip, true);
  const token = signToken(u);
  setSessionCookie(res, token);
  const papeis = db.prepare('SELECT papel, gabinete_id FROM atribuicao_papel WHERE utilizador_id = ?').all(u.id);
  res.json({ id: u.id, email: u.email, nome: u.nome_completo, papeis, totp_ativo: !!u.totp_ativo });
});

router.post('/auth/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/auth/me', requireAuth, (req, res) => {
  const u = db.prepare('SELECT totp_ativo FROM utilizador WHERE id = ?').get(req.user.id);
  res.json({
    id: req.user.id, email: req.user.email, nome: req.user.nome,
    papeis: req.user.papeis, totp_ativo: !!u?.totp_ativo,
    csrf_token: req.csrfToken,
  });
});

// CSRF token endpoint (público — para o frontend obter o token logo no boot)
router.get('/auth/csrf', (req, res) => {
  res.json({ token: req.csrfToken, header: CSRF_NAMES.header });
});

// ----- 2FA TOTP -----
router.post('/auth/totp/setup', requireAuth, (req, res) => {
  const { secret, uri } = setupTotp(req.user.id);
  res.json({ secret, uri });
});

router.post('/auth/totp/activate', requireAuth, (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'Token TOTP obrigatório' });
  const ok = activateTotp(req.user.id, token);
  if (!ok) return res.status(400).json({ error: 'Token TOTP inválido — verifique o relógio do dispositivo' });
  res.json({ ok: true });
});

router.post('/auth/totp/disable', requireAuth, (req, res) => {
  disableTotp(req.user.id);
  res.json({ ok: true });
});

// ----- Federação simulada (autenticação.gov.pt) -----
router.get('/auth/federacao/start', (req, res) => {
  const state = iniciarFederacao(req.query.redirect || '/');
  // Em produção: redirect para o IdP. Aqui devolvemos URL para a página simulada.
  res.json({
    state,
    consent_url: `/federacao-simulada.html?state=${state}`,
  });
});

router.post('/auth/federacao/callback', async (req, res) => {
  const { state, nif } = req.body || {};
  const stateData = consumirEstadoFederacao(state);
  if (!stateData) return res.status(400).json({ error: 'Estado de federação inválido ou expirado' });
  const u = loginPorNif(nif);
  if (!u) return res.status(403).json({ error: 'NIF não está associado a nenhum utilizador autorizado da FPL Ponte' });
  registarTentativaLogin(u.email, req.ip, true);
  const token = signToken(u);
  setSessionCookie(res, token);
  const papeis = db.prepare('SELECT papel, gabinete_id FROM atribuicao_papel WHERE utilizador_id = ?').all(u.id);
  res.json({ id: u.id, email: u.email, nome: u.nome_completo, papeis });
});

// ========== Gabinetes ==========
router.get('/gabinetes', (req, res) => {
  res.json(db.prepare('SELECT id, sigla, nome FROM gabinete WHERE ativo = 1 ORDER BY sigla').all());
});

// ========== FPL ==========
router.get('/fpl', requireAuth, (req, res) => {
  const isSggov = req.user.papeis.some(p => ['SGGOV_ADMIN', 'SGGOV_QA', 'GSEPCM'].includes(p.papel));
  let gabinete_id = req.query.gabinete_id || null;
  if (!isSggov) {
    const myGab = req.user.papeis.find(p => p.gabinete_id)?.gabinete_id;
    gabinete_id = myGab || '__none__';
  }
  res.json(fpl.listarFpl({
    gabinete_id, estado: req.query.estado, q: req.query.q,
    page: parseInt(req.query.page || '1', 10),
    perPage: parseInt(req.query.perPage || '50', 10),
  }));
});

router.post('/fpl', requireAuth, (req, res) => {
  const { tipo_diploma, titulo, titulo_curto, gabinete_id, coproponentes, regime_simplificado } = req.body || {};
  if (!tipo_diploma || !titulo || !gabinete_id) return res.status(400).json({ error: 'Campos obrigatórios: tipo_diploma, titulo, gabinete_id' });
  if (!userHasGabineteScope(req.user, gabinete_id)) return res.status(403).json({ error: 'Sem permissão para criar FPL para este gabinete' });
  try {
    const f = fpl.criarFpl({ tipo_diploma, titulo, titulo_curto, gabinete_id, coproponentes, regime_simplificado }, req.user, req);
    res.status(201).json(f);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/fpl/:id', requireAuth, (req, res) => {
  const f = fpl.getFpl(req.params.id);
  if (!f) return res.status(404).json({ error: 'FPL não encontrada' });
  if (!userHasGabineteScope(req.user, f.gabinete_id)) return res.status(403).json({ error: 'Sem permissão' });
  res.json(f);
});

router.patch('/fpl/:id/bloco-b', requireAuth, (req, res) => {
  const f = fpl.getFpl(req.params.id);
  if (!f) return res.status(404).json({ error: 'FPL não encontrada' });
  if (!userHasGabineteScope(req.user, f.gabinete_id)) return res.status(403).json({ error: 'Sem permissão' });
  res.json(fpl.atualizarBlocoB(req.params.id, req.body || {}, req.user, req));
});

router.patch('/fpl/:id/bloco-e', requireAuth, (req, res) => {
  const f = fpl.getFpl(req.params.id);
  if (!f) return res.status(404).json({ error: 'FPL não encontrada' });
  if (!userHasGabineteScope(req.user, f.gabinete_id)) return res.status(403).json({ error: 'Sem permissão' });
  res.json(fpl.atualizarBlocoE(req.params.id, req.body || {}, req.user, req));
});

router.post('/fpl/:id/bloco-c', requireAuth, (req, res) => {
  const f = fpl.getFpl(req.params.id);
  if (!f) return res.status(404).json({ error: 'FPL não encontrada' });
  if (!userHasGabineteScope(req.user, f.gabinete_id)) return res.status(403).json({ error: 'Sem permissão' });
  try {
    const id = fpl.adicionarEntradaBlocoC(req.params.id, req.body, req.user, req);
    res.status(201).json({ id });
  } catch (e) { res.status(e.code || 400).json({ error: e.message, errors: e.errors }); }
});

router.post('/fpl/:id/bloco-d', requireAuth, (req, res) => {
  const f = fpl.getFpl(req.params.id);
  if (!f) return res.status(404).json({ error: 'FPL não encontrada' });
  if (!userHasGabineteScope(req.user, f.gabinete_id)) return res.status(403).json({ error: 'Sem permissão' });
  try {
    const id = fpl.adicionarEntradaBlocoD(req.params.id, req.body, req.user, req);
    res.status(201).json({ id });
  } catch (e) { res.status(e.code || 400).json({ error: e.message, errors: e.errors }); }
});

router.patch('/fpl/:id/bloco-d/:eid', requireAuth, (req, res) => {
  const f = fpl.getFpl(req.params.id);
  if (!f) return res.status(404).json({ error: 'FPL não encontrada' });
  if (!userHasGabineteScope(req.user, f.gabinete_id)) return res.status(403).json({ error: 'Sem permissão' });
  try {
    const e = fpl.atualizarEntradaBlocoD(req.params.id, req.params.eid, req.body, req.user, req);
    res.json(e);
  } catch (e) { res.status(e.code || 400).json({ error: e.message, errors: e.errors }); }
});

router.post('/fpl/:id/marcos/:marco/validar', requireAuth, (req, res) => {
  const f = fpl.getFpl(req.params.id);
  if (!f) return res.status(404).json({ error: 'FPL não encontrada' });
  if (!userHasGabineteScope(req.user, f.gabinete_id)) return res.status(403).json({ error: 'Sem permissão' });
  const result = fpl.validarMarcoFpl(req.params.id, req.params.marco, req.user, req, {
    declaracao_assinada: !!req.body?.declaracao_assinada,
    declaracao_texto: req.body?.declaracao_texto,
  });
  if (!result.ok) return res.status(422).json({ error: 'Validação falhou', pendencias: result.pendencias });
  res.json(result);
});

router.get('/fpl/:id/versoes', requireAuth, (req, res) => {
  const f = fpl.getFpl(req.params.id);
  if (!f) return res.status(404).json({ error: 'FPL não encontrada' });
  if (!userHasGabineteScope(req.user, f.gabinete_id)) return res.status(403).json({ error: 'Sem permissão' });
  res.json(fpl.listarVersoes(req.params.id));
});

router.get('/fpl/:id/eventos', requireAuth, (req, res) => {
  const f = fpl.getFpl(req.params.id);
  if (!f) return res.status(404).json({ error: 'FPL não encontrada' });
  if (!userHasGabineteScope(req.user, f.gabinete_id)) return res.status(403).json({ error: 'Sem permissão' });
  res.json(fpl.listarEventos(req.params.id));
});

// ========== Anexos ==========
router.get('/fpl/:id/anexos', requireAuth, (req, res) => {
  const f = fpl.getFpl(req.params.id);
  if (!f) return res.status(404).json({ error: 'FPL não encontrada' });
  if (!userHasGabineteScope(req.user, f.gabinete_id)) return res.status(403).json({ error: 'Sem permissão' });
  res.json(anx.listarAnexos(req.params.id, req.query.bloco));
});

router.post('/fpl/:id/anexos', requireAuth, async (req, res) => {
  const f = fpl.getFpl(req.params.id);
  if (!f) return res.status(404).json({ error: 'FPL não encontrada' });
  if (!userHasGabineteScope(req.user, f.gabinete_id)) return res.status(403).json({ error: 'Sem permissão' });
  try {
    const { fields, files } = await parseMultipart(req);
    const file = files[0];
    const result = await anx.uploadAnexo({
      fplId: req.params.id,
      bloco: fields.bloco || 'D',
      entradaId: fields.entrada_id || null,
      visibilidade: fields.visibilidade || 'INTERNO',
      file,
      user: req.user,
    });
    res.status(201).json(result);
  } catch (e) {
    res.status(e.code || 400).json({ error: e.message });
  }
});

router.get('/anexos/:aid', requireAuth, (req, res) => {
  const a = anx.getAnexo(req.params.aid);
  if (!a) return res.status(404).json({ error: 'Anexo não encontrado' });
  const f = fpl.getFpl(a.fpl_id);
  // visibilidade: se PUBLICO e fpl PUBLICADA, qualquer pessoa pode; senão, só com escopo
  const isPublic = a.visibilidade === 'PUBLICO' && f?.estado_workflow === 'PUBLICADO';
  if (!isPublic && !userHasGabineteScope(req.user, f.gabinete_id)) {
    return res.status(403).json({ error: 'Sem permissão' });
  }
  anx.streamAnexo(a, res);
});

router.delete('/anexos/:aid', requireAuth, (req, res) => {
  const a = anx.getAnexo(req.params.aid);
  if (!a) return res.status(404).json({ error: 'Anexo não encontrado' });
  const f = fpl.getFpl(a.fpl_id);
  if (!userHasGabineteScope(req.user, f.gabinete_id)) return res.status(403).json({ error: 'Sem permissão' });
  try { res.json(anx.eliminarAnexo(req.params.aid, req.user)); }
  catch (e) { res.status(e.code || 400).json({ error: e.message }); }
});

// ========== RTRI ==========
router.get('/rtri/entidades', requireAuth, (req, res) => {
  res.json(rtri.pesquisarRtri(req.query.q || '', parseInt(req.query.limit || '10', 10)));
});
router.get('/rtri/entidades/all', requireAuth, (req, res) => res.json(rtri.listarTodas()));
router.get('/rtri/entidades/:rtriId', requireAuth, (req, res) => {
  const e = rtri.obterEntidade(req.params.rtriId);
  if (!e) return res.status(404).json({ error: 'Não encontrada' });
  res.json(e);
});

// ========== Auditoria QA ==========
router.post('/fpl/:id/auditoria', requireAuth, requireRole('SGGOV_QA', 'SGGOV_ADMIN'), (req, res) => {
  const f = fpl.getFpl(req.params.id);
  if (!f) return res.status(404).json({ error: 'FPL não encontrada' });
  const { pontuacao, observacoes, pedido_correcao, descricao_correcao } = req.body || {};
  if (typeof pontuacao !== 'number' || pontuacao < 0 || pontuacao > 100) {
    return res.status(400).json({ error: 'Pontuação 0-100 obrigatória' });
  }
  const id = uuid();
  db.prepare(`
    INSERT INTO auditoria_qa (id, fpl_id, auditor_id, pontuacao, observacoes, pedido_correcao, descricao_correcao)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.params.id, req.user.id, pontuacao, observacoes || null,
    pedido_correcao ? 1 : 0, descricao_correcao || null);
  // Audit log
  db.prepare(`
    INSERT INTO evento_auditoria (id, fpl_id, tipo_evento, autor_id, payload, ip_origem, user_agent)
    VALUES (?, ?, 'AUDITORIA_QA_CRIADA', ?, ?, ?, ?)
  `).run(uuid(), req.params.id, req.user.id,
    jsonStringify({ pontuacao, pedido_correcao: !!pedido_correcao }),
    req.ip || null, req.headers['user-agent'] || null);
  // Notifica pontos focais do gabinete
  const dest = notif.destinatariosGabinete(f.gabinete_id);
  if (pedido_correcao) {
    db.prepare("UPDATE fpl SET estado_workflow = 'EM_REVISAO_QA' WHERE id = ?").run(req.params.id);
    notif.notificar({
      tipo: 'AUDITORIA_PEDIDO_CORRECAO',
      destinatarios: dest,
      fpl: f,
      ctx: { pontuacao, descricao: descricao_correcao || '(sem descrição)' },
    });
  } else {
    notif.notificar({
      tipo: 'AUDITORIA_CONCLUIDA',
      destinatarios: dest,
      fpl: f,
      ctx: { pontuacao },
    });
  }
  res.status(201).json({ id });
});

router.patch('/fpl/:id/auditoria/:aid', requireAuth, (req, res) => {
  const f = fpl.getFpl(req.params.id);
  if (!f) return res.status(404).json({ error: 'FPL não encontrada' });
  const a = db.prepare('SELECT * FROM auditoria_qa WHERE id = ? AND fpl_id = ?').get(req.params.aid, req.params.id);
  if (!a) return res.status(404).json({ error: 'Auditoria não encontrada' });
  const isQa = req.user.papeis.some(p => ['SGGOV_QA', 'SGGOV_ADMIN'].includes(p.papel));
  const isOwner = userHasGabineteScope(req.user, f.gabinete_id);
  const { estado_correcao, observacoes_pf } = req.body || {};
  // Ponto focal: pode marcar como "EM_CURSO" e adicionar nota
  // SGGOV: pode marcar como "CONCLUIDA"
  if (estado_correcao === 'EM_CURSO' && isOwner) {
    db.prepare(`UPDATE auditoria_qa SET estado_correcao = 'EM_CURSO' WHERE id = ?`).run(req.params.aid);
    db.prepare(`
      INSERT INTO evento_auditoria (id, fpl_id, tipo_evento, autor_id, payload)
      VALUES (?, ?, 'CORRECAO_INICIADA', ?, ?)
    `).run(uuid(), req.params.id, req.user.id, jsonStringify({ auditoria_id: req.params.aid }));
  } else if (estado_correcao === 'SUBMETIDA' && isOwner) {
    // PF resubmete depois de corrigir
    db.prepare(`UPDATE auditoria_qa SET estado_correcao = 'SUBMETIDA' WHERE id = ?`).run(req.params.aid);
    // estado FPL volta ao anterior — assumimos EM_RSE como heurística
    db.prepare(`UPDATE fpl SET estado_workflow = 'EM_RSE' WHERE id = ? AND estado_workflow = 'EM_REVISAO_QA'`).run(req.params.id);
    notif.notificar({
      tipo: 'CORRECAO_SUBMETIDA',
      destinatarios: notif.destinatariosPorPapel('SGGOV_QA'),
      fpl: f,
    });
  } else if (estado_correcao === 'CONCLUIDA' && isQa) {
    db.prepare(`UPDATE auditoria_qa SET estado_correcao = 'CONCLUIDA' WHERE id = ?`).run(req.params.aid);
    db.prepare(`UPDATE fpl SET estado_workflow = 'EM_RSE' WHERE id = ? AND estado_workflow = 'EM_REVISAO_QA'`).run(req.params.id);
    db.prepare(`
      INSERT INTO evento_auditoria (id, fpl_id, tipo_evento, autor_id, payload)
      VALUES (?, ?, 'CORRECAO_APROVADA', ?, ?)
    `).run(uuid(), req.params.id, req.user.id, jsonStringify({ auditoria_id: req.params.aid }));
  } else {
    return res.status(400).json({ error: 'Operação não permitida com o seu papel' });
  }
  res.json({ ok: true });
});

router.get('/fpl/:id/auditoria', requireAuth, (req, res) => {
  const f = fpl.getFpl(req.params.id);
  if (!f) return res.status(404).json({ error: 'FPL não encontrada' });
  const isSggov = req.user.papeis.some(p => ['SGGOV_QA', 'SGGOV_ADMIN'].includes(p.papel));
  const isOwner = userHasGabineteScope(req.user, f.gabinete_id);
  if (!isSggov && !isOwner) return res.status(403).json({ error: 'Sem permissão' });
  res.json(db.prepare(`
    SELECT a.*, u.nome_completo as auditor_nome
    FROM auditoria_qa a JOIN utilizador u ON u.id = a.auditor_id
    WHERE a.fpl_id = ? ORDER BY a.data_auditoria DESC
  `).all(req.params.id));
});

// ========== Notificações (utilizador autenticado) ==========
router.get('/notificacoes', requireAuth, (req, res) => {
  res.json({
    items: notif.listarMinhas(req.user.id, { limit: 50 }),
    nao_lidas: notif.contarNaoLidas(req.user.id),
  });
});

router.post('/notificacoes/:id/lida', requireAuth, (req, res) => {
  notif.marcarLida(req.params.id, req.user.id);
  res.json({ ok: true });
});

router.post('/notificacoes/lidas-todas', requireAuth, (req, res) => {
  notif.marcarTodasLidas(req.user.id);
  res.json({ ok: true });
});

router.get('/admin/outbox', requireAuth, requireRole('SGGOV_ADMIN'), (req, res) => {
  res.json(notif.listarOutbox({ limit: 200 }));
});

router.post('/admin/outbox/processar', requireAuth, requireRole('SGGOV_ADMIN'), (req, res) => {
  res.json({ enviados: notif.processarOutbox() });
});

// ========== Webhook Consulta.Lex ==========
router.post('/hooks/consulta-lex', (req, res) => cl.processarWebhook(req, res));

router.post('/fpl/:id/consulta-lex/import-csv', requireAuth, async (req, res) => {
  const f = fpl.getFpl(req.params.id);
  if (!f) return res.status(404).json({ error: 'FPL não encontrada' });
  if (!userHasGabineteScope(req.user, f.gabinete_id)) return res.status(403).json({ error: 'Sem permissão' });
  const { cl_ref, csv } = req.body || {};
  if (!cl_ref || !csv) return res.status(400).json({ error: 'cl_ref e csv obrigatórios' });
  try {
    const r = cl.importarCsv(req.params.id, cl_ref, csv, req.user);
    res.json(r);
  } catch (e) { res.status(e.code || 400).json({ error: e.message }); }
});

router.get('/fpl/:id/contributos-cl', requireAuth, (req, res) => {
  const f = fpl.getFpl(req.params.id);
  if (!f) return res.status(404).json({ error: 'FPL não encontrada' });
  if (!userHasGabineteScope(req.user, f.gabinete_id)) return res.status(403).json({ error: 'Sem permissão' });
  res.json(cl.listarContributos(req.params.id));
});

// ========== PORTAL PÚBLICO ==========
router.get('/publico/fpl', (req, res) => {
  let sql = `
    SELECT f.id, f.numero_processo, f.tipo_diploma, f.titulo, f.titulo_curto,
           f.referencia_dr, f.data_publicacao, f.tipo_origem, f.sintese_problema,
           g.sigla as gabinete_sigla, g.nome as gabinete_nome
    FROM fpl f JOIN gabinete g ON g.id = f.gabinete_id
    WHERE f.estado_workflow = 'PUBLICADO'
  `;
  const params = [];
  if (req.query.gabinete) { sql += ' AND g.sigla = ?'; params.push(req.query.gabinete); }
  if (req.query.tipo) { sql += ' AND f.tipo_diploma = ?'; params.push(req.query.tipo); }
  if (req.query.q) { sql += ' AND (f.titulo LIKE ? OR f.numero_processo LIKE ?)'; params.push(`%${req.query.q}%`, `%${req.query.q}%`); }
  sql += ' ORDER BY f.data_publicacao DESC LIMIT 100';
  res.json(db.prepare(sql).all(...params));
});

router.get('/publico/fpl/:id', (req, res) => {
  const f = fpl.getFpl(req.params.id);
  if (!f || f.estado_workflow !== 'PUBLICADO') return res.status(404).json({ error: 'Não encontrada ou ainda não pública' });
  res.json({
    numero_processo: f.numero_processo, tipo_diploma: f.tipo_diploma, titulo: f.titulo, titulo_curto: f.titulo_curto,
    gabinete_sigla: f.gabinete_sigla, gabinete_nome: f.gabinete_nome, estado_workflow: f.estado_workflow,
    referencia_dr: f.referencia_dr, data_publicacao: f.data_publicacao,
    tipo_origem: f.tipo_origem, referencia_origem: f.referencia_origem, sintese_problema: f.sintese_problema,
    consulta_lex: f.consulta_lex_ref ? {
      ref: f.consulta_lex_ref, inicio: f.consulta_lex_inicio, fim: f.consulta_lex_fim,
      n_contributos: f.consulta_lex_n_contributos, sintese: f.consulta_lex_sintese, decisao: f.consulta_lex_decisao,
    } : null,
    bloco_d: (f.bloco_d || []).map(d => ({
      data: d.data, forma: d.forma, entidade: d.entidade_designacao, rtri_id: d.rtri_id,
      natureza: d.natureza_juridica, pessoas_governo: safeJsonParse(d.pessoas_governo, []),
      objeto: d.objeto, sintese: d.sintese_posicao,
      decisao: d.decisao_incorporacao, justificacao: d.justificacao_decisao,
    })),
    marcos: {
      M0: f.m0_validado_em, M1: f.m1_validado_em, M2: f.m2_validado_em,
      M3: f.m3_validado_em, M4: f.m4_validado_em, M5: f.m5_validado_em,
    },
  });
});

router.get('/publico/datasets/fpl.json', (req, res) => {
  const all = db.prepare("SELECT * FROM fpl WHERE estado_workflow = 'PUBLICADO'").all();
  res.json({ count: all.length, generated_at: new Date().toISOString(), items: all });
});

router.get('/publico/datasets/fpl.csv', (req, res) => {
  const all = db.prepare(`
    SELECT f.numero_processo, f.tipo_diploma, f.titulo, g.sigla as gabinete,
           f.data_publicacao, f.referencia_dr, f.tipo_origem
    FROM fpl f JOIN gabinete g ON g.id = f.gabinete_id
    WHERE f.estado_workflow = 'PUBLICADO'
  `).all();
  const headers = ['numero_processo', 'tipo_diploma', 'titulo', 'gabinete', 'data_publicacao', 'referencia_dr', 'tipo_origem'];
  const lines = [headers.join(',')];
  for (const r of all) lines.push(headers.map(h => `"${(r[h] || '').toString().replace(/"/g, '""')}"`).join(','));
  res.type('text/csv').send(lines.join('\n'));
});

// JSON-LD com vocabulário inspirado na Recomendação OCDE 2024
router.get('/publico/datasets/fpl.jsonld', (req, res) => {
  const all = db.prepare(`
    SELECT f.*, g.sigla as gabinete_sigla, g.nome as gabinete_nome
    FROM fpl f JOIN gabinete g ON g.id = f.gabinete_id
    WHERE f.estado_workflow = 'PUBLICADO'
  `).all();
  const items = all.map(f => {
    const blocoD = db.prepare('SELECT * FROM entrada_bloco_d WHERE fpl_id = ?').all(f.id);
    return {
      '@type': 'LegislativeFootprint',
      'identifier': f.numero_processo,
      'instrumentType': f.tipo_diploma,
      'title': f.titulo,
      'proponent': { '@type': 'GovernmentBody', 'name': f.gabinete_nome, 'identifier': f.gabinete_sigla },
      'origin': f.tipo_origem,
      'publishedAt': f.data_publicacao,
      'officialReference': f.referencia_dr,
      'externalConsultations': blocoD.map(d => ({
        '@type': 'StakeholderInteraction',
        'date': d.data,
        'form': d.forma,
        'stakeholder': { 'name': d.entidade_designacao, 'transparencyRegisterId': d.rtri_id, 'natureCategory': d.natureza_juridica },
        'subject': d.objeto,
        'positionSummary': d.sintese_posicao,
        'incorporationDecision': d.decisao_incorporacao,
        'incorporationRationale': d.justificacao_decisao,
      })),
    };
  });
  res.json({
    '@context': {
      '@vocab': 'https://example.gov.pt/fpl/vocab#',
      'OECD': 'https://oecd.org/legislative-footprint/2024/',
    },
    '@type': 'LegislativeFootprintCollection',
    'generatedAt': new Date().toISOString(),
    'count': items.length,
    'items': items,
  });
});

// ========== Dashboard ==========
router.get('/admin/dashboard', requireAuth, requireRole('SGGOV_QA', 'SGGOV_ADMIN', 'GSEPCM'), (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as n FROM fpl').get().n;
  const por_estado = db.prepare(`SELECT estado_workflow as estado, COUNT(*) as n FROM fpl GROUP BY estado_workflow`).all();
  const publicadas = db.prepare("SELECT COUNT(*) as n FROM fpl WHERE estado_workflow = 'PUBLICADO'").get().n;
  const em_revisao = db.prepare("SELECT COUNT(*) as n FROM fpl WHERE estado_workflow = 'EM_REVISAO_QA'").get().n;
  const top_gabinetes = db.prepare(`
    SELECT g.sigla, COUNT(f.id) as n FROM fpl f JOIN gabinete g ON g.id = f.gabinete_id
    GROUP BY g.sigla ORDER BY n DESC LIMIT 5
  `).all();
  const top_entidades = db.prepare(`
    SELECT entidade_designacao as entidade, rtri_id, COUNT(*) as n
    FROM entrada_bloco_d
    WHERE entidade_designacao IS NOT NULL
    GROUP BY entidade_designacao ORDER BY n DESC LIMIT 10
  `).all();
  const auditorias_med = db.prepare(`SELECT AVG(pontuacao) as m, COUNT(*) as n FROM auditoria_qa`).get();
  const tentativas_falha = db.prepare(`
    SELECT COUNT(*) as n FROM tentativa_login WHERE sucesso = 0 AND timestamp > datetime('now','-24 hours')
  `).get();
  res.json({
    total, publicadas, em_revisao, por_estado, top_gabinetes, top_entidades,
    auditorias: { media: auditorias_med?.m || 0, total: auditorias_med?.n || 0 },
    seguranca: { tentativas_login_falhadas_24h: tentativas_falha?.n || 0 },
  });
});

export default router;
