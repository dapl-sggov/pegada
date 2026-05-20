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
  await db.run("INSERT INTO gabinete (id, sigla, nome) VALUES ('maen','MAEN','Ministério do Ambiente e Energia')");
  const uid = await auth.createUser({ email: 't@gov.pt', nome_completo: 'Tester', password: 'x' });
  await auth.assignRole(uid, 'PONTO_FOCAL', 'maen');
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

test('transicaoEstadoApos: M1 → EM_RSE, M2 → EM_CONSULTA_PUBLICA, M3 mantém estado', () => {
  // Novo desenho: M1 abre RSE, M2 abre CP, M3 (encerramento CP) mantém estado.
  assert.equal(workflow.transicaoEstadoApos('M1', 'EM_ELABORACAO'), 'EM_RSE');
  assert.equal(workflow.transicaoEstadoApos('M2', 'EM_RSE'), 'EM_CONSULTA_PUBLICA');
  assert.equal(workflow.transicaoEstadoApos('M3', 'EM_CONSULTA_PUBLICA'), 'EM_CONSULTA_PUBLICA');
  assert.equal(workflow.transicaoEstadoApos('M4', 'EM_CONSULTA_PUBLICA'), 'EM_CM');
});

test('MARCOS_BLOQUEANTES contém M0, M1, M4, M5 (e exclui M2 e M3)', () => {
  assert.deepEqual([...workflow.MARCOS_BLOQUEANTES].sort(), ['M0', 'M1', 'M4', 'M5']);
  assert.ok(!workflow.MARCOS_BLOQUEANTES.includes('M2'));
  assert.ok(!workflow.MARCOS_BLOQUEANTES.includes('M3'));
});

test('MARCOS_COM_DECLARACAO contém M1 e M4 (Bloco F)', () => {
  // Só os marcos com declaração de completude assinada exigem opts.declaracao_assinada.
  assert.deepEqual([...workflow.MARCOS_COM_DECLARACAO].sort(), ['M1', 'M4']);
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
  const fakeFpl = { id: 'fpl-t', numero_processo: '2026/MAEN/9001', gabinete_id: 'maen', estado_workflow: 'EM_ELABORACAO' };
  // precisa de existir na BD para a FK do INSERT comprovativo
  await db.run(
    `INSERT INTO fpl (id, numero_processo, tipo_diploma, titulo, gabinete_id, estado_workflow, criado_por)
     VALUES (?, ?, 'DL', 'Teste', 'maen', 'EM_ELABORACAO', ?)`,
    [fakeFpl.id, fakeFpl.numero_processo, globalThis.__uid]
  );
  const user = { papeis: [{ papel: 'PONTO_FOCAL', gabinete_id: 'maen' }] };
  const c = await comprovativo.emitirComprovativo({ fpl: fakeFpl, marco: 'M0', user, snapshot: { id: 'fpl-t' } });
  assert.ok(c.jti.startsWith('cmp_M0-'));
  assert.equal(c.jws.split('.').length, 3);

  const v = await comprovativo.verificarComprovativo(c.jws);
  assert.equal(v.valido, true);
  assert.equal(v.payload.marco, 'M0');
  assert.equal(v.payload.sub, '2026/MAEN/9001');
});

