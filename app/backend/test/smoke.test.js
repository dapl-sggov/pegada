// smoke.test.js — Verificação smoke da versão simplificada.
// Cobre: BD arranca, schema aplica, seed corre, JSON canónico produz output,
// ficha pública gera HTML, marco M0 valida, audições D1/D2 e ingestão INTEGRA.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

process.env.DATABASE_FILE = path.join(os.tmpdir(), `fpl-test-${Date.now()}.sqlite`);
process.env.NODE_ENV = 'test';
process.env.RATE_LIMIT_DISABLE = '1';

const { initDb, db } = await import('../src/db.js');
const { migrate } = await import('../src/migrate.js');
const { seed } = await import('../src/seed.js');
const { toCanonico, SCHEMA_ID } = await import('../src/canonico.js');
const { gerarFichaPublica } = await import('../src/ficha_publica.js');
const fpl = await import('../src/fpl.js');

before(async () => {
  await initDb();
  await migrate();
  await seed();
});

after(async () => {
  await db.close();
  try { fs.unlinkSync(process.env.DATABASE_FILE); } catch {}
  try { fs.unlinkSync(process.env.DATABASE_FILE + '-wal'); } catch {}
  try { fs.unlinkSync(process.env.DATABASE_FILE + '-shm'); } catch {}
});

test('schema: tabelas mínimas existem', async () => {
  const tabelas = ['utilizador', 'gabinete', 'atribuicao_papel', 'sessao', 'fpl',
                   'audicao', 'interacao_integra', 'evento', 'versao_fpl',
                   'anexo', 'tentativa_login', 'conta_bloqueada'];
  for (const t of tabelas) {
    const r = await db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`, [t]);
    assert.ok(r, `tabela ${t} criada no schema`);
  }
});

test('seed: gabinetes oficiais XXV Governo + utilizadores demo', async () => {
  const gab = await db.get('SELECT COUNT(*) as n FROM gabinete');
  assert.ok(gab.n >= 16, `pelo menos 16 gabinetes (tem ${gab.n})`);
  const maen = await db.get(`SELECT id FROM gabinete WHERE sigla = 'MAEN'`);
  assert.ok(maen, 'MAEN existe');
  const maria = await db.get(`SELECT id FROM utilizador WHERE email = 'maria.silva@maen.gov.pt'`);
  assert.ok(maria, 'PF MAEN existe');
});

test('canonico: exporta FPL exemplo com schema correto', async () => {
  const f = await db.get(`SELECT id FROM fpl WHERE numero_processo LIKE '2026/MAEN/%' LIMIT 1`);
  assert.ok(f, 'FPL exemplo existe');
  const c = await toCanonico(f.id);
  assert.equal(c.schema, SCHEMA_ID);
  assert.equal(c.estado, 'EM_CONSULTA_PUBLICA');
  assert.ok(c.blocos.D1_audicoes_obrigatorias.length >= 1, 'tem audição D.1');
  assert.ok(c.blocos.D2_audicoes_gsepcm.length >= 1, 'tem audição D.2');
  assert.ok(c.blocos.E_consulta_publica.cl_link, 'tem link ConsultaLex');
});

test('ficha-publica: gera HTML autocontido', async () => {
  const f = await db.get(`SELECT id FROM fpl WHERE numero_processo LIKE '2026/MAEN/%' LIMIT 1`);
  const html = await gerarFichaPublica(f.id);
  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /Pegada Legislativa/);
  assert.match(html, /Sindicato dos Trabalhadores Consulares/);
  assert.match(html, /ConsultaLex/);
});

test('audicao: criar D.1 e D.2 com validação', async () => {
  const gab = await db.get(`SELECT id FROM gabinete WHERE sigla = 'MS'`);
  const user = await db.get(`SELECT id FROM utilizador WHERE email = 'joao.santos@ms.gov.pt'`);
  const f = await fpl.criarFpl(
    { tipo_diploma: 'DL', titulo: 'Teste smoke', gabinete_id: gab.id },
    { id: user.id, papeis: [{ papel: 'PONTO_FOCAL', gabinete_id: gab.id }] },
    { ip: '127.0.0.1', headers: {} }
  );
  assert.equal(f.estado, 'RASCUNHO');

  const audId = await fpl.adicionarAudicao(f.id, {
    categoria: 'OBRIGATORIA',
    entidade: 'CES',
    base_legal: 'Lei do CES',
    estado: 'PEDIDA',
  }, { id: user.id }, { ip: '127.0.0.1', headers: {} });
  assert.ok(audId);

  // Categoria inválida → erro
  await assert.rejects(
    () => fpl.adicionarAudicao(f.id, { categoria: 'INVALIDA', entidade: 'X' }, { id: user.id }, { headers: {} }),
    /Validação falhou/
  );
});

test('integra: ingestão JSON aparece em D.3 canónico', async () => {
  const gab = await db.get(`SELECT id FROM gabinete WHERE sigla = 'MTSSS'`);
  const user = await db.get(`SELECT id FROM utilizador WHERE email = 'ana.pereira@mtsss.gov.pt'`);
  const f = await fpl.criarFpl(
    { tipo_diploma: 'PL', titulo: 'Teste INTEGRA', gabinete_id: gab.id },
    { id: user.id, papeis: [{ papel: 'PONTO_FOCAL', gabinete_id: gab.id }] },
    { ip: '127.0.0.1', headers: {} }
  );
  await fpl.ingerirIntegra(f.id, {
    gabinete: 'MTSSS',
    entradas: [
      { data: '2026-02-01', entidade: 'Confederação X', objeto: 'Conversa preparatória', sintese: 'Discussão de princípios.' },
      { data: '2026-02-15', entidade: 'Associação Y', objeto: 'Reunião técnica', sintese: 'Detalhe do regime.' },
    ],
  }, { id: user.id }, { headers: {} });
  const c = await toCanonico(f.id);
  assert.equal(c.blocos.D3_integra.length, 2);
  assert.equal(c.blocos.D3_integra[0].gabinete_origem, 'MTSSS');
});

test('marco M0: bloqueia sem síntese, passa com síntese', async () => {
  const gab = await db.get(`SELECT id FROM gabinete WHERE sigla = 'MJ'`);
  const user = await db.get(`SELECT id FROM utilizador WHERE email = 'rita.almeida@mj.gov.pt'`);
  const u = { id: user.id, papeis: [{ papel: 'PONTO_FOCAL', gabinete_id: gab.id }] };
  const f = await fpl.criarFpl(
    { tipo_diploma: 'DL', titulo: 'Teste M0', gabinete_id: gab.id }, u, { headers: {} }
  );
  let r = await fpl.validarMarcoFpl(f.id, 'M0', u, { headers: {} });
  assert.equal(r.ok, false, 'M0 bloqueia sem Bloco B');

  await fpl.atualizarBlocoB(f.id, {
    tipo_origem: 'INICIATIVA_GABINETE',
    sintese_problema: 'Síntese suficientemente longa para passar o mínimo de 200 caracteres. ' +
      'O problema identificado consiste em colmatar uma lacuna do regime vigente que afeta a operação corrente dos serviços e a previsibilidade para os destinatários.',
  }, u, { headers: {} });

  r = await fpl.validarMarcoFpl(f.id, 'M0', u, { headers: {} });
  assert.equal(r.ok, true, `M0 passa após Bloco B (pendencias: ${JSON.stringify(r.pendencias)})`);
  assert.equal(r.fpl.estado, 'EM_RSE');
});
