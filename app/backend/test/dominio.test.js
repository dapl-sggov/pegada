// Testes de domínio — workflow, comprovativo criptográfico e fluxo FPL.
// Correm contra uma base de dados SQLite em memória, isolada.
// Execução:  npm test   (ou  node --test test/)

import { test, before } from 'node:test';
import assert from 'node:assert/strict';

// BD em memória, isolada — definido ANTES de importar os módulos.
process.env.DATABASE_URL = 'sqlite::memory:';
process.env.NODE_ENV = 'test';
process.env.COMPROVATIVO_ALLOW_EPHEMERAL = 'true';

let db, migrate, workflow, comprovativo, fpl, auth;

before(async () => {
  ({ db, initDb } = await import('../src/db.js'));
  ({ migrate } = await import('../src/migrate.js'));
  workflow = await import('../src/workflow.js');
  comprovativo = await import('../src/comprovativo.js');
  fpl = await import('../src/fpl.js');
  auth = await import('../src/auth.js');
  await migrate();
  await comprovativo.initComprovativo();
  // gabinete + utilizador de teste
  await db.run("INSERT INTO gabinete (id, sigla, nome) VALUES ('mae','MAE','Ministério do Ambiente e da Energia')");
  const uid = await auth.createUser({ email: 't@gov.pt', nome_completo: 'Tester', password: 'x' });
  await auth.assignRole(uid, 'PONTO_FOCAL', 'mae');
  globalThis.__uid = uid;
});

let initDb;

// ---------------------------------------------------------------------------
// Workflow — validação de marcos
// ---------------------------------------------------------------------------
test('M0 falha sem Bloco B; passa quando preenchido', async () => {
  const f1 = { id: 'x', estado_workflow: 'CRIADO', tipo_origem: null, sintese_problema: null };
  let r = await workflow.validarMarco(f1, 'M0');
  assert.equal(r.ok, false);
  assert.ok(r.pendencias.length >= 2);

  const f2 = { id: 'x', estado_workflow: 'CRIADO', tipo_origem: 'OUTRA', sintese_problema: 'a'.repeat(250) };
  r = await workflow.validarMarco(f2, 'M0');
  assert.equal(r.ok, true);
});

test('M0 recusa transição a partir de estado inválido', async () => {
  const f = { id: 'x', estado_workflow: 'EM_RSE', tipo_origem: 'OUTRA', sintese_problema: 'a'.repeat(250) };
  const r = await workflow.validarMarco(f, 'M0');
  assert.equal(r.ok, false);
  assert.equal(r.pendencias[0].regra, 'transicao_invalida');
});

test('transicaoEstadoApos: M3 → EM_RSE, M2 mantém estado', () => {
  assert.equal(workflow.transicaoEstadoApos('M3', 'EM_ELABORACAO'), 'EM_RSE');
  assert.equal(workflow.transicaoEstadoApos('M2', 'EM_CONSULTA_PUBLICA'), 'EM_CONSULTA_PUBLICA');
});

test('validarEntradaBlocoD: RTRI_INSCRITO exige número de inscrição', () => {
  const errs = workflow.validarEntradaBlocoD({
    data: '2026-01-01', forma: 'REUNIAO', entidade_designacao: 'X',
    natureza_juridica: 'RTRI_INSCRITO', rtri_id: '',
    objeto: 'o'.repeat(60), sintese_posicao: 's'.repeat(120),
  });
  assert.ok(errs.some(e => e.includes('número de inscrição')));
});

// ---------------------------------------------------------------------------
// Comprovativo criptográfico
// ---------------------------------------------------------------------------
test('comprovativo: emite JWS Ed25519 e verifica com sucesso', async () => {
  const fakeFpl = { id: 'fpl-t', numero_processo: '2026/MAE/9001', gabinete_id: 'mae', estado_workflow: 'EM_ELABORACAO' };
  // precisa de existir na BD para a FK do INSERT comprovativo
  await db.run(
    `INSERT INTO fpl (id, numero_processo, tipo_diploma, titulo, gabinete_id, estado_workflow, criado_por)
     VALUES (?, ?, 'DL', 'Teste', 'mae', 'EM_ELABORACAO', ?)`,
    [fakeFpl.id, fakeFpl.numero_processo, globalThis.__uid]
  );
  const user = { papeis: [{ papel: 'PONTO_FOCAL', gabinete_id: 'mae' }] };
  const c = await comprovativo.emitirComprovativo({ fpl: fakeFpl, marco: 'M0', user, snapshot: { id: 'fpl-t' } });
  assert.ok(c.jti.startsWith('cmp_M0-'));
  assert.equal(c.jws.split('.').length, 3);

  const v = await comprovativo.verificarComprovativo(c.jws);
  assert.equal(v.valido, true);
  assert.equal(v.payload.marco, 'M0');
  assert.equal(v.payload.sub, '2026/MAE/9001');
});

