// Seed inicial: gabinetes, utilizadores demo, entidades RTRI, FPL exemplo
import { db, init } from './db.js';
import { uuid, jsonStringify } from './util.js';
import { hashPassword } from './auth.js';

init();

async function seed() {
  console.log('→ A apagar dados existentes...');
  db.exec(`
    DELETE FROM auditoria_qa;
    DELETE FROM anexo;
    DELETE FROM evento_auditoria;
    DELETE FROM versao_fpl;
    DELETE FROM entrada_bloco_d;
    DELETE FROM entrada_bloco_c;
    DELETE FROM fpl;
    DELETE FROM atribuicao_papel;
    DELETE FROM utilizador;
    DELETE FROM gabinete;
    DELETE FROM entidade_rtri;
  `);

  console.log('→ A inserir gabinetes...');
  const gabinetes = [
    ['mae', 'MAE', 'Ministério do Ambiente e da Energia'],
    ['ms', 'MS', 'Ministério da Saúde'],
    ['mtsss', 'MTSSS', 'Ministério do Trabalho, Solidariedade e Segurança Social'],
    ['me', 'ME', 'Ministério da Economia'],
    ['mj', 'MJ', 'Ministério da Justiça'],
    ['mecic', 'MECIC', 'Ministério da Educação, Ciência e Inovação'],
    ['mf', 'MF', 'Ministério das Finanças'],
    ['mai', 'MAI', 'Ministério da Administração Interna'],
    ['mih', 'MIH', 'Ministério da Habitação'],
    ['mc', 'MC', 'Ministério da Cultura'],
    ['sggov', 'SGGOV', 'Secretaria-Geral do Governo'],
  ];
  const insGab = db.prepare('INSERT INTO gabinete (id, sigla, nome) VALUES (?, ?, ?)');
  for (const g of gabinetes) insGab.run(...g);

  console.log('→ A inserir utilizadores...');
  const users = [
    { email: 'maria.silva@gov.pt', nome: 'Maria Silva', pwd: 'demo1234', papel: 'PONTO_FOCAL', gab: 'mae', nif: '100000001' },
    { email: 'joao.pereira@gov.pt', nome: 'João Pereira', pwd: 'demo1234', papel: 'PONTO_FOCAL_ALT', gab: 'mae', nif: '100000002' },
    { email: 'ana.santos@gov.pt', nome: 'Ana Santos', pwd: 'demo1234', papel: 'PONTO_FOCAL', gab: 'ms', nif: '100000003' },
    { email: 'pedro.lopes@gov.pt', nome: 'Pedro Lopes', pwd: 'demo1234', papel: 'PONTO_FOCAL', gab: 'mtsss', nif: '100000004' },
    { email: 'rui.ferreira@sggov.pt', nome: 'Rui Ferreira', pwd: 'demo1234', papel: 'SGGOV_QA', gab: null, nif: '100000005' },
    { email: 'carla.almeida@sggov.pt', nome: 'Carla Almeida', pwd: 'demo1234', papel: 'SGGOV_ADMIN', gab: null, nif: '100000006' },
    { email: 'gsepcm@gov.pt', nome: 'GSEPCM (rececionista)', pwd: 'demo1234', papel: 'GSEPCM', gab: null, nif: '100000007' },
  ];
  for (const u of users) {
    const id = uuid();
    const hash = await hashPassword(u.pwd);
    db.prepare('INSERT INTO utilizador (id, email, nome_completo, password_hash, nif) VALUES (?, ?, ?, ?, ?)')
      .run(id, u.email, u.nome, hash, u.nif);
    db.prepare('INSERT INTO atribuicao_papel (utilizador_id, papel, gabinete_id) VALUES (?, ?, ?)')
      .run(id, u.papel, u.gab);
  }

  console.log('→ A inserir entidades RTRI...');
  const rtri = [
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
  const insRtri = db.prepare('INSERT INTO entidade_rtri (rtri_id, designacao, natureza_juridica, data_inscricao) VALUES (?, ?, ?, ?)');
  for (const r of rtri) insRtri.run(...r);

  console.log('→ A inserir FPL exemplo...');
  // FPL 1: completa em RSE (MAE)
  const maria = db.prepare("SELECT id FROM utilizador WHERE email = 'maria.silva@gov.pt'").get().id;
  const f1 = uuid();
  db.prepare(`
    INSERT INTO fpl (id, numero_processo, tipo_diploma, titulo, titulo_curto, gabinete_id,
                     estado_workflow, tipo_origem, referencia_origem, sintese_problema, avaliacao_previa,
                     m0_validado_em, m0_validado_por,
                     consulta_lex_ref, consulta_lex_inicio, consulta_lex_fim, consulta_lex_n_contributos,
                     consulta_lex_sintese, consulta_lex_decisao, m2_validado_em,
                     m3_validado_em, m3_validado_por, m3_declaracao,
                     criado_por, versao_atual)
    VALUES (?, ?, 'DL', ?, ?, 'mae', 'EM_RSE', 'PROGRAMA_GOVERNO', 'Eixo III, medida 4.2',
            ?, 1, '2026-01-10T11:32:00Z', ?,
            'CL-2026-031', '2026-03-15', '2026-04-14', 67,
            ?, ?, '2026-04-22T11:42:00Z',
            '2026-04-30T16:05:00Z', ?, 'Confirmo que a presente FPL reflete todas as interações ocorridas no perímetro do diploma e que os campos obrigatórios estão integralmente preenchidos.',
            ?, 13)
  `).run(
    f1, '2026/MAE/0042',
    'Decreto-Lei que aprova o regime jurídico da produção descentralizada de energia a partir de fontes renováveis em comunidades de energia',
    'Comunidades de energia renovável',
    'O presente diploma estabelece o quadro jurídico para a constituição e funcionamento de comunidades de energia renovável (CER), em conformidade com a Diretiva (UE) 2018/2001 (RED II), criando condições para a participação ativa de cidadãos, autarquias e PME na transição energética. Visa eliminar barreiras administrativas e tarifárias e estabelecer um modelo de partilha de energia produzida em autoconsumo coletivo.',
    maria,
    'Os 67 contributos manifestam apoio amplo ao regime, com observações maioritariamente focadas em três pontos: (a) regulação tarifária da energia partilhada em autoconsumo coletivo, considerada incompleta no n.º 4 do art. 14.º; (b) papel das autarquias na constituição de CER municipais com pedido de simplificação no acesso a financiamento PRR; (c) tratamento fiscal dos excedentes vendidos à rede pelas pessoas singulares, considerado punitivo por associações de consumidores. Recebeu-se ainda contributos sobre o regime de partilha de excedentes entre autoconsumidores não-membros de CER.',
    'Acolheu-se parcialmente a observação (a) com a reformulação do n.º 4 do art. 14.º para clarificar o método de imputação de perdas. Não se acolheu (b) por exceder o âmbito do diploma. Quanto a (c), reencaminhou-se a questão para o Ministério das Finanças em sede de OE.',
    maria, maria
  );

  // Bloco D entradas
  const dEntradas = [
    ['2026-02-12', 'REUNIAO', 'APREN — Associação Portuguesa de Energias Renováveis', 'RTRI/2025/00142', 'VALIDADO', 'RTRI_INSCRITO',
     ['Secretária de Estado do Ambiente', 'Adjunta SE', 'Técnica gabinete'], ['Presidente APREN', 'Director-geral'],
     'Apresentação de proposta de regime para comunidades de energia renovável; contributo escrito anexo.',
     'A APREN propõe um regime único para CER que abranja autoconsumo coletivo, partilha de energia entre membros e venda de excedentes em mercado, sem distinção entre origem solar ou eólica. Defende ainda a simplificação do licenciamento até 1 MW de potência instalada, alinhando com o regime espanhol e francês.',
     'PARCIALMENTE_INCORPORADA',
     'A proposta de regime único foi acolhida na arquitetura do diploma. Não se acolheu a simplificação até 1 MW por divergir das obrigações de comunicação à ERSE.'],
    ['2026-02-19', 'VIDEOCONFERENCIA', 'EDP — Energias de Portugal, S.A.', 'RTRI/2025/00088', 'VALIDADO', 'RTRI_INSCRITO',
     ['Secretária de Estado do Ambiente', 'Chefe de gabinete'], ['Director Regulação', 'Director Mercado'],
     'Análise dos efeitos do diploma na operação da rede de distribuição.',
     'A EDP manifestou preocupação com o aumento da complexidade da gestão de fluxos bidirecionais em zonas de elevada penetração solar, propondo um período transitório de 24 meses para adaptação dos sistemas de medição e a manutenção do modelo atual de tarifa de uso de redes para CER acima de 250 kW.',
     'NAO_INCORPORADA',
     'O período transitório é incompatível com o calendário das metas PNEC 2030. A questão tarifária é da competência regulatória da ERSE e não cabe no presente diploma.'],
    ['2026-02-26', 'REUNIAO', 'ZERO — Associação Sistema Terrestre Sustentável', 'RTRI/2025/00214', 'VALIDADO', 'RTRI_INSCRITO',
     ['Secretária de Estado do Ambiente', 'Adjunta SE'], ['Coordenador de Energia', 'Investigadora'],
     'Contributos sobre a participação de cidadãos com baixos rendimentos em CER.',
     'A ZERO propôs a criação de um mecanismo de comparticipação para participação de cidadãos em situação de pobreza energética (definição art. 3.º DL 70/2020), com financiamento via Fundo Ambiental, e a obrigatoriedade de pelo menos 10% dos membros de CER municipais serem agregados elegíveis. Defendeu também a inclusão de avaliação de impacto distributivo no RIA.',
     'INCORPORADA',
     'A criação do mecanismo de comparticipação foi acolhida no art. 17.º. A obrigatoriedade de 10% foi acolhida no art. 12.º/3 com modulação por dimensão da CER. A avaliação de impacto distributivo foi incluída no RIA.'],
    ['2026-03-05', 'AUDIENCIA', 'Confederação Geral dos Trabalhadores Portugueses (CGTP)', 'RTRI/2025/00027', 'VALIDADO', 'RTRI_INSCRITO',
     ['Secretária de Estado do Ambiente'], ['Coordenador'],
     'Posição da CGTP sobre transição energética justa.',
     'A CGTP manifestou apoio ao princípio das comunidades de energia mas questionou a inexistência de cláusulas de proteção de emprego na cadeia de valor afetada. Solicitou inclusão de mecanismo de diálogo social específico no Conselho Consultivo das Comunidades de Energia.',
     'PARCIALMENTE_INCORPORADA',
     'A inclusão de representação sindical no Conselho Consultivo foi acolhida no art. 22.º. Não se acolheu cláusulas adicionais por divergir do escopo do diploma.'],
    ['2026-03-21', 'CORRESPONDENCIA', 'Prof. Doutor António Sá da Costa (Universidade de Évora)', null, 'NAO_APLICAVEL', 'ACADEMIA_PERITO',
     ['Adjunta SE'], [],
     'Parecer técnico sobre modelo de cálculo de coeficientes de partilha em autoconsumo coletivo.',
     'O parecer propõe um modelo de cálculo dinâmico baseado em consumo histórico ponderado, em alternativa ao modelo estático proposto inicialmente. Apresenta análise comparativa com modelos italiano e alemão.',
     'INCORPORADA',
     'Modelo dinâmico acolhido no anexo I, com simplificação de cálculo para CER até 50 membros conforme proposto.'],
  ];
  const insD = db.prepare(`
    INSERT INTO entrada_bloco_d
      (id, fpl_id, data, forma, entidade_designacao, rtri_id, rtri_status, natureza_juridica,
       pessoas_governo, pessoas_interlocutor, objeto, sintese_posicao, decisao_incorporacao, justificacao_decisao)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const d of dEntradas) {
    insD.run(uuid(), f1, d[0], d[1], d[2], d[3], d[4], d[5],
      jsonStringify(d[6]), jsonStringify(d[7]), d[8], d[9], d[10], d[11]);
  }

  // Bloco C entradas
  const cEntradas = [
    ['2026-02-08', 'Direção-Geral de Energia e Geologia (DGEG)', null, 'PARECER_ESCRITO',
     'Análise técnica do regime',
     'A DGEG considera o regime tecnicamente sólido e propôs ajustes a três artigos relativos a procedimentos de comunicação prévia e regimes de exceção para sistemas de pequena escala.'],
    ['2026-02-16', 'Entidade Reguladora dos Serviços Energéticos (ERSE)', null, 'PARECER_ESCRITO',
     'Análise das implicações regulatórias',
     'A ERSE confirma a sua competência regulatória nas matérias tarifárias e propõe coordenação na elaboração das portarias de execução previstas nos arts. 14.º e 18.º.'],
    ['2026-02-22', 'Ministério das Finanças (Gabinete SEAF)', null, 'REUNIAO',
     'Tratamento fiscal de excedentes',
     'Definição de tratamento fiscal aplicável a excedentes de produção: enquadramento em sede de IRS (categoria E) e isenção até 600€/ano por agregado, com reporte ao OE/2027.'],
  ];
  const insC = db.prepare(`
    INSERT INTO entrada_bloco_c (id, fpl_id, data, entidade, cargo, forma, objeto, sintese_posicao)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const c of cEntradas) insC.run(uuid(), f1, ...c);

  // Versões para f1 (sintéticas)
  const versoes = [
    ['2026-01-10T09:14:00Z', null, 'FPL criada, Bloco A preenchido'],
    ['2026-01-10T11:32:00Z', 'M0', 'M0 validado — Bloco B preenchido'],
    ['2026-04-22T11:42:00Z', 'M2', 'M2 registado'],
    ['2026-04-30T16:05:00Z', 'M3', 'M3 validado — declaração de completude assinada; estado → EM_RSE'],
  ];
  for (let i = 0; i < versoes.length; i++) {
    db.prepare(`
      INSERT INTO versao_fpl (id, fpl_id, numero, autor_id, timestamp, snapshot, marco_validado, descricao)
      VALUES (?, ?, ?, ?, ?, '{}', ?, ?)
    `).run(uuid(), f1, i + 1, maria, versoes[i][0], versoes[i][1], versoes[i][2]);
  }

  // FPL 2: em elaboração (MAE)
  const f2 = uuid();
  db.prepare(`
    INSERT INTO fpl (id, numero_processo, tipo_diploma, titulo, gabinete_id, estado_workflow,
                     tipo_origem, referencia_origem, sintese_problema, avaliacao_previa,
                     m0_validado_em, m0_validado_por, criado_por)
    VALUES (?, '2026/MAE/0049', 'DL', ?, 'mae', 'EM_ELABORACAO',
            'TRANSPOSICAO_UE', 'Diretiva (UE) 2024/884', ?, 1,
            '2026-04-28T10:00:00Z', ?, ?)
  `).run(f2,
    'Decreto-Lei que estabelece o regime de gestão de resíduos de equipamentos elétricos e eletrónicos (transposição da Diretiva (UE) 2024/884)',
    'O presente diploma transpõe a Diretiva (UE) 2024/884, que estabelece novos limites de recuperação e reciclagem de resíduos de equipamentos elétricos e eletrónicos (REEE), incluindo categorias adicionais introduzidas pela revisão de 2024 e novos requisitos de informação ao consumidor sobre origem e composição material.',
    maria, maria);

  // FPL 3: publicada
  const f3 = uuid();
  const mj = db.prepare("SELECT id FROM gabinete WHERE id = 'mj'").get().id;
  db.prepare(`
    INSERT INTO fpl (id, numero_processo, tipo_diploma, titulo, gabinete_id, estado_workflow,
                     tipo_origem, sintese_problema,
                     m0_validado_em, m0_validado_por, m3_validado_em, m3_validado_por,
                     m4_validado_em, m4_validado_por, m5_validado_em,
                     referencia_dr, data_publicacao, criado_por)
    VALUES (?, '2025/MJ/0058', 'DL', ?, 'mj', 'PUBLICADO',
            'PROGRAMA_GOVERNO', ?,
            '2025-09-01T10:00:00Z', ?, '2026-02-10T15:00:00Z', ?,
            '2026-03-05T14:00:00Z', ?, '2026-04-22T08:00:00Z',
            'DR n.º 78/2026, Série I, de 22-04-2026', '2026-04-22T08:00:00Z', ?)
  `).run(f3,
    'Decreto-Lei que aprova o regime jurídico da mediação civil e comercial',
    'O regime visa consolidar e modernizar o quadro normativo da mediação extrajudicial em matérias civis e comerciais, alinhando o regime nacional com as melhores práticas europeias e reforçando o estatuto do mediador certificado.',
    maria, maria, maria, maria);

  // Auditoria QA exemplo na f1
  const rui = db.prepare("SELECT id FROM utilizador WHERE email = 'rui.ferreira@sggov.pt'").get().id;
  db.prepare(`
    INSERT INTO auditoria_qa (id, fpl_id, auditor_id, data_auditoria, pontuacao, observacoes, pedido_correcao, estado_correcao)
    VALUES (?, ?, ?, '2026-05-02T10:00:00Z', 94,
      'FPL com cobertura adequada das interações relevantes. Decisões de incorporação bem fundamentadas. Sugestão menor: explicitar no objeto da entrada D-2 (EDP) se a reunião abrangeu também aspetos tarifários.',
      0, 'CONCLUIDA')
  `).run(uuid(), f1, rui);

  console.log('✓ Seed concluído.');
  console.log('');
  console.log('  Utilizadores criados (password: demo1234):');
  for (const u of users) console.log(`    • ${u.email.padEnd(30)} → ${u.papel}${u.gab ? ' @ ' + u.gab : ''}`);
}

seed().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
