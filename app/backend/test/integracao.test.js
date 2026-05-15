// Testes de integração HTTP — exercita o servidor Express completo
// (autenticação, CSRF, RBAC, fluxo M0→M5, comprovativo, JWKS, /metrics).
//
// Estratégia:
//   • inicializa a app via buildApp() com BD SQLite em memória
//   • escuta numa porta efémera (0) — em paralelo com outros runners
//   • cliente HTTP minimalista por cima de fetch() preserva cookies
//
// Não depende de utilizadores semeados: cria-os via auth.createUser para
// isolamento entre execuções. O CSRF do cookie é replicado no header
// `x-csrf-token` (double-submit) — exatamente como o frontend faz.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = 'sqlite::memory:';
process.env.NODE_ENV = 'test';
process.env.COMPROVATIVO_ALLOW_EPHEMERAL = 'true';

let server, baseUrl, stopApp;
let auth, comprovativo;
let cookieJar = new Map();

before(async () => {
  const { buildApp } = await import('../src/server.js');
  auth = await import('../src/auth.js');
  comprovativo = await import('../src/comprovativo.js');

  const { app, stop } = await buildApp({ servirFrontend: false, iniciarWorkers: false });
  stopApp = stop;
  server = app.listen(0);
  await new Promise(r => server.on('listening', r));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;

  // Gabinete + utilizadores de teste
  const { db } = await import('../src/db.js');
  await db.run("INSERT INTO gabinete (id, sigla, nome) VALUES ('maen','MAEN','Ministério do Ambiente e Energia')");
  await db.run("INSERT INTO gabinete (id, sigla, nome) VALUES ('ms','MS','Ministério da Saúde')");

  const maria = await auth.createUser({ email: 'maria@maen.gov.pt', nome_completo: 'Maria PF', password: 'segredo123', nif: '900000001' });
  await auth.assignRole(maria, 'PONTO_FOCAL', 'maen');

  const rui = await auth.createUser({ email: 'rui@gov.pt', nome_completo: 'Rui QA', password: 'segredo123', nif: '900000002' });
  await auth.assignRole(rui, 'SGGOV_QA');

  const carla = await auth.createUser({ email: 'carla@gov.pt', nome_completo: 'Carla Admin', password: 'segredo123', nif: '900000003' });
  await auth.assignRole(carla, 'SGGOV_ADMIN');

  const ana = await auth.createUser({ email: 'ana@gov.pt', nome_completo: 'Ana MS PF', password: 'segredo123', nif: '900000004' });
  await auth.assignRole(ana, 'PONTO_FOCAL', 'ms');
});

after(async () => {
  if (server) await new Promise(r => server.close(r));
  if (stopApp) await stopApp();
});

// ---------------------------------------------------------------------------
// Cliente HTTP minimalista com cookie jar — uma sessão por cliente
// ---------------------------------------------------------------------------
function novoCliente() {
  const jar = new Map();
  async function req(method, p, body) {
    const headers = { 'content-type': 'application/json' };
    if (jar.size) headers['cookie'] = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    const csrf = jar.get('fpl_csrf');
    if (csrf && !['GET', 'HEAD', 'OPTIONS'].includes(method)) headers['x-csrf-token'] = csrf;
    const res = await fetch(baseUrl + p, {
      method, headers, body: body == null ? undefined : JSON.stringify(body),
    });
    for (const c of res.headers.getSetCookie?.() || (res.headers.raw?.()['set-cookie'] || [])) {
      const [pair] = c.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
    let json = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) json = await res.json().catch(() => null);
    else if (!ct.includes('text/')) await res.arrayBuffer().catch(() => null);
    return { status: res.status, headers: res.headers, body: json, text: ct.includes('text/') ? await res.text() : null };
  }
  return {
    GET: (p) => req('GET', p),
    POST: (p, b) => req('POST', p, b),
    PATCH: (p, b) => req('PATCH', p, b),
    DELETE: (p) => req('DELETE', p),
    jar,
  };
}

async function login(cliente, email, password = 'segredo123') {
  // hit qualquer GET para garantir CSRF cookie
  await cliente.GET('/api/auth/csrf');
  const r = await cliente.POST('/api/auth/login', { email, password });
  assert.equal(r.status, 200, `login falhou: ${JSON.stringify(r.body)}`);
  return r.body;
}

