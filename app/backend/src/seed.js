// seed.js — Povoamento inicial: gabinetes, utilizadores demo, entidades RTRI,
// FPL de exemplo. Idempotente o suficiente para correr após `migrate`.
// API assíncrona (driver dual).

import { initDb, db } from './db.js';
import { migrate } from './migrate.js';
import { uuid, jsonStringify } from './util.js';
import { hashPassword } from './auth.js';

// XXV Governo Constitucional — siglas oficiais.
// Fonte: SMARTBP · Tabela · Grupo Entidade: Governo (2026/02/11).
// Os emails dos PF seguem o padrão `nome@<sigla>.gov.pt` (minúsculas);
// a SGGOV usa `@sggoverno.gov.pt`.
const GABINETES = [
  ['maen',  'MAEN',  'Ministério do Ambiente e Energia'],
  ['ms',    'MS',    'Ministério da Saúde'],
  ['mtsss', 'MTSSS', 'Ministério do Trabalho, Solidariedade e Segurança Social'],
  ['mect',  'MECT',  'Ministério da Economia e da Coesão Territorial'],
  ['mj',    'MJ',    'Ministério da Justiça'],
  ['meci',  'MECI',  'Ministério da Educação, Ciência e Inovação'],
  ['mef',   'MEF',   'Ministério de Estado e das Finanças'],
  ['mai',   'MAI',   'Ministério da Administração Interna'],
  ['mih',   'MIH',   'Ministério das Infraestruturas e Habitação'],
  ['mcjd',  'MCJD',  'Ministério da Cultura, Juventude e Desporto'],
  ['mam',   'MAM',   'Ministério da Agricultura e Mar'],
  ['mdn',   'MDN',   'Ministério da Defesa Nacional'],
  ['mene',  'MENE',  'Ministério dos Negócios Estrangeiros'],
  ['mp',    'MP',    'Ministério da Presidência'],
  ['mare',  'MARE',  'Ministério Adjunto e da Reforma do Estado'],
  ['map',   'MAP',   'Ministério dos Assuntos Parlamentares'],
  ['sggov', 'SGGOV', 'Secretaria-Geral do Governo'],
];

