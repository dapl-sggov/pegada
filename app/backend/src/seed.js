// seed.js — Povoamento inicial: gabinetes, utilizadores demo, entidades RTRI,
// FPL de exemplo. Idempotente o suficiente para correr após `migrate`.
// API assíncrona (driver dual).

import { initDb, db } from './db.js';
import { migrate } from './migrate.js';
import { uuid, jsonStringify } from './util.js';
import { hashPassword } from './auth.js';

const GABINETES = [
  ['mae', 'MAE', 'Ministério do Ambiente e da Energia'],
  ['ms', 'MS', 'Ministério da Saúde'],
  ['mtsss', 'MTSSS', 'Ministério do Trabalho, Solidariedade e Segurança Social'],
  ['me', 'ME', 'Ministério da Economia'],
  ['mj', 'MJ', 'Ministério da Justiça'],
  ['mecic', 'MECIC', 'Ministério da Educação, Ciência e Inovação'],
  ['mf', 'MF', 'Ministério das Finanças'],
  ['mai', 'MAI', 'Ministério da Administração Interna'],
  ['sggov', 'SGGOV', 'Secretaria-Geral do Governo'],
];

const UTILIZADORES = [
  { email: 'maria.silva@gov.pt', nome: 'Maria Silva', nif: '100000001', papel: 'PONTO_FOCAL', gab: 'mae' },
  { email: 'joao.pereira@gov.pt', nome: 'João Pereira', nif: '100000002', papel: 'PONTO_FOCAL_ALT', gab: 'mae' },
  { email: 'ana.santos@gov.pt', nome: 'Ana Santos', nif: '100000003', papel: 'PONTO_FOCAL', gab: 'ms' },
  { email: 'pedro.lopes@gov.pt', nome: 'Pedro Lopes', nif: '100000004', papel: 'PONTO_FOCAL', gab: 'mtsss' },
  { email: 'rui.ferreira@sggov.pt', nome: 'Rui Ferreira', nif: '100000005', papel: 'SGGOV_QA', gab: null },
  { email: 'carla.almeida@sggov.pt', nome: 'Carla Almeida', nif: '100000006', papel: 'SGGOV_ADMIN', gab: null },
  { email: 'gsepcm@gov.pt', nome: 'GSEPCM (receção)', nif: '100000007', papel: 'GSEPCM', gab: null },
];

const RTRI = [
  ['RTRI/2025/00018', 'Confederação da Indústria Portuguesa (CIP)', 'Confederação patronal', '2025-01-15'],
  ['RTRI/2025/00027', 'Confederação Geral dos Trabalhadores Portugueses (CGTP)', 'Confederação sindical', '2025-01-15'],
  ['RTRI/2025/00031', 'União Geral de Trabalhadores (UGT)', 'Confederação sindical', '2025-01-15'],
  ['RTRI/2025/00056', 'Ordem dos Engenheiros (OE)', 'Associação pública profissional', '2025-01-20'],
  ['RTRI/2025/00061', 'Ordem dos Médicos', 'Associação pública profissional', '2025-01-20'],
  ['RTRI/2025/00088', 'EDP — Energias de Portugal, S.A.', 'Empresa', '2025-02-10'],
  ['RTRI/2025/00091', 'Galp Energia, S.A.', 'Empresa', '2025-02-10'],
  ['RTRI/2025/00142', 'APREN — Associação Portuguesa de Energias Renováveis', 'Associação setorial', '2025-02-22'],
  ['RTRI/2025/00214', 'ZERO — Associação Sistema Terrestre Sustentável', 'Associação ambientalista', '2025-03-10'],
  ['RTRI/2025/00309', 'Quercus — Associação Nacional de Conservação da Natureza', 'Associação ambientalista', '2025-03-25'],
  ['RTRI/2025/00415', 'APED — Associação Portuguesa de Empresas de Distribuição', 'Associação setorial', '2025-04-05'],
  ['RTRI/2025/00467', 'APIFARMA — Associação Portuguesa da Indústria Farmacêutica', 'Associação setorial', '2025-04-12'],
  ['RTRI/2025/00482', 'Associação Portuguesa de Bancos (APB)', 'Associação setorial', '2025-04-15'],
  ['RTRI/2025/00513', 'CCP — Confederação do Comércio e Serviços de Portugal', 'Confederação patronal', '2025-04-20'],
  ['RTRI/2025/00604', 'DECO — Associação Portuguesa para a Defesa do Consumidor', 'Associação de consumidores', '2025-05-02'],
];

async function tabelaVazia(t) {
  const r = await db.get(`SELECT COUNT(*) as n FROM ${t}`);
  return !r || r.n === 0;
}

