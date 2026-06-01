// seed.js — Dados de demonstração mínimos.

import { db, initDb } from './db.js';
import { migrate } from './migrate.js';
import { uuid } from './util.js';

const GABINETES = [
  { sigla: 'MAEN', nome: 'Ministério dos Assuntos Estrangeiros e da Nação' },
  { sigla: 'MS',   nome: 'Ministério da Saúde' },
  { sigla: 'MTSSS', nome: 'Ministério do Trabalho, Solidariedade e Segurança Social' },
  { sigla: 'MECT', nome: 'Ministério da Economia, Comércio e Turismo' },
  { sigla: 'MJ',   nome: 'Ministério da Justiça' },
  { sigla: 'MECI', nome: 'Ministério da Educação, Ciência e Inovação' },
  { sigla: 'MEF',  nome: 'Ministério de Estado e das Finanças' },
  { sigla: 'MAI',  nome: 'Ministério da Administração Interna' },
  { sigla: 'MIH',  nome: 'Ministério das Infraestruturas e Habitação' },
  { sigla: 'MCJD', nome: 'Ministério da Cultura, Juventude e Desporto' },
  { sigla: 'MAM',  nome: 'Ministério do Ambiente e Mar' },
  { sigla: 'MDN',  nome: 'Ministério da Defesa Nacional' },
  { sigla: 'MENE', nome: 'Ministério da Energia' },
  { sigla: 'MP',   nome: 'Ministério das Pescas' },
  { sigla: 'MARE', nome: 'Ministério da Agricultura, Florestas e Desenvolvimento Rural' },
  { sigla: 'MAP',  nome: 'Ministério da Administração Pública' },
  { sigla: 'SGGOV', nome: 'Secretaria-Geral do Governo' },
];

const UTILIZADORES = [
  { email: 'maria.silva@maen.gov.pt',          nome: 'Maria Silva',          papel: 'PONTO_FOCAL',  gab: 'MAEN' },
  { email: 'joao.santos@ms.gov.pt',            nome: 'João Santos',          papel: 'PONTO_FOCAL',  gab: 'MS' },
  { email: 'ana.pereira@mtsss.gov.pt',         nome: 'Ana Pereira',          papel: 'PONTO_FOCAL',  gab: 'MTSSS' },
  { email: 'pedro.costa@mect.gov.pt',          nome: 'Pedro Costa',          papel: 'PONTO_FOCAL',  gab: 'MECT' },
  { email: 'rita.almeida@mj.gov.pt',           nome: 'Rita Almeida',         papel: 'PONTO_FOCAL',  gab: 'MJ' },
  { email: 'rui.ferreira@sggoverno.gov.pt',    nome: 'Rui Ferreira',         papel: 'SGGOV_QA',     gab: null },
  { email: 'carla.almeida@sggoverno.gov.pt',   nome: 'Carla Almeida',        papel: 'SGGOV_ADMIN',  gab: null },
  { email: 'goncalo.matos@sggoverno.gov.pt',   nome: 'Gonçalo Matos',        papel: 'GSEPCM',       gab: null },
];

async function ensureGabinete(sigla, nome) {
  const ex = await db.get('SELECT id FROM gabinete WHERE sigla = ?', [sigla]);
  if (ex) return ex.id;
  const id = uuid();
  await db.run('INSERT INTO gabinete (id, sigla, nome) VALUES (?, ?, ?)', [id, sigla, nome]);
  return id;
}

async function ensureUtilizador(email, nome) {
  const ex = await db.get('SELECT id FROM utilizador WHERE email = ?', [email]);
  if (ex) return ex.id;
  const id = uuid();
  await db.run('INSERT INTO utilizador (id, email, nome_completo) VALUES (?, ?, ?)', [id, email, nome]);
  return id;
}

async function assignRole(userId, papel, gabineteId) {
  await db.run(
    `INSERT INTO atribuicao_papel (utilizador_id, papel, gabinete_id) VALUES (?, ?, ?)
     ON CONFLICT DO NOTHING`,
    [userId, papel, gabineteId]
  );
}

