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

// Cronograma: datas previstas dos marcos + período da CP
router.patch('/fpl/:id/datas', requireAuth, ah(async (req, res) => {
  const f = await fplComEscopo(req, res); if (!f) return;
  res.json(await fpl.atualizarDatas(req.params.id, req.body || {}, req.user, req));
}));

// Agenda consolidada — todos os próximos prazos das FPLs do utilizador.
// Devolve eventos ordenados cronologicamente (passados e futuros), com
// origem (M0..M5, CP, RSE, CM, DR, audição), data, FPL e tipo.
router.get('/agenda', requireAuth, ah(async (req, res) => {
  const isSggov = req.user.papeis.some(p => ['SGGOV_ADMIN', 'SGGOV_QA', 'GSEPCM'].includes(p.papel));
  const gabIds = req.user.papeis.map(p => p.gabinete_id).filter(Boolean);
  let fpls;
  if (isSggov) {
    fpls = await db.all(`SELECT * FROM fpl WHERE estado != 'ARQUIVADO'`);
  } else if (gabIds.length) {
    const placeholders = gabIds.map(() => '?').join(',');
    fpls = await db.all(`SELECT * FROM fpl WHERE gabinete_id IN (${placeholders}) AND estado != 'ARQUIVADO'`, gabIds);
  } else {
    fpls = [];
  }
  const eventos = [];
  for (const f of fpls) {
    const ref = { fpl_id: f.id, numero: f.numero_processo, titulo: f.titulo_curto || f.titulo };
    // Marcos reais (validados) — passados
    if (f.m0_em) eventos.push({ ...ref, kind: 'M0', tipo: 'real', data: f.m0_em.slice(0, 10), titulo_ev: 'M0 · Abertura' });
    if (f.m2_em) eventos.push({ ...ref, kind: 'M2', tipo: 'real', data: f.m2_em.slice(0, 10), titulo_ev: 'M2 · Abertura CP' });
    if (f.m3_em) eventos.push({ ...ref, kind: 'M3', tipo: 'real', data: f.m3_em.slice(0, 10), titulo_ev: 'M3 · Encerramento CP' });
    if (f.m4_em) eventos.push({ ...ref, kind: 'M4', tipo: 'real', data: f.m4_em.slice(0, 10), titulo_ev: 'M4 · Pré-CM' });
    if (f.m5_em) eventos.push({ ...ref, kind: 'M5', tipo: 'real', data: f.m5_em.slice(0, 10), titulo_ev: 'M5 · Publicação' });
    // Marcos previstos (só os que ainda não foram validados)
    if (f.m0_prevista && !f.m0_em) eventos.push({ ...ref, kind: 'M0', tipo: 'prev', data: f.m0_prevista, titulo_ev: 'M0 · Abertura (prevista)' });
    if (f.m2_prevista && !f.m2_em) eventos.push({ ...ref, kind: 'M2', tipo: 'prev', data: f.m2_prevista, titulo_ev: 'M2 · Abertura CP (prevista)' });
    if (f.m3_prevista && !f.m3_em) eventos.push({ ...ref, kind: 'M3', tipo: 'prev', data: f.m3_prevista, titulo_ev: 'M3 · Encerramento CP (previsto)' });
    if (f.m4_prevista && !f.m4_em) eventos.push({ ...ref, kind: 'M4', tipo: 'prev', data: f.m4_prevista, titulo_ev: 'M4 · Pré-CM (previsto)' });
    if (f.m5_prevista && !f.m5_em) eventos.push({ ...ref, kind: 'M5', tipo: 'prev', data: f.m5_prevista, titulo_ev: 'M5 · Publicação (prevista)' });
    // Período CP
    if (f.cl_inicio) eventos.push({ ...ref, kind: 'CP', tipo: 'periodo', data: f.cl_inicio, titulo_ev: 'Abre Consulta Pública' });
    if (f.cl_fim) eventos.push({ ...ref, kind: 'CP', tipo: 'periodo', data: f.cl_fim, titulo_ev: 'Encerra Consulta Pública' });
  }
  // Audições com datas associadas (pedido e resposta)
  let audicoes;
  if (isSggov) {
    audicoes = await db.all(`SELECT a.*, f.numero_processo, f.titulo_curto, f.titulo FROM audicao a JOIN fpl f ON f.id = a.fpl_id WHERE f.estado != 'ARQUIVADO'`);
  } else if (gabIds.length) {
    const ph = gabIds.map(() => '?').join(',');
    audicoes = await db.all(`SELECT a.*, f.numero_processo, f.titulo_curto, f.titulo FROM audicao a JOIN fpl f ON f.id = a.fpl_id WHERE f.gabinete_id IN (${ph}) AND f.estado != 'ARQUIVADO'`, gabIds);
  } else {
    audicoes = [];
  }
  for (const a of audicoes) {
    const ref = { fpl_id: a.fpl_id, numero: a.numero_processo, titulo: a.titulo_curto || a.titulo };
    if (a.data_pedido) eventos.push({ ...ref, kind: a.categoria === 'OBRIGATORIA' ? 'INTER' : 'INTER', tipo: 'audicao', data: a.data_pedido, titulo_ev: `Audição ${a.categoria === 'OBRIGATORIA' ? 'obrigatória' : 'GSEPCM'} · ${a.entidade}` });
    if (a.data_resposta && a.data_resposta !== a.data_pedido) eventos.push({ ...ref, kind: 'INTER', tipo: 'audicao', data: a.data_resposta, titulo_ev: `Resposta · ${a.entidade}` });
  }
  // Ordena cronologicamente
  eventos.sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  res.json({ eventos, total: eventos.length });
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

// ========================= Admin: Estado do sistema =========================
// Painel "saúde" para SGGOV: BD, último backup, contagens, atividade recente.
router.get('/admin/estado', requireAuth, requireRole('SGGOV_QA', 'SGGOV_ADMIN', 'GSEPCM'), ah(async (req, res) => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const config = (await import('./config.js')).default;

  // Tamanho do ficheiro SQLite
  let dbBytes = 0;
  try { dbBytes = fs.statSync(db.path).size; } catch {}

  // Último backup: lê manifesto da pasta de backup mais recente
  let backup = null;
  try {
    const baseDir = path.resolve(config.backup.dir);
    if (fs.existsSync(baseDir)) {
      const dias = fs.readdirSync(baseDir).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse();
      if (dias.length) {
        const indexPath = path.join(baseDir, dias[0], '_index.json');
        if (fs.existsSync(indexPath)) {
          const j = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
          backup = { dia: dias[0], gerado_em: j.gerado_em, total: j.total };
        }
      }
    }
  } catch {}

  const total_fpl = (await db.get('SELECT COUNT(*) as n FROM fpl')).n;
  const por_estado = await db.all('SELECT estado, COUNT(*) as n FROM fpl GROUP BY estado');
  const total_audicoes = (await db.get('SELECT COUNT(*) as n FROM audicao')).n;
  const total_integra = (await db.get('SELECT COUNT(*) as n FROM interacao_integra')).n;
  const total_eventos = (await db.get('SELECT COUNT(*) as n FROM evento')).n;
  const total_utilizadores = (await db.get('SELECT COUNT(*) as n FROM utilizador WHERE ativo = 1')).n;
  const sessoes_ativas = (await db.get('SELECT COUNT(*) as n FROM sessao WHERE expira_em > ?',
    [new Date().toISOString()])).n;

  const eventos_recentes = await db.all(
    `SELECT e.tipo, e.timestamp, u.nome_completo as autor, e.fpl_id,
            (SELECT numero_processo FROM fpl WHERE id = e.fpl_id) as numero
     FROM evento e LEFT JOIN utilizador u ON u.id = e.autor_id
     ORDER BY e.timestamp DESC LIMIT 8`
  );

  res.json({
    ts: new Date().toISOString(),
    db: { path: db.path, bytes: dbBytes },
    backup,
    contagens: {
      fpl: total_fpl,
      audicoes: total_audicoes,
      integra: total_integra,
      eventos: total_eventos,
      utilizadores: total_utilizadores,
      sessoes_ativas,
    },
    por_estado,
    eventos_recentes,
  });
}));

// ========================= Admin: Audit log global =========================
router.get('/admin/eventos', requireAuth, requireRole('SGGOV_QA', 'SGGOV_ADMIN', 'GSEPCM'), ah(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
  const tipo = req.query.tipo;
  const autorEmail = req.query.autor;
  let sql = `SELECT e.id, e.tipo, e.timestamp, e.payload, e.ip,
                    u.nome_completo as autor, u.email as autor_email,
                    e.fpl_id, (SELECT numero_processo FROM fpl WHERE id = e.fpl_id) as numero
             FROM evento e LEFT JOIN utilizador u ON u.id = e.autor_id
             WHERE 1=1`;
  const params = [];
  if (tipo) { sql += ' AND e.tipo = ?'; params.push(tipo); }
  if (autorEmail) { sql += ' AND u.email = ?'; params.push(autorEmail); }
  sql += ' ORDER BY e.timestamp DESC LIMIT ?';
  params.push(limit);
  const items = await db.all(sql, params);
  const tipos = await db.all('SELECT tipo, COUNT(*) as n FROM evento GROUP BY tipo ORDER BY n DESC');
  res.json({ items, tipos });
}));

// ========================= Admin: Verificação de integridade =========================
// Recalcula o hash SHA-256 das FPLs publicadas e compara com hash_publicacao.
// Sem alterações de estado — só leitura + cálculo.
router.post('/admin/verificar-integridade', requireAuth, requireRole('SGGOV_ADMIN', 'SGGOV_QA'), ah(async (req, res) => {
  const crypto = await import('node:crypto');
  const publicadas = await db.all("SELECT id, numero_processo, hash_publicacao FROM fpl WHERE estado = 'PUBLICADO'");
  const resultados = [];
  for (const f of publicadas) {
    const snap = await canon.toCanonico(f.id);
    const calc = crypto.createHash('sha256').update(JSON.stringify(snap)).digest('hex');
    resultados.push({
      id: f.id,
      numero_processo: f.numero_processo,
      hash_gravado: f.hash_publicacao,
      hash_calculado: calc,
      coincide: f.hash_publicacao === calc,
    });
  }
  const total = resultados.length;
  const ok = resultados.filter(r => r.coincide).length;
  res.json({ verificadas: total, ok, divergentes: total - ok, resultados });
}));

// ========================= Admin: Utilizadores e papéis =========================
router.get('/admin/utilizadores', requireAuth, requireRole('SGGOV_ADMIN', 'SGGOV_QA'), ah(async (req, res) => {
  const utilizadores = await db.all(
    `SELECT id, email, nome_completo, ativo, criado_em FROM utilizador ORDER BY nome_completo`
  );
  const papeis = await db.all(
    `SELECT a.utilizador_id, a.papel, a.gabinete_id, g.sigla as gabinete_sigla
     FROM atribuicao_papel a LEFT JOIN gabinete g ON g.id = a.gabinete_id`
  );
  // Agrupa papéis por utilizador
  const map = new Map();
  for (const p of papeis) {
    if (!map.has(p.utilizador_id)) map.set(p.utilizador_id, []);
    map.get(p.utilizador_id).push({ papel: p.papel, gabinete_id: p.gabinete_id, gabinete_sigla: p.gabinete_sigla });
  }
  res.json(utilizadores.map(u => ({ ...u, papeis: map.get(u.id) || [] })));
}));

router.post('/admin/utilizadores/:id/papeis', requireAuth, requireRole('SGGOV_ADMIN'), ah(async (req, res) => {
  const { papel, gabinete_id } = req.body || {};
  if (!papel) return res.status(400).json({ error: 'papel obrigatório' });
  const PAPEIS_VALIDOS = ['PONTO_FOCAL', 'SGGOV_QA', 'SGGOV_ADMIN', 'GSEPCM'];
  if (!PAPEIS_VALIDOS.includes(papel)) return res.status(400).json({ error: 'papel inválido' });
  await db.run(
    `INSERT INTO atribuicao_papel (utilizador_id, papel, gabinete_id) VALUES (?, ?, ?) ON CONFLICT DO NOTHING`,
    [req.params.id, papel, gabinete_id || null]
  );
  res.json({ ok: true });
}));

router.delete('/admin/utilizadores/:id/papeis/:papel', requireAuth, requireRole('SGGOV_ADMIN'), ah(async (req, res) => {
  const gabId = req.query.gabinete_id || null;
  await db.run(
    `DELETE FROM atribuicao_papel WHERE utilizador_id = ? AND papel = ? AND (gabinete_id IS ? OR gabinete_id = ?)`,
    [req.params.id, req.params.papel, gabId, gabId]
  );
  res.json({ ok: true });
}));

export default router;