async function seed() {
  await initDb();
  await migrate();
  console.log('→ Schema garantido.');

  if (!(await tabelaVazia('utilizador'))) {
    console.log('ℹ A base de dados já contém dados — seed ignorado (use `migrate` para apenas atualizar o schema).');
    return;
  }

  console.log('→ Gabinetes...');
  for (const [id, sigla, nome] of GABINETES) {
    await db.run('INSERT INTO gabinete (id, sigla, nome) VALUES (?, ?, ?)', [id, sigla, nome]);
  }

  console.log('→ Utilizadores (password: demo1234)...');
  const hash = await hashPassword('demo1234');
  const userIdByEmail = {};
  for (const u of UTILIZADORES) {
    const id = uuid();
    userIdByEmail[u.email] = id;
    await db.run(
      'INSERT INTO utilizador (id, email, nome_completo, password_hash, nif) VALUES (?, ?, ?, ?, ?)',
      [id, u.email, u.nome, hash, u.nif]
    );
    await db.run(
      'INSERT INTO atribuicao_papel (utilizador_id, papel, gabinete_id) VALUES (?, ?, ?)',
      [id, u.papel, u.gab]
    );
  }

  console.log('→ Entidades RTRI...');
  for (const [rtri_id, designacao, natureza, data] of RTRI) {
    await db.run(
      'INSERT INTO entidade_rtri (rtri_id, designacao, natureza_juridica, data_inscricao) VALUES (?, ?, ?, ?)',
      [rtri_id, designacao, natureza, data]
    );
  }

  console.log('→ FPL de exemplo...');
  const maria = userIdByEmail['maria.silva@gov.pt'];
  // FPL 1 — em elaboração, com Bloco B preenchido e uma interação no Bloco D
  const f1 = uuid();
  await db.run(
    `INSERT INTO fpl (id, numero_processo, tipo_diploma, titulo, titulo_curto, gabinete_id,
                      estado_workflow, tipo_origem, referencia_origem, sintese_problema, avaliacao_previa,
                      m0_validado_em, m0_validado_por, criado_por, versao_atual)
     VALUES (?, '2026/MAE/0042', 'DL', ?, ?, 'mae', 'EM_ELABORACAO', 'PROGRAMA_GOVERNO', 'Eixo III, medida 4.2',
             ?, 1, ?, ?, ?, 2)`,
    [f1,
     'Decreto-Lei que aprova o regime jurídico da produção descentralizada de energia a partir de fontes renováveis em comunidades de energia',
     'Comunidades de energia renovável',
     'O presente diploma estabelece o quadro jurídico para a constituição e funcionamento de comunidades de energia renovável (CER), em conformidade com a Diretiva (UE) 2018/2001 (RED II), criando condições para a participação ativa de cidadãos, autarquias e PME na transição energética e eliminando barreiras administrativas e tarifárias.',
     new Date().toISOString(), maria, maria]
  );
  await db.run(
    `INSERT INTO versao_fpl (id, fpl_id, numero, autor_id, snapshot, marco_validado, descricao)
     VALUES (?, ?, 1, ?, '{}', NULL, 'FPL criada'), (?, ?, 2, ?, '{}', 'M0', 'M0 validado · comprovativo emitido')`,
    [uuid(), f1, maria, uuid(), f1, maria]
  );
  await db.run(
    `INSERT INTO entrada_bloco_d (id, fpl_id, data, forma, entidade_designacao, rtri_id, rtri_status,
                                  natureza_juridica, pessoas_governo, pessoas_interlocutor, objeto, sintese_posicao)
     VALUES (?, ?, '2026-02-12', 'REUNIAO', 'APREN — Associação Portuguesa de Energias Renováveis',
             'RTRI/2025/00142', 'VALIDADO', 'RTRI_INSCRITO', ?, ?, ?, ?)`,
    [uuid(), f1,
     jsonStringify(['Secretária de Estado do Ambiente', 'Adjunta SE']),
     jsonStringify(['Presidente APREN']),
     'Apresentação de proposta de regime para comunidades de energia renovável e simplificação do licenciamento.',
     'A APREN propôs um regime único para CER que abranja autoconsumo coletivo, partilha de energia entre membros e venda de excedentes em mercado, e a simplificação do licenciamento até 1 MW de potência instalada.']
  );

  // FPL 2 — só criada (CRIADO), para demonstrar o fluxo desde o início
  const f2 = uuid();
  await db.run(
    `INSERT INTO fpl (id, numero_processo, tipo_diploma, titulo, gabinete_id, estado_workflow, criado_por)
     VALUES (?, '2026/MS/0011', 'DL', ?, 'ms', 'CRIADO', ?)`,
    [f2, 'Decreto-Lei que aprova o regime de partilha de dados de saúde para fins de investigação científica',
     userIdByEmail['ana.santos@gov.pt']]
  );
  await db.run(
    `INSERT INTO versao_fpl (id, fpl_id, numero, autor_id, snapshot, descricao) VALUES (?, ?, 1, ?, '{}', 'FPL criada')`,
    [uuid(), f2, userIdByEmail['ana.santos@gov.pt']]
  );

  console.log('✓ Seed concluído.\n');
  console.log('  Utilizadores (password: demo1234):');
  for (const u of UTILIZADORES) {
    console.log(`    • ${u.email.padEnd(28)} ${u.papel}${u.gab ? ' @ ' + u.gab : ''}  (NIF ${u.nif})`);
  }
}

seed()
  .then(() => process.exit(0))
  .catch(e => { console.error('✗ Seed falhou:', e); process.exit(1); });
