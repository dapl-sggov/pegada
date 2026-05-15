// Testes dos adapters de integração externa (Bloco E):
//   • diretorio (HTTP — mock fetch)
//   • consultalex webhook (HMAC + replay)
//   • dre (polling — mock fetch)
//   • rtri (sincronização — mock fetch)
//
// Não testamos LDAP nem SMTP "ao vivo" — exigem servidores externos.
// O contrato dos adapters é coberto através do mock dos seus pontos de
// saída (fetch / nodemailer).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.DATABASE_URL = 'sqlite::memory:';
process.env.NODE_ENV = 'test';
process.env.COMPROVATIVO_ALLOW_EPHEMERAL = 'true';
process.env.RATE_LIMIT_DISABLE = '1';
process.env.CL_WEBHOOK_KEY = 'segredo-de-teste-32-bytes-x'.padEnd(32, '_');
process.env.DIRECTORY_ROLE_MAP = 'CN=fpl-pf-mae,OU=Grupos,DC=gov,DC=pt:PONTO_FOCAL:mae';
process.env.RTRI_MODE = 'http';
process.env.RTRI_BASE_URL = 'https://rtri.test/api';
process.env.DRE_MODE = 'http';
process.env.DRE_BASE_URL = 'https://dre.test';

let db, migrate, diretorio, consultalex, rtri, dre, auth;

before(async () => {
  ({ db } = await import('../src/db.js'));
  ({ migrate } = await import('../src/migrate.js'));
  diretorio = await import('../src/diretorio.js');
  consultalex = await import('../src/consultalex.js');
  rtri = await import('../src/rtri.js');
  dre = await import('../src/dre.js');
  auth = await import('../src/auth.js');
  await migrate();
  await db.run("INSERT INTO gabinete (id, sigla, nome) VALUES ('mae','MAE','Ministério do Ambiente e da Energia')");
});

// ---------------------------------------------------------------------------
// Diretório — mapeamento de grupos para papéis
// ---------------------------------------------------------------------------
test('diretorio: mapeia grupos LDAP para papéis com escopo de gabinete', () => {
  const papeis = diretorio.mapearGruposParaPapeis([
    'CN=fpl-pf-mae,OU=Grupos,DC=gov,DC=pt',
    'CN=outro-grupo,OU=Grupos,DC=gov,DC=pt',
  ]);
  assert.equal(papeis.length, 1);
  assert.equal(papeis[0].papel, 'PONTO_FOCAL');
  assert.equal(papeis[0].gabinete_id, 'mae');
});

test('diretorio: provisionamento just-in-time cria utilizador + papéis', async () => {
  const dirUser = {
    email: 'novo.pf@gov.pt',
    nome: 'Novo PF',
    nif: '999999999',
    grupos: ['CN=fpl-pf-mae,OU=Grupos,DC=gov,DC=pt'],
  };
  const u = await diretorio.sincronizarUtilizador(dirUser);
  assert.ok(u.id);
  assert.equal(u.email, 'novo.pf@gov.pt');
  const papeis = await db.all('SELECT papel, gabinete_id, origem FROM atribuicao_papel WHERE utilizador_id = ?', [u.id]);
  assert.equal(papeis.length, 1);
  assert.equal(papeis[0].papel, 'PONTO_FOCAL');
  assert.equal(papeis[0].gabinete_id, 'mae');
  assert.equal(papeis[0].origem, 'DIRETORIO');

  // Idempotência: 2.ª chamada não duplica
  await diretorio.sincronizarUtilizador(dirUser);
  const papeis2 = await db.all('SELECT * FROM atribuicao_papel WHERE utilizador_id = ?', [u.id]);
  assert.equal(papeis2.length, 1);
});

// ---------------------------------------------------------------------------
// Consulta.Lex webhook — HMAC + anti-replay
// ---------------------------------------------------------------------------
function assinarWebhook(corpo, ts) {
  const body = typeof corpo === 'string' ? corpo : JSON.stringify(corpo);
  const sig = crypto.createHmac('sha256', process.env.CL_WEBHOOK_KEY)
    .update(ts + '.', 'utf8')
    .update(body, 'utf8')
    .digest('hex');
  return { sig: 'sha256=' + sig, body };
}