// ---------------------------------------------------------------------------
// Headers de segurança e CSRF
// ---------------------------------------------------------------------------
test('headers: respostas trazem CSP, X-Frame-Options e X-Content-Type-Options', async () => {
  const c = novoCliente();
  const r = await c.GET('/health');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  // SAMEORIGIN (não DENY) permite iframes internas (galeria de mockups);
  // continua a bloquear clickjacking externo.
  assert.equal(r.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.match(r.headers.get('content-security-policy') || '', /default-src 'self'/);
});

test('CSRF: POST sem header x-csrf-token é rejeitado com 403', async () => {
  // bypass do cliente normal — chamamos fetch sem o header
  const c = novoCliente();
  await c.GET('/api/auth/csrf'); // recebe cookie
  const cookies = [...c.jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  const r = await fetch(baseUrl + '/api/fpl', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: cookies },
    body: JSON.stringify({}),
  });
  assert.equal(r.status, 403);
  const j = await r.json();
  assert.match(j.error, /CSRF/i);
});

// ---------------------------------------------------------------------------
// Autenticação
// ---------------------------------------------------------------------------
test('auth: login com credenciais inválidas devolve 401', async () => {
  const c = novoCliente();
  await c.GET('/api/auth/csrf');
  const r = await c.POST('/api/auth/login', { email: 'maria@maen.gov.pt', password: 'errada' });
  assert.equal(r.status, 401);
});

test('auth: login ok devolve papéis e /auth/me funciona', async () => {
  const c = novoCliente();
  const me = await login(c, 'maria@maen.gov.pt');
  assert.equal(me.email, 'maria@maen.gov.pt');
  assert.ok(me.papeis.find(p => p.papel === 'PONTO_FOCAL' && p.gabinete_id === 'maen'));

  const r = await c.GET('/api/auth/me');
  assert.equal(r.status, 200);
  assert.equal(r.body.email, 'maria@maen.gov.pt');
});

test('auth: pedido a endpoint protegido sem sessão devolve 401', async () => {
  const c = novoCliente();
  await c.GET('/api/auth/csrf');
  const r = await c.GET('/api/fpl');
  assert.equal(r.status, 401);
});

// ---------------------------------------------------------------------------
// RBAC + Escopo de gabinete
// ---------------------------------------------------------------------------
test('rbac: PF de outro gabinete não vê FPL alheia (404 por escopo)', async () => {
  // Maria (PF MAEN) cria FPL
  const cMaria = novoCliente();
  await login(cMaria, 'maria@maen.gov.pt');
  const cria = await cMaria.POST('/api/fpl', { tipo_diploma: 'DL', titulo: 'FPL teste RBAC alheio', gabinete_id: 'maen' });
  assert.equal(cria.status, 201);
  const fplId = cria.body.id;

  // Ana (PF MS) tenta aceder
  const cAna = novoCliente();
  await login(cAna, 'ana@gov.pt');
  const r = await cAna.GET(`/api/fpl/${fplId}`);
  assert.equal(r.status, 403, `esperado 403, recebido ${r.status}: ${JSON.stringify(r.body)}`);
});

test('rbac: aprovar CM requer GSEPCM/SGGOV_ADMIN; PF recebe 403', async () => {
  const cMaria = novoCliente();
  await login(cMaria, 'maria@maen.gov.pt');
  const cria = await cMaria.POST('/api/fpl', { tipo_diploma: 'DL', titulo: 'FPL aprovar-cm', gabinete_id: 'maen' });
  const fplId = cria.body.id;
  const r = await cMaria.POST(`/api/fpl/${fplId}/aprovar-cm`, { numero_ata: '123/2026' });
  assert.equal(r.status, 403);
});

// ---------------------------------------------------------------------------
// Fluxo M0 ponta-a-ponta via HTTP
// ---------------------------------------------------------------------------
test('fluxo HTTP: criar FPL → patch Bloco B → validar M0 → comprovativo emitido', async () => {
  const c = novoCliente();
  await login(c, 'maria@maen.gov.pt');

  // criar
  const cria = await c.POST('/api/fpl', { tipo_diploma: 'DL', titulo: 'Diploma de integração HTTP M0', gabinete_id: 'maen' });
  assert.equal(cria.status, 201);
  assert.equal(cria.body.estado_workflow, 'CRIADO');
  const fplId = cria.body.id;

  // M0 sem Bloco B → bloqueia (HTTP 422 com pendências no body)
  let v = await c.POST(`/api/fpl/${fplId}/marcos/M0/validar`, {});
  assert.equal(v.status, 422);
  assert.ok(Array.isArray(v.body.pendencias) && v.body.pendencias.length >= 1);

  // preencher Bloco B
  const patch = await c.PATCH(`/api/fpl/${fplId}/bloco-b`, {
    tipo_origem: 'INICIATIVA_MINISTERIO',
    sintese_problema: 'Há uma lacuna regulatória relevante no setor X que carece de intervenção do legislador para garantir igualdade de condições de mercado e proteção dos consumidores envolvidos.'.repeat(2),
  });
  assert.equal(patch.status, 200);

  // M0 passa, comprovativo emitido
  v = await c.POST(`/api/fpl/${fplId}/marcos/M0/validar`, {});
  assert.equal(v.status, 200, `M0 deveria validar: ${JSON.stringify(v.body)}`);
  assert.equal(v.body.ok, true, `falha M0: ${JSON.stringify(v.body)}`);
  assert.equal(v.body.fpl.estado_workflow, 'EM_ELABORACAO');
  assert.ok(v.body.comprovativo, 'comprovativo deve vir no body');
  assert.equal(v.body.comprovativo.jws.split('.').length, 3, 'JWS compacto tem 3 segmentos');

  // o comprovativo aparece em /api/fpl/:id/comprovativos
  const lst = await c.GET(`/api/fpl/${fplId}/comprovativos`);
  assert.equal(lst.status, 200);
  assert.equal(lst.body.length, 1);
  assert.equal(lst.body[0].marco, 'M0');

  // verificação via /api/comprovativos/verificar
  const ver = await c.POST('/api/comprovativos/verificar', { jws: v.body.comprovativo.jws });
  assert.equal(ver.status, 200);
  assert.equal(ver.body.valido, true);
  assert.equal(ver.body.payload.marco, 'M0');
});