async function exemplosFpl() {
  const gab = await db.get(`SELECT id, sigla FROM gabinete WHERE sigla = 'MAEN'`);
  const focal = await db.get(`SELECT id FROM utilizador WHERE email = 'maria.silva@maen.gov.pt'`);
  if (!gab || !focal) return;
  const existe = await db.get('SELECT id FROM fpl WHERE numero_processo LIKE ? LIMIT 1', [`2026/${gab.sigla}/%`]);
  if (existe) return;

  const id = uuid();
  await db.run(
    `INSERT INTO fpl (id, numero_processo, tipo_diploma, titulo, titulo_curto, gabinete_id,
                      estado, tipo_origem, sintese_problema, criado_por)
     VALUES (?, ?, 'DL', ?, 'Reforma da carreira diplomática', ?, 'EM_CONSULTA_PUBLICA', 'PROGRAMA', ?, ?)`,
    [id, `2026/${gab.sigla}/0001`,
     'Decreto-Lei que aprova a reforma da carreira diplomática e cooperação internacional',
     gab.id,
     'Decorre do Programa do XXV Governo a necessidade de modernizar o estatuto da carreira diplomática, alinhando-o com a prática europeia e dignificando as funções de representação externa do Estado em contextos cada vez mais complexos. O regime vigente data de 2008 e revela-se desatualizado quanto a mecanismos de mobilidade, formação contínua e remuneração compatível com a função.',
     focal.id]
  );

  await db.run(
    `INSERT INTO audicao (id, fpl_id, categoria, entidade, base_legal, forma, estado, sintese_posicao)
     VALUES (?, ?, 'OBRIGATORIA', 'Sindicato dos Trabalhadores Consulares e das Missões Diplomáticas',
             'Lei Geral do Trabalho em Funções Públicas, art. 16.º', 'AUDIENCIA', 'RESPONDEU',
             'O Sindicato manifesta concordância com os princípios da reforma mas solicita salvaguardas para o regime transitório de trabalhadores no estrangeiro e clarificação sobre o regime de mobilidade interna.')`,
    [uuid(), id]
  );
  await db.run(
    `INSERT INTO audicao (id, fpl_id, categoria, entidade, forma, estado, sintese_posicao)
     VALUES (?, ?, 'GSEPCM', 'Conselho de Embaixadores', 'ESCRITA', 'RESPONDEU',
             'O Conselho de Embaixadores recomenda reforço da componente formativa em política europeia e em multilateralismo.')`,
    [uuid(), id]
  );
  await db.run(
    `UPDATE fpl SET cl_link = 'https://consulta.lex.pt/processos/2026-maen-0001',
                    cl_n_contributos = 23,
                    cl_sintese = 'A consulta pública recebeu 23 contributos. A maioria (15) incide sobre o regime transitório, com sugestões integradas no Capítulo VII. Os contributos sobre a tabela remuneratória (5) foram analisados em sede de avaliação de impacto orçamental e parcialmente acolhidos. Os restantes 3 foram de natureza informativa.'
     WHERE id = ?`, [id]
  );
  await db.run(`UPDATE fpl SET m0_em = datetime('now', '-30 days'), m0_por = ? WHERE id = ?`, [focal.id, id]);
  await db.run(`UPDATE fpl SET m2_em = datetime('now', '-20 days') WHERE id = ?`, [id]);
}

export async function seed() {
  await initDb();
  await migrate();
  const sigToId = {};
  for (const g of GABINETES) sigToId[g.sigla] = await ensureGabinete(g.sigla, g.nome);
  for (const u of UTILIZADORES) {
    const uid = await ensureUtilizador(u.email, u.nome);
    await assignRole(uid, u.papel, u.gab ? sigToId[u.gab] : null);
  }
  await exemplosFpl();
  return { gabinetes: GABINETES.length, utilizadores: UTILIZADORES.length };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('seed.js')) {
  seed()
    .then(r => { console.log(`✓ Seed: ${r.gabinetes} gabinetes, ${r.utilizadores} utilizadores.`); process.exit(0); })
    .catch(e => { console.error('✗ Falha:', e.message); process.exit(1); });
}