function reqMock(headers, rawBody, body) {
  return { headers, rawBody: Buffer.from(rawBody), body };
}
function resMock() {
  const out = { status: 200, body: null };
  return {
    status(s) { out.status = s; return this; },
    json(b) { out.body = b; return this; },
    _get: () => out,
  };
}

test('consulta.lex: webhook aceita pedido com HMAC válido', async () => {
  // Cria FPL para receber o webhook
  const f = { id: 'fpl-cl-1', numero: '2026/MAE/9999' };
  await db.run(
    `INSERT INTO fpl (id, numero_processo, tipo_diploma, titulo, gabinete_id, estado_workflow, criado_por)
     VALUES (?, ?, 'DL', 'Teste webhook', 'mae', 'EM_CONSULTA_PUBLICA', NULL)`,
    [f.id, f.numero]
  );
  const ts = new Date().toISOString();
  const corpo = { cl_ref: 'CL-T-001', fpl_numero: f.numero,
                  periodo: { inicio: '2026-01-01', fim: '2026-02-01' },
                  contributos: [{ data: '2026-01-15', entidade: 'X', tema: 't', sintese: 's' }] };
  const { sig, body } = assinarWebhook(corpo, ts);
  const req = reqMock({ 'x-cl-timestamp': ts, 'x-cl-signature': sig }, body, corpo);
  const res = resMock();
  await consultalex.processarWebhook(req, res);
  const r = res._get();
  assert.equal(r.status, 200, `esperado 200, ${r.status}: ${JSON.stringify(r.body)}`);
  assert.equal(r.body.importados, 1);
});

test('consulta.lex: webhook recusa assinatura adulterada', async () => {
  const ts = new Date().toISOString();
  const corpo = { cl_ref: 'CL-T-002', fpl_numero: '2026/MAE/9999', contributos: [] };
  const { sig, body } = assinarWebhook(corpo, ts);
  // Adultera 1 byte da assinatura
  const sigMau = sig.replace(/.$/, c => (c === '0' ? '1' : '0'));
  const req = reqMock({ 'x-cl-timestamp': ts, 'x-cl-signature': sigMau }, body, corpo);
  const res = resMock();
  await consultalex.processarWebhook(req, res);
  assert.equal(res._get().status, 401);
  assert.equal(res._get().body.motivo, 'assinatura-invalida');
});

test('consulta.lex: webhook recusa timestamp expirado (replay > 5 min)', async () => {
  const ts = new Date(Date.now() - 10 * 60_000).toISOString();
  const corpo = { cl_ref: 'CL-T-003', fpl_numero: '2026/MAE/9999', contributos: [] };
  const { sig, body } = assinarWebhook(corpo, ts);
  const req = reqMock({ 'x-cl-timestamp': ts, 'x-cl-signature': sig }, body, corpo);
  const res = resMock();
  await consultalex.processarWebhook(req, res);
  assert.equal(res._get().status, 401);
  assert.equal(res._get().body.motivo, 'timestamp-expirado');
});

test('consulta.lex: webhook recusa cabeçalhos em falta', async () => {
  const req = reqMock({}, '{}', {});
  const res = resMock();
  await consultalex.processarWebhook(req, res);
  assert.equal(res._get().status, 401);
  assert.equal(res._get().body.motivo, 'cabecalhos-em-falta');
});