// ---------------------------------------------------------------------------
// JWKS público
// ---------------------------------------------------------------------------
test('JWKS: /api/.well-known/fpl-jwks.json expõe a chave pública Ed25519', async () => {
  const c = novoCliente();
  await login(c, 'maria@maen.gov.pt');
  const r = await c.GET('/api/.well-known/fpl-jwks.json');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.keys));
  assert.equal(r.body.keys[0].kty, 'OKP');
  assert.equal(r.body.keys[0].crv, 'Ed25519');
  assert.ok(r.body.keys[0].kid);
});

// ---------------------------------------------------------------------------
// /metrics — formato Prometheus
// ---------------------------------------------------------------------------
test('/metrics: expõe contadores HTTP, comprovativo e estado workflow', async () => {
  const c = novoCliente();
  // gera tráfego — login + 2 GETs
  await login(c, 'rui@gov.pt');
  await c.GET('/api/auth/me');

  const r = await fetch(baseUrl + '/metrics');
  assert.equal(r.status, 200);
  const txt = await r.text();
  assert.match(txt, /# TYPE http_requests_total counter/);
  assert.match(txt, /http_requests_total\{[^}]*method="POST"/);
  assert.match(txt, /# TYPE http_request_duration_seconds histogram/);
  assert.match(txt, /http_request_duration_seconds_bucket\{[^}]*le="0\.5"/);
  // contadores específicos da app (vêm do teste M0 anterior)
  assert.match(txt, /fpl_marcos_validados_total\{[^}]*marco="M0"/);
  assert.match(txt, /fpl_comprovativos_emitidos_total\{[^}]*marco="M0"/);
  // gauge dinâmico (snapshot por estado)
  assert.match(txt, /fpl_estado_workflow\{estado="EM_ELABORACAO"\}/);
});

// ---------------------------------------------------------------------------
// Exportação SGGOV — RBAC
// ---------------------------------------------------------------------------
test('export: PF NÃO pode aceder a /api/export/datasets/fpl.json (403)', async () => {
  const c = novoCliente();
  await login(c, 'maria@maen.gov.pt');
  const r = await c.GET('/api/export/datasets/fpl.json');
  assert.equal(r.status, 403);
});

test('export: SGGOV_QA pode aceder a /api/export/datasets/fpl.json', async () => {
  const c = novoCliente();
  await login(c, 'rui@gov.pt');
  const r = await c.GET('/api/export/datasets/fpl.json');
  assert.equal(r.status, 200);
  assert.ok(r.body, 'devolve JSON');
});

// ---------------------------------------------------------------------------
// Endpoints antigos /publico — devem estar fora (404)
// ---------------------------------------------------------------------------
test('reposicionamento: /api/publico/datasets/fpl.csv não existe (404)', async () => {
  const r = await fetch(baseUrl + '/api/publico/datasets/fpl.csv');
  assert.equal(r.status, 404);
});

// ---------------------------------------------------------------------------
// Funcionalidades v1.1 — snapshot de versão para diff viewer
// ---------------------------------------------------------------------------
test('versao snapshot: GET /api/fpl/:id/versoes/:vid devolve snapshot completo', async () => {
  const c = novoCliente();
  await login(c, 'maria@maen.gov.pt');

  // Cria FPL + Bloco B (gera 2 versões)
  const cria = await c.POST('/api/fpl', { tipo_diploma: 'DL', titulo: 'Teste snapshot diff', gabinete_id: 'maen' });
  assert.equal(cria.status, 201);
  const fplId = cria.body.id;

  await c.PATCH(`/api/fpl/${fplId}/bloco-b`, {
    tipo_origem: 'OUTRA',
    sintese_problema: 'a'.repeat(220),
  });

  const versoes = await c.GET(`/api/fpl/${fplId}/versoes`);
  assert.equal(versoes.status, 200);
  assert.ok(versoes.body.length >= 2, 'devem existir pelo menos 2 versões');

  const snap = await c.GET(`/api/fpl/${fplId}/versoes/${versoes.body[0].id}`);
  assert.equal(snap.status, 200);
  assert.ok(snap.body.snapshot, 'snapshot deve estar presente');
  // snapshotFpl devolve { fpl, bloco_c, bloco_d }
  assert.equal(snap.body.snapshot.fpl?.id, fplId);
  assert.ok(Array.isArray(snap.body.snapshot.bloco_c));
  assert.ok(Array.isArray(snap.body.snapshot.bloco_d));
});

test('dashboard SGGOV: traz timeline_marcos e top_gabinetes com id', async () => {
  const c = novoCliente();
  await login(c, 'rui@gov.pt');
  const r = await c.GET('/api/admin/dashboard');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.timeline_marcos), 'timeline_marcos é array');
  assert.ok(Array.isArray(r.body.top_gabinetes), 'top_gabinetes é array');
  // Top gabinetes deve incluir `id` para drill-down
  if (r.body.top_gabinetes.length) {
    assert.ok('id' in r.body.top_gabinetes[0], 'top_gabinetes[i].id presente');
  }
});