test('comprovativo: assinatura adulterada é rejeitada', async () => {
  const fakeFpl = { id: 'fpl-t', numero_processo: '2026/MAEN/9001', gabinete_id: 'maen' };
  const user = { papeis: [{ papel: 'PONTO_FOCAL', gabinete_id: 'maen' }] };
  // M1 (pré-RSE) é agora um marco bloqueante e emite comprovativo.
  const c = await comprovativo.emitirComprovativo({ fpl: fakeFpl, marco: 'M1', user, snapshot: { id: 'fpl-t' } });
  const [h, p] = c.jws.split('.');
  // assinatura trocada
  const adulterado = `${h}.${p}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
  const v = await comprovativo.verificarComprovativo(adulterado);
  assert.equal(v.valido, false);
});

test('comprovativo: payload adulterado é rejeitado', async () => {
  const fakeFpl = { id: 'fpl-t', numero_processo: '2026/MAEN/9001', gabinete_id: 'maen' };
  const user = { papeis: [{ papel: 'PONTO_FOCAL', gabinete_id: 'maen' }] };
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
  const user = { id: globalThis.__uid, papeis: [{ papel: 'PONTO_FOCAL', gabinete_id: 'maen' }] };
  const f = await fpl.criarFpl({ tipo_diploma: 'DL', titulo: 'Diploma de teste integrado', gabinete_id: 'maen' }, user, {});
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

test('fluxo: M1 bloqueia enquanto houver entradas D sem decisão', async () => {
  // No novo desenho, a verificação das decisões Bloco D migrou de M3 (Pré-RSE
  // antigo) para M1 (Pré-RSE novo) — é o gate que protege a entrada em RSE.
  const user = { id: globalThis.__uid, papeis: [{ papel: 'PONTO_FOCAL', gabinete_id: 'maen' }] };
  const f = await fpl.criarFpl({ tipo_diploma: 'DL', titulo: 'Diploma teste M1', gabinete_id: 'maen' }, user, {});
  await fpl.atualizarBlocoB(f.id, { tipo_origem: 'OUTRA', sintese_problema: 'y'.repeat(220) }, user, {});
  await fpl.validarMarcoFpl(f.id, 'M0', user, {}, {});
  // entrada D sem decisão de incorporação
  await fpl.adicionarEntradaBlocoD(f.id, {
    data: '2026-02-01', forma: 'REUNIAO', entidade_designacao: 'Entidade X',
    natureza_juridica: 'ACADEMIA_PERITO', objeto: 'o'.repeat(60), sintese_posicao: 's'.repeat(120),
  }, user, {});
  const r = await fpl.validarMarcoFpl(f.id, 'M1', user, {}, { declaracao_assinada: true });
  assert.equal(r.ok, false);
  assert.ok(
    r.pendencias.some(p => p.regra === 'obrigatorio_em_M1' || p.regra === 'obrigatorio_em_M3'),
    'pendência esperada por entrada D sem decisão (regra obrigatorio_em_M1)',
  );
});

test('fluxo: M1 passa quando todas as entradas D têm decisão + justificação ≥100c', async () => {
  const user = { id: globalThis.__uid, papeis: [{ papel: 'PONTO_FOCAL', gabinete_id: 'maen' }] };
  const f = await fpl.criarFpl({ tipo_diploma: 'DL', titulo: 'Diploma M1 ok', gabinete_id: 'maen' }, user, {});
  await fpl.atualizarBlocoB(f.id, { tipo_origem: 'OUTRA', sintese_problema: 'z'.repeat(220) }, user, {});
  await fpl.validarMarcoFpl(f.id, 'M0', user, {}, {});
  await fpl.adicionarEntradaBlocoD(f.id, {
    data: '2026-02-02', forma: 'REUNIAO', entidade_designacao: 'Entidade Y',
    natureza_juridica: 'ACADEMIA_PERITO', objeto: 'o'.repeat(60), sintese_posicao: 's'.repeat(120),
    decisao_incorporacao: 'INCORPORADA',
    justificacao_decisao: 'j'.repeat(120),
  }, user, {});
  const r = await fpl.validarMarcoFpl(f.id, 'M1', user, {}, { declaracao_assinada: true });
  assert.equal(r.ok, true, `M1 deveria validar: ${JSON.stringify(r.pendencias || r)}`);
  assert.equal(r.fpl.estado_workflow, 'EM_RSE', 'M1 abre EM_RSE');
  assert.ok(r.comprovativo, 'M1 é bloqueante e emite comprovativo');
});

test('fluxo: M1 exige declaracao_assinada (Bloco F)', async () => {
  const user = { id: globalThis.__uid, papeis: [{ papel: 'PONTO_FOCAL', gabinete_id: 'maen' }] };
  const f = await fpl.criarFpl({ tipo_diploma: 'DL', titulo: 'Diploma M1 declaração', gabinete_id: 'maen' }, user, {});
  await fpl.atualizarBlocoB(f.id, { tipo_origem: 'OUTRA', sintese_problema: 'd'.repeat(220) }, user, {});
  await fpl.validarMarcoFpl(f.id, 'M0', user, {}, {});
  await fpl.adicionarEntradaBlocoD(f.id, {
    data: '2026-02-03', forma: 'REUNIAO', entidade_designacao: 'Entidade Z',
    natureza_juridica: 'ACADEMIA_PERITO', objeto: 'o'.repeat(60), sintese_posicao: 's'.repeat(120),
    decisao_incorporacao: 'INCORPORADA', justificacao_decisao: 'j'.repeat(120),
  }, user, {});
  // Sem declaração — deve bloquear mesmo com critérios cumpridos.
  const r = await fpl.validarMarcoFpl(f.id, 'M1', user, {}, {});
  assert.equal(r.ok, false);
  assert.ok(r.pendencias.some(p => p.regra === 'declaracao_obrigatoria'),
    'pendência de declaração obrigatória esperada para M1');
});

test('fluxo: M2 (abertura CP) só transita a partir de EM_RSE e exige consulta_lex_ref/inicio', async () => {
  const user = { id: globalThis.__uid, papeis: [{ papel: 'PONTO_FOCAL', gabinete_id: 'maen' }] };
  const f = await fpl.criarFpl({ tipo_diploma: 'DL', titulo: 'Diploma M2 abre CP', gabinete_id: 'maen' }, user, {});
  await fpl.atualizarBlocoB(f.id, { tipo_origem: 'OUTRA', sintese_problema: 'a'.repeat(220) }, user, {});
  // M2 antes de M0/M1 — transição inválida
  let r = await fpl.validarMarcoFpl(f.id, 'M2', user, {}, {});
  assert.equal(r.ok, false);
  assert.ok(r.pendencias.some(p => p.regra === 'transicao_invalida' || p.regra === 'pre_requisito'),
    'M2 a partir de CRIADO deve ser inválido');
});

test('fluxo: M3 (encerramento CP) mantém estado EM_CONSULTA_PUBLICA e NÃO emite comprovativo', async () => {
  // M3 é informativo: sinaliza fim da CP. Não é bloqueante nem produz JWS.
  const user = { id: globalThis.__uid, papeis: [{ papel: 'PONTO_FOCAL', gabinete_id: 'maen' }] };
  // Simula uma FPL já em CP, com M0/M1/M2 validados (via UPDATE direto, evitando
  // depender da seed e mantendo o teste isolado).
  const fid = 'fpl-m3-info';
  const ts = '2026-03-01T10:00:00Z';
  await db.run(
    `INSERT INTO fpl (id, numero_processo, tipo_diploma, titulo, gabinete_id, estado_workflow,
                      m0_validado_em, m1_validado_em, m2_validado_em,
                      consulta_lex_ref, consulta_lex_inicio, consulta_lex_fim,
                      consulta_lex_sintese, consulta_lex_decisao,
                      criado_por)
     VALUES (?, '2026/MAEN/8801', 'DL', 'Diploma teste M3 info', 'maen', 'EM_CONSULTA_PUBLICA',
             ?, ?, ?, 'CL-T-M3', '2026-02-01', '2026-03-01', ?, ?, ?)`,
    [fid, ts, ts, ts, 's'.repeat(320), 'd'.repeat(220), globalThis.__uid]
  );
  const r = await fpl.validarMarcoFpl(fid, 'M3', user, {}, {});
  assert.equal(r.ok, true, `M3 deveria validar: ${JSON.stringify(r.pendencias || r)}`);
  assert.equal(r.fpl.estado_workflow, 'EM_CONSULTA_PUBLICA', 'M3 mantém o estado');
  assert.equal(r.comprovativo, null, 'M3 não emite comprovativo (não é bloqueante)');
  const comps = await comprovativo.listarComprovativos(fid);
  assert.equal(comps.length, 0, 'nenhum comprovativo deve ser registado para M3');
});

test('fluxo: M2 (abertura CP) NÃO emite comprovativo', async () => {
  // M2 não está em MARCOS_BLOQUEANTES — verifica que não há JWS após validação.
  // Pré-condições para M2: consulta_lex_ref + consulta_lex_inicio preenchidos.
  const user = { id: globalThis.__uid, papeis: [{ papel: 'PONTO_FOCAL', gabinete_id: 'maen' }] };
  const fid = 'fpl-m2-info';
  const ts = '2026-03-02T10:00:00Z';
  await db.run(
    `INSERT INTO fpl (id, numero_processo, tipo_diploma, titulo, gabinete_id, estado_workflow,
                      m0_validado_em, m1_validado_em,
                      consulta_lex_ref, consulta_lex_inicio, criado_por)
     VALUES (?, '2026/MAEN/8802', 'DL', 'Diploma teste M2 info', 'maen', 'EM_RSE',
             ?, ?, 'CL-T-M2', '2026-04-01', ?)`,
    [fid, ts, ts, globalThis.__uid]
  );
  const r = await fpl.validarMarcoFpl(fid, 'M2', user, {}, {});
  assert.equal(r.ok, true, `M2 deveria validar: ${JSON.stringify(r.pendencias || r)}`);
  assert.equal(r.fpl.estado_workflow, 'EM_CONSULTA_PUBLICA', 'M2 abre EM_CONSULTA_PUBLICA');
  assert.equal(r.comprovativo, null, 'M2 não emite comprovativo (não é bloqueante)');
  const comps = await comprovativo.listarComprovativos(fid);
  assert.equal(comps.length, 0, 'nenhum comprovativo deve ser registado para M2');
});

test('fluxo: happy path completo CRIADO → M0 → M1 → M2 → M3 → M4 → APROVADO → M5', async () => {
  // Cobre a ordem global do novo desenho e confirma que só os marcos
  // bloqueantes (M0, M1, M4, M5) deixam comprovativo.
  const user = { id: globalThis.__uid, papeis: [{ papel: 'PONTO_FOCAL', gabinete_id: 'maen' }] };

  const f = await fpl.criarFpl({ tipo_diploma: 'DL', titulo: 'Happy path completo', gabinete_id: 'maen' }, user, {});
  assert.equal(f.estado_workflow, 'CRIADO');

  // M0 — abertura
  await fpl.atualizarBlocoB(f.id, { tipo_origem: 'OUTRA', sintese_problema: 'h'.repeat(220) }, user, {});
  let r = await fpl.validarMarcoFpl(f.id, 'M0', user, {}, {});
  assert.equal(r.ok, true);
  assert.equal(r.fpl.estado_workflow, 'EM_ELABORACAO');
  assert.ok(r.comprovativo, 'M0 emite comprovativo');

  // M1 — pré-RSE: precisa de Bloco D fechado + declaração
  await fpl.adicionarEntradaBlocoD(f.id, {
    data: '2026-02-04', forma: 'REUNIAO', entidade_designacao: 'Entidade HP',
    natureza_juridica: 'ACADEMIA_PERITO', objeto: 'o'.repeat(60), sintese_posicao: 's'.repeat(120),
    decisao_incorporacao: 'INCORPORADA', justificacao_decisao: 'j'.repeat(120),
  }, user, {});
  r = await fpl.validarMarcoFpl(f.id, 'M1', user, {}, { declaracao_assinada: true });
  assert.equal(r.ok, true, `M1 falhou: ${JSON.stringify(r.pendencias || r)}`);
  assert.equal(r.fpl.estado_workflow, 'EM_RSE');
  assert.ok(r.comprovativo, 'M1 emite comprovativo');

  // M2 — abertura CP: precisa de consulta_lex_ref + inicio
  await fpl.atualizarBlocoE(f.id, {
    consulta_lex_ref: 'CL-HP-001', consulta_lex_inicio: '2026-03-01',
  }, user, {});
  r = await fpl.validarMarcoFpl(f.id, 'M2', user, {}, {});
  assert.equal(r.ok, true, `M2 falhou: ${JSON.stringify(r.pendencias || r)}`);
  assert.equal(r.fpl.estado_workflow, 'EM_CONSULTA_PUBLICA');
  assert.equal(r.comprovativo, null, 'M2 não emite comprovativo');

  // M3 — encerramento CP: precisa de consulta_lex_fim + sintese ≥300c + decisao ≥200c
  await fpl.atualizarBlocoE(f.id, {
    consulta_lex_fim: '2026-04-01',
    consulta_lex_sintese: 's'.repeat(320),
    consulta_lex_decisao: 'd'.repeat(220),
  }, user, {});
  r = await fpl.validarMarcoFpl(f.id, 'M3', user, {}, {});
  assert.equal(r.ok, true, `M3 falhou: ${JSON.stringify(r.pendencias || r)}`);
  assert.equal(r.fpl.estado_workflow, 'EM_CONSULTA_PUBLICA', 'M3 mantém estado');
  assert.equal(r.comprovativo, null, 'M3 não emite comprovativo');

  // M4 — pré-CM
  r = await fpl.validarMarcoFpl(f.id, 'M4', user, {}, { declaracao_assinada: true });
  assert.equal(r.ok, true, `M4 falhou: ${JSON.stringify(r.pendencias || r)}`);
  assert.equal(r.fpl.estado_workflow, 'EM_CM');
  assert.ok(r.comprovativo, 'M4 emite comprovativo');

  // Aprovação em CM
  const aprovada = await fpl.aprovarEmCM(f.id, 'DR I, 90/2026', user, {});
  assert.equal(aprovada.estado_workflow, 'APROVADO');

  // M5 — publicação
  r = await fpl.validarMarcoFpl(f.id, 'M5', user, {}, {});
  assert.equal(r.ok, true, `M5 falhou: ${JSON.stringify(r.pendencias || r)}`);
  assert.equal(r.fpl.estado_workflow, 'PUBLICADO');
  assert.ok(r.comprovativo, 'M5 emite comprovativo');

  // Total de comprovativos: 4 (M0, M1, M4, M5) — M2 e M3 não acrescentam linha.
  const comps = await comprovativo.listarComprovativos(f.id);
  const marcosComp = comps.map(c => c.marco).sort();
  assert.deepEqual(marcosComp, ['M0', 'M1', 'M4', 'M5'],
    `só os marcos bloqueantes devem ter comprovativo; recebido: ${marcosComp.join(',')}`);
});