test('comprovativo: assinatura adulterada é rejeitada', async () => {
  const fakeFpl = { id: 'fpl-t', numero_processo: '2026/MAE/9001', gabinete_id: 'mae' };
  const user = { papeis: [{ papel: 'PONTO_FOCAL', gabinete_id: 'mae' }] };
  const c = await comprovativo.emitirComprovativo({ fpl: fakeFpl, marco: 'M3', user, snapshot: { id: 'fpl-t' } });
  const [h, p] = c.jws.split('.');
  // assinatura trocada
  const adulterado = `${h}.${p}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
  const v = await comprovativo.verificarComprovativo(adulterado);
  assert.equal(v.valido, false);
});

test('comprovativo: payload adulterado é rejeitado', async () => {
  const fakeFpl = { id: 'fpl-t', numero_processo: '2026/MAE/9001', gabinete_id: 'mae' };
  const user = { papeis: [{ papel: 'PONTO_FOCAL', gabinete_id: 'mae' }] };
  const c = await comprovativo.emitirComprovativo({ fpl: fakeFpl, marco: 'M4', user, snapshot: { id: 'fpl-t' } });
  const [h, , s] = c.jws.split('.');
  const payloadFalso = Buffer.from(JSON.stringify({ marco: 'M5', sub: 'falso' })).toString('base64url');
  const v = await comprovativo.verificarComprovativo(`${h}.${payloadFalso}.${s}`);
  assert.equal(v.valido, false);
});

test('JWKS expõe a chave pública ativa', async () => {
  const jwks = await comprovativo.getJwks();
  assert.ok(Array.isArray(jwks.keys));
  assert.ok(jwks.keys.length >= 1);
  assert.equal(jwks.keys[0].kty, 'OKP');
  assert.equal(jwks.keys[0].crv, 'Ed25519');
});

// ---------------------------------------------------------------------------
// Fluxo FPL integrado — criação, M0, emissão de comprovativo, versionamento
// ---------------------------------------------------------------------------
test('fluxo: criar FPL → validar M0 emite comprovativo e cria versão', async () => {
  const user = { id: globalThis.__uid, papeis: [{ papel: 'PONTO_FOCAL', gabinete_id: 'mae' }] };
  const f = await fpl.criarFpl({ tipo_diploma: 'DL', titulo: 'Diploma de teste integrado', gabinete_id: 'mae' }, user, {});
  assert.equal(f.estado_workflow, 'CRIADO');

  // M0 sem Bloco B → bloqueia
  let r = await fpl.validarMarcoFpl(f.id, 'M0', user, {}, {});
  assert.equal(r.ok, false);

  // preenche Bloco B e valida M0 → passa, emite comprovativo
  await fpl.atualizarBlocoB(f.id, { tipo_origem: 'INICIATIVA_MINISTERIO', sintese_problema: 'x'.repeat(220) }, user, {});
  r = await fpl.validarMarcoFpl(f.id, 'M0', user, {}, {});
  assert.equal(r.ok, true);
  assert.equal(r.fpl.estado_workflow, 'EM_ELABORACAO');
  assert.ok(r.comprovativo, 'M0 deve emitir comprovativo');
  assert.ok(r.comprovativo.jws.split('.').length === 3);

  // o comprovativo emitido fica registado e verificável
  const lista = await comprovativo.listarComprovativos(f.id);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].marco, 'M0');

  // versionamento: criação(1) + Bloco B(2) + M0(3)
  const versoes = await fpl.listarVersoes(f.id);
  assert.ok(versoes.length >= 3);
  assert.ok(versoes.some(v => v.marco_validado === 'M0'));
});

test('fluxo: M3 bloqueia enquanto houver entradas D sem decisão', async () => {
  const user = { id: globalThis.__uid, papeis: [{ papel: 'PONTO_FOCAL', gabinete_id: 'mae' }] };
  const f = await fpl.criarFpl({ tipo_diploma: 'DL', titulo: 'Diploma teste M3', gabinete_id: 'mae' }, user, {});
  await fpl.atualizarBlocoB(f.id, { tipo_origem: 'OUTRA', sintese_problema: 'y'.repeat(220) }, user, {});
  await fpl.validarMarcoFpl(f.id, 'M0', user, {}, {});
  // entrada D sem decisão de incorporação
  await fpl.adicionarEntradaBlocoD(f.id, {
    data: '2026-02-01', forma: 'REUNIAO', entidade_designacao: 'Entidade X',
    natureza_juridica: 'ACADEMIA_PERITO', objeto: 'o'.repeat(60), sintese_posicao: 's'.repeat(120),
  }, user, {});
  const r = await fpl.validarMarcoFpl(f.id, 'M3', user, {}, { declaracao_assinada: true });
  assert.equal(r.ok, false);
  assert.ok(r.pendencias.some(p => p.regra === 'obrigatorio_em_M3'));
});