// ---------------------------------------------------------------------------
// SSE de notificações — confirma que o endpoint responde com text/event-stream
// e empurra eventos quando há nova notificação.
// ---------------------------------------------------------------------------
test('SSE: GET /api/notificacoes/stream estabelece event-stream e empurra eventos', async () => {
  const c = novoCliente();
  await login(c, 'maria@maen.gov.pt');
  const cookies = [...c.jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

  const ctrl = new AbortController();
  const res = await fetch(baseUrl + '/api/notificacoes/stream', {
    headers: { cookie: cookies, accept: 'text/event-stream' },
    signal: ctrl.signal,
  });
  assert.equal(res.status, 200);
  assert.ok((res.headers.get('content-type') || '').includes('text/event-stream'),
    'content-type deve ser text/event-stream');

  // Lê o primeiro chunk (ping inicial), depois publica uma notif via subscribe
  // direto e confirma que chega um evento `nova` em < 1 s.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  // Publicamos via API de notificacoes diretamente (atalho de teste)
  const { subscribe } = await import('../src/notificacoes.js');
  // não usamos subscribe diretamente — usamos `notificar` para o utilizador maria
  const { notificar } = await import('../src/notificacoes.js');
  const { db } = await import('../src/db.js');
  const u = await db.get("SELECT id FROM utilizador WHERE email = 'maria@maen.gov.pt'");

  // Espera o ping inicial (deve chegar imediatamente)
  let recebido = '';
  const t0 = Date.now();
  // Lê até receber pelo menos uma mensagem ou esgotar 2s
  const lerAlgumaCoisa = async () => {
    while (Date.now() - t0 < 2000) {
      const { value, done } = await Promise.race([
        reader.read(),
        new Promise(r => setTimeout(() => r({ value: null, done: true }), 1000)),
      ]);
      if (done) break;
      if (value) recebido += decoder.decode(value, { stream: true });
      if (recebido.includes('ping') || recebido.includes('nova')) break;
    }
  };
  await lerAlgumaCoisa();
  assert.ok(recebido.length > 0, 'deve receber pelo menos algum chunk');

  // Dispara uma notificação para o utilizador
  await notificar({
    tipo: 'M3_VALIDADO',
    destinatarios: [u.id],
    fpl: { id: 'x', numero_processo: '2026/MAEN/SSE', titulo: 'Teste SSE', titulo_curto: 'SSE' },
  });

  // Lê mais chunks à procura do evento "nova"
  recebido = '';
  const t1 = Date.now();
  while (Date.now() - t1 < 2000 && !recebido.includes('event: nova')) {
    const { value, done } = await Promise.race([
      reader.read(),
      new Promise(r => setTimeout(() => r({ value: null, done: true }), 800)),
    ]);
    if (done) break;
    if (value) recebido += decoder.decode(value, { stream: true });
  }
  ctrl.abort();
  assert.match(recebido, /event: nova/, 'deve ter sido empurrado um evento "nova"');
  // O template ignora o título passado e usa um título fixo; verificamos pelo
  // numero_processo que vai no corpo da notificação.
  assert.match(recebido, /2026\/MAEN\/SSE/, 'payload deve incluir o número de processo');
});