// ---------------------------------------------------------------------------
// RTRI — sincronização batch (mock fetch)
// ---------------------------------------------------------------------------
test('rtri: sincronização processa páginas e popula a cache', async () => {
  const original = globalThis.fetch;
  let chamadas = 0;
  globalThis.fetch = async (url) => {
    chamadas++;
    const u = new URL(url);
    const pagina = u.searchParams.get('pagina') || '1';
    if (pagina === '1') {
      return new Response(JSON.stringify({
        items: [
          { id: 'RTRI/2026/T001', designacao: 'Entidade Teste 1', natureza_juridica: 'ASSOCIACAO', ativo: true, data_inscricao: '2024-01-01' },
          { id: 'RTRI/2026/T002', designacao: 'Entidade Teste 2', natureza_juridica: 'EMPRESA', ativo: true, data_inscricao: '2024-02-01' },
        ],
        proxima_pagina: 2,
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ items: [
      { id: 'RTRI/2026/T003', designacao: 'Entidade Teste 3', natureza_juridica: 'ACADEMIA', ativo: false, data_inscricao: '2024-03-01' },
    ]}), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const r = await rtri.sincronizarRtri();
    assert.equal(r.modo, 'http');
    assert.equal(r.sincronizadas, 3);
    assert.ok(chamadas >= 2, 'esperava 2 páginas');

    const c = await db.get('SELECT * FROM entidade_rtri WHERE rtri_id = ?', ['RTRI/2026/T001']);
    assert.equal(c.designacao, 'Entidade Teste 1');
    assert.equal(c.ativo, 1);
    const inativa = await db.get('SELECT * FROM entidade_rtri WHERE rtri_id = ?', ['RTRI/2026/T003']);
    assert.equal(inativa.ativo, 0);
  } finally { globalThis.fetch = original; }
});

test('rtri: retry em 5xx até esgotar tentativas', async () => {
  const original = globalThis.fetch;
  let chamadas = 0;
  globalThis.fetch = async () => {
    chamadas++;
    return new Response('boom', { status: 503 });
  };
  try {
    await assert.rejects(() => rtri.sincronizarRtri(), /503|API RTRI/);
    assert.ok(chamadas >= 3, `esperava ≥ 3 tentativas, recebi ${chamadas}`);
  } finally { globalThis.fetch = original; }
});

// ---------------------------------------------------------------------------
// DRE — polling (mock fetch)
// ---------------------------------------------------------------------------
test('dre: polling deteta publicação e atualiza FPL', async () => {
  // Cria FPL APROVADA sem referencia_dr
  const fid = 'fpl-dre-1';
  await db.run(
    `INSERT INTO fpl (id, numero_processo, tipo_diploma, titulo, gabinete_id, estado_workflow, criado_por)
     VALUES (?, '2026/MAE/8888', 'DL', 'Diploma DRE teste', 'mae', 'APROVADO', NULL)`,
    [fid]
  );
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    resultados: [
      { numero_dr: 'DR I, 88/2026', sumario: '2026/MAE/8888 — Diploma DRE teste',
        data_publicacao: '2026-05-10', link: 'https://dre.pt/.../88-2026' },
    ],
  }), { status: 200, headers: { 'content-type': 'application/json' } });

  try {
    const r = await dre.polling();
    assert.equal(r.modo, 'http');
    assert.equal(r.detetadas, 1);
    const f = await db.get('SELECT referencia_dr, data_publicacao, dre_url FROM fpl WHERE id = ?', [fid]);
    assert.equal(f.referencia_dr, 'DR I, 88/2026');
    assert.equal(f.data_publicacao, '2026-05-10');
    assert.match(f.dre_url, /dre\.pt/);
  } finally { globalThis.fetch = original; }
});

test('dre: registo manual atualiza FPL e regista evento', async () => {
  const fid = 'fpl-dre-2';
  await db.run(
    `INSERT INTO fpl (id, numero_processo, tipo_diploma, titulo, gabinete_id, estado_workflow, criado_por)
     VALUES (?, '2026/MAE/7777', 'DL', 'Diploma manual', 'mae', 'APROVADO', NULL)`,
    [fid]
  );
  const u = { id: null };
  const f = await dre.registarPublicacaoManual(fid, {
    referencia_dr: 'DR I, 77/2026', data_publicacao: '2026-05-12', url: 'https://dre.pt/x',
  }, u);
  assert.equal(f.referencia_dr, 'DR I, 77/2026');
  assert.equal(f.data_publicacao, '2026-05-12');
  const ev = await db.get(
    `SELECT * FROM evento_auditoria WHERE fpl_id = ? AND tipo_evento = 'DRE_PUBLICACAO_REGISTADA'`,
    [fid]
  );
  assert.ok(ev, 'evento de auditoria não foi registado');
});