const UTILIZADORES = [
  { email: 'maria.silva@maen.gov.pt',     nome: 'Maria Silva',     nif: '100000001', papel: 'PONTO_FOCAL',     gab: 'maen' },
  { email: 'joao.pereira@maen.gov.pt',    nome: 'João Pereira',    nif: '100000002', papel: 'PONTO_FOCAL_ALT', gab: 'maen' },
  { email: 'ana.santos@ms.gov.pt',        nome: 'Ana Santos',      nif: '100000003', papel: 'PONTO_FOCAL',     gab: 'ms' },
  { email: 'pedro.lopes@mtsss.gov.pt',    nome: 'Pedro Lopes',     nif: '100000004', papel: 'PONTO_FOCAL',     gab: 'mtsss' },
  { email: 'rui.ferreira@sggoverno.gov.pt',   nome: 'Rui Ferreira',    nif: '100000005', papel: 'SGGOV_QA',    gab: null },
  { email: 'carla.almeida@sggoverno.gov.pt',  nome: 'Carla Almeida',   nif: '100000006', papel: 'SGGOV_ADMIN', gab: null },
  { email: 'gsepcm@pcm.gov.pt',           nome: 'GSEPCM (receção)', nif: '100000007', papel: 'GSEPCM', gab: null },
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
  const maria = userIdByEmail['maria.silva@maen.gov.pt'];
  const ana = userIdByEmail['ana.santos@ms.gov.pt'];
  const pedro = userIdByEmail['pedro.lopes@mtsss.gov.pt'];

  // Datas ancoradas a "agora" para ilustrar a progressão temporal dos marcos.
  // A ordem do novo workflow é: M0 → M1 (pré-RSE) → M2 (abertura CP) →
  // M3 (encerramento CP) → M4 (pré-CM) → APROVADO → M5 (publicação).
  const now = Date.now();
  const dia = (n) => new Date(now - n * 86400000).toISOString();

  // -----------------------------------------------------------------------
  // FPL 1 — Em RSE (M0 + M1 validados). PF "fechou" as interações prévias do
  // Bloco D em M1 e assinou a declaração de completude.
  // -----------------------------------------------------------------------
  const f1 = uuid();
  await db.run(
    `INSERT INTO fpl (id, numero_processo, tipo_diploma, titulo, titulo_curto, gabinete_id,
                      estado_workflow, tipo_origem, referencia_origem, sintese_problema, avaliacao_previa,
                      m0_validado_em, m0_validado_por,
                      m1_validado_em, m1_validado_por, m1_declaracao,
                      criado_por, versao_atual)
     VALUES (?, '2026/MAEN/0042', 'DL', ?, ?, 'maen', 'EM_RSE', 'PROGRAMA_GOVERNO', 'Eixo III, medida 4.2',
             ?, 1, ?, ?, ?, ?, ?, ?, 3)`,
    [f1,
     'Decreto-Lei que aprova o regime jurídico da produção descentralizada de energia a partir de fontes renováveis em comunidades de energia',
     'Comunidades de energia renovável',
     'O presente diploma estabelece o quadro jurídico para a constituição e funcionamento de comunidades de energia renovável (CER), em conformidade com a Diretiva (UE) 2018/2001 (RED II), criando condições para a participação ativa de cidadãos, autarquias e PME na transição energética e eliminando barreiras administrativas e tarifárias.',
     dia(40), maria,
     dia(5), maria,
     'Confirmo que a presente FPL reflete todas as interações ocorridas no perímetro do diploma e que os campos obrigatórios estão integralmente preenchidos.',
     maria]
  );
  await db.run(
    `INSERT INTO versao_fpl (id, fpl_id, numero, autor_id, snapshot, marco_validado, descricao) VALUES
     (?, ?, 1, ?, '{}', NULL, 'FPL criada'),
     (?, ?, 2, ?, '{}', 'M0',  'M0 validado · comprovativo emitido'),
     (?, ?, 3, ?, '{}', 'M1',  'M1 validado · pré-RSE · comprovativo emitido')`,
    [uuid(), f1, maria,
     uuid(), f1, maria,
     uuid(), f1, maria]
  );
  await db.run(
    `INSERT INTO entrada_bloco_d (id, fpl_id, data, forma, entidade_designacao, rtri_id, rtri_status,
                                  natureza_juridica, pessoas_governo, pessoas_interlocutor, objeto, sintese_posicao,
                                  decisao_incorporacao, justificacao_decisao)
     VALUES (?, ?, '2026-02-12', 'REUNIAO', 'APREN — Associação Portuguesa de Energias Renováveis',
             'RTRI/2025/00142', 'VALIDADO', 'RTRI_INSCRITO', ?, ?, ?, ?, ?, ?)`,
    [uuid(), f1,
     jsonStringify(['Secretária de Estado do Ambiente', 'Adjunta SE']),
     jsonStringify(['Presidente APREN']),
     'Apresentação de proposta de regime para comunidades de energia renovável e simplificação do licenciamento.',
     'A APREN propôs um regime único para CER que abranja autoconsumo coletivo, partilha de energia entre membros e venda de excedentes em mercado, e a simplificação do licenciamento até 1 MW de potência instalada.',
     'PARCIAL',
     'Acolhe-se o regime único para CER (autoconsumo coletivo + partilha de energia) por ser convergente com a Diretiva (UE) 2018/2001. Não se acolhe a simplificação de licenciamento até 1 MW por exceder o limiar de proporcionalidade ambiental — mantém-se 250 kW conforme parecer DGEG.']
  );

  // -----------------------------------------------------------------------
  // FPL 2 — Em CP (M0+M1+M2). CP aberta no Consulta.Lex; aguarda contributos.
  // -----------------------------------------------------------------------
  const f2 = uuid();
  await db.run(
    `INSERT INTO fpl (id, numero_processo, tipo_diploma, titulo, titulo_curto, gabinete_id,
                      estado_workflow, tipo_origem, referencia_origem, sintese_problema, avaliacao_previa,
                      consulta_lex_ref, consulta_lex_inicio,
                      m0_validado_em, m0_validado_por,
                      m1_validado_em, m1_validado_por, m1_declaracao,
                      m2_validado_em,
                      criado_por, versao_atual)
     VALUES (?, '2026/MS/0008', 'DL', ?, ?, 'ms', 'EM_CONSULTA_PUBLICA', 'INICIATIVA_PROPRIA', NULL,
             ?, 1, 'CL/2026/0118', ?, ?, ?, ?, ?, ?, ?, ?, 4)`,
    [f2,
     'Decreto-Lei que aprova o regime de partilha de dados de saúde para fins de investigação científica',
     'Partilha de dados de saúde para investigação',
     'Os investigadores em saúde enfrentam barreiras administrativas que comprometem a investigação clínica em Portugal. O presente diploma estabelece um regime equilibrado de partilha de dados pseudonimizados para fins de investigação científica, garantindo a proteção da privacidade dos titulares dos dados nos termos do RGPD e da Lei n.º 58/2019.',
     dia(60), ana,
     dia(20), ana,
     'Confirmo que a presente FPL reflete todas as interações ocorridas no perímetro do diploma e que os campos obrigatórios estão integralmente preenchidos.',
     dia(15),
     ana]
  );
  await db.run(
    `INSERT INTO versao_fpl (id, fpl_id, numero, autor_id, snapshot, marco_validado, descricao) VALUES
     (?, ?, 1, ?, '{}', NULL, 'FPL criada'),
     (?, ?, 2, ?, '{}', 'M0',  'M0 validado · comprovativo emitido'),
     (?, ?, 3, ?, '{}', 'M1',  'M1 validado · pré-RSE · comprovativo emitido'),
     (?, ?, 4, ?, '{}', 'M2',  'M2 registado · abertura de consulta pública (CL/2026/0118)')`,
    [uuid(), f2, ana,
     uuid(), f2, ana,
     uuid(), f2, ana,
     uuid(), f2, ana]
  );

  // -----------------------------------------------------------------------
  // FPL 3 — Em CM (M0+M1+M2+M3+M4). CP encerrada com síntese e decisão;
  // pré-CM (M4) validado pelo PF; aguarda agendamento em Conselho de
  // Ministros (GSEPCM).
  // -----------------------------------------------------------------------
  const f3 = uuid();
  await db.run(
    `INSERT INTO fpl (id, numero_processo, tipo_diploma, titulo, titulo_curto, gabinete_id,
                      estado_workflow, tipo_origem, referencia_origem, sintese_problema, avaliacao_previa,
                      consulta_lex_ref, consulta_lex_inicio, consulta_lex_fim, consulta_lex_n_contributos,
                      consulta_lex_sintese, consulta_lex_decisao,
                      m0_validado_em, m0_validado_por,
                      m1_validado_em, m1_validado_por, m1_declaracao,
                      m2_validado_em, m3_validado_em,
                      m4_validado_em, m4_validado_por, m4_declaracao,
                      criado_por, versao_atual)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [f3,                                                                           // id
     '2026/MTSSS/0003',                                                            // numero_processo
     'DL',                                                                          // tipo_diploma
     'Decreto-Lei que aprova o regime extraordinário de apoio à inserção profissional de jovens NEET', // titulo
     'Apoio à inserção de jovens NEET',                                             // titulo_curto
     'mtsss',                                                                       // gabinete_id
     'EM_CM',                                                                       // estado_workflow
     'PROGRAMA_GOVERNO',                                                            // tipo_origem
     'Eixo II, medida 2.7',                                                         // referencia_origem
     'A persistência de uma taxa significativa de jovens NEET (não em emprego, educação ou formação) requer uma resposta integrada de apoio à inserção profissional. O presente diploma estabelece um regime extraordinário de incentivos à contratação, com majoração nas regiões com taxas de desemprego jovem acima da média nacional, e articulação com o IEFP para acompanhamento personalizado durante os primeiros 12 meses.', // sintese_problema
     1,                                                                             // avaliacao_previa
     'CL/2026/0067',                                                                // consulta_lex_ref
     dia(120),                                                                      // consulta_lex_inicio
     dia(90),                                                                       // consulta_lex_fim
     23,                                                                            // consulta_lex_n_contributos
     'Os 23 contributos recebidos repartem-se entre três blocos: (a) parceiros sociais (CIP, CGTP, UGT, CCP) com posições convergentes na necessidade de majoração regional mas divergentes sobre o cálculo das majorações; (b) entidades académicas e de investigação (CES da Universidade de Coimbra, ISEG) pedindo maior densidade na avaliação de impacto regional; (c) entidades do terceiro setor (ANIMAR, EAPN) sublinhando a importância do acompanhamento pós-colocação.', // consulta_lex_sintese
     'Acolhe-se a sugestão de cálculo de majorações por NUTS III com pesos baseados na taxa de desemprego jovem dos últimos 12 meses (CGTP/UGT) e o reforço do acompanhamento personalizado pelos 12 meses subsequentes à colocação (ANIMAR/EAPN). Não se acolhe a proposta de extensão automática a estágios profissionais por sobreposição com o programa Estágios ATIVAR.PT.', // consulta_lex_decisao
     dia(150), pedro,                                                               // m0_validado_em, m0_validado_por
     dia(140), pedro,                                                               // m1_validado_em, m1_validado_por
     'Confirmo que a presente FPL reflete todas as interações ocorridas no perímetro do diploma e que os campos obrigatórios estão integralmente preenchidos.', // m1_declaracao
     dia(120), dia(80),                                                             // m2_validado_em, m3_validado_em
     dia(10), pedro,                                                                // m4_validado_em, m4_validado_por
     'Confirmo que a presente FPL reflete todas as interações ocorridas no perímetro do diploma e que os campos obrigatórios estão integralmente preenchidos.', // m4_declaracao
     pedro,                                                                         // criado_por
     6]                                                                             // versao_atual
  );
  await db.run(
    `INSERT INTO versao_fpl (id, fpl_id, numero, autor_id, snapshot, marco_validado, descricao) VALUES
     (?, ?, 1, ?, '{}', NULL, 'FPL criada'),
     (?, ?, 2, ?, '{}', 'M0',  'M0 validado · comprovativo emitido'),
     (?, ?, 3, ?, '{}', 'M1',  'M1 validado · pré-RSE · comprovativo emitido'),
     (?, ?, 4, ?, '{}', 'M2',  'M2 registado · abertura de CP'),
     (?, ?, 5, ?, '{}', 'M3',  'M3 registado · encerramento de CP'),
     (?, ?, 6, ?, '{}', 'M4',  'M4 validado · pré-CM · comprovativo emitido')`,
    [uuid(), f3, pedro,
     uuid(), f3, pedro,
     uuid(), f3, pedro,
     uuid(), f3, pedro,
     uuid(), f3, pedro,
     uuid(), f3, pedro]
  );

  // -----------------------------------------------------------------------
  // FPL 4 — Apenas criada (CRIADO), para demonstrar o fluxo desde o início.
  // -----------------------------------------------------------------------
  const f4 = uuid();
  await db.run(
    `INSERT INTO fpl (id, numero_processo, tipo_diploma, titulo, gabinete_id, estado_workflow, criado_por)
     VALUES (?, '2026/MS/0011', 'DL', ?, 'ms', 'CRIADO', ?)`,
    [f4, 'Decreto-Lei que aprova o regime de receita eletrónica para medicamentos sujeitos a receita médica restrita', ana]
  );
  await db.run(
    `INSERT INTO versao_fpl (id, fpl_id, numero, autor_id, snapshot, descricao) VALUES (?, ?, 1, ?, '{}', 'FPL criada')`,
    [uuid(), f4, ana]
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
