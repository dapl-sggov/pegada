/* ===================================================================
   FPL — Demonstração Interativa Autónoma
   SPA com "backend simulado" em JavaScript. Corre 100% no navegador,
   persiste em localStorage. Dados fictícios. Sem servidor.
   =================================================================== */
'use strict';

/* ============ CONSTANTES / LABELS ============ */
const ESTADOS = {
  CRIADO:{l:'Criado',c:'criado'},
  EM_ELABORACAO:{l:'Em elaboração',c:'elaboracao'},
  EM_CONSULTA_INTERNA:{l:'Consulta interna',c:'consulta'},
  EM_CONSULTA_PUBLICA:{l:'Consulta pública',c:'consulta'},
  EM_RSE:{l:'Em RSE',c:'rse'},
  POS_RSE:{l:'Pós-RSE (CP dispensada)',c:'rse'},
  EM_CM:{l:'Em CM',c:'cm'},
  APROVADO:{l:'Aprovado',c:'aprovado'},
  PUBLICADO:{l:'Publicado',c:'publicado'},
  EM_REVISAO_QA:{l:'Em revisão QA',c:'revisao'},
  ARQUIVADO:{l:'Arquivado',c:'arquivado'},
};
const TIPOS = {DL:'Decreto-Lei',PL:'Proposta de Lei',RCM:'Resolução do Conselho de Ministros',DR:'Decreto Regulamentar',DESPACHO:'Despacho normativo'};
const ORIGENS = {PROGRAMA_GOVERNO:'Programa do Governo',TRANSPOSICAO_UE:'Transposição UE',DECISAO_JUDICIAL:'Decisão judicial',COMPROMISSO_INTERNACIONAL:'Compromisso internacional',INICIATIVA_MINISTERIO:'Iniciativa do ministério',OUTRA:'Outra'};
const NATUREZAS = {RTRI_INSCRITO:'Representante de interesses inscrito no RTRI',RTRI_FORCA_LEI:'Inscrito por força da Lei',ACADEMIA_PERITO:'Academia ou perito individual',AUTORIDADE_PUBLICA:'Autoridade pública',OUTRA:'Outra'};
const FORMAS = {REUNIAO:'Reunião presencial',AUDIENCIA:'Audiência',VIDEOCONFERENCIA:'Videoconferência',CORRESPONDENCIA:'Correspondência escrita',CONTRIBUTO_ESPONTANEO:'Contributo espontâneo',OUTRA:'Outra'};
const FORMAS_C = {PARECER_ESCRITO:'Parecer escrito',REUNIAO:'Reunião',AUDIENCIA:'Audiência'};
const DECISOES = {INCORPORADA:'Incorporada',PARCIALMENTE_INCORPORADA:'Parcialmente incorporada',NAO_INCORPORADA:'Não incorporada',SEM_OBJETO:'Sem objeto'};
const MARCOS_BLOQ = ['M0','M1','M4','M5'];
const LIM = {SINTESE_B:200,SINTESE_E:300,DECISAO_E:200,OBJETO_D:50,SINTESE_D:100,JUSTIF_D:100,JUSTIF_CP:200};

// XXV Governo Constitucional — siglas oficiais dos ministérios.
// Fonte: SMARTBP · Tabela · Grupo Entidade: Governo (2026/02/11).
// Emails: utilizadores recebem endereços `nome@<sigla>.gov.pt` em minúsculas.
const GABINETES = [
  {id:'maen', sigla:'MAEN', nome:'Ministério do Ambiente e Energia'},
  {id:'ms',   sigla:'MS',   nome:'Ministério da Saúde'},
  {id:'mtsss',sigla:'MTSSS',nome:'Ministério do Trabalho, Solidariedade e Segurança Social'},
  {id:'mect', sigla:'MECT', nome:'Ministério da Economia e da Coesão Territorial'},
  {id:'mj',   sigla:'MJ',   nome:'Ministério da Justiça'},
  {id:'meci', sigla:'MECI', nome:'Ministério da Educação, Ciência e Inovação'},
  {id:'mef',  sigla:'MEF',  nome:'Ministério de Estado e das Finanças'},
  {id:'mai',  sigla:'MAI',  nome:'Ministério da Administração Interna'},
  {id:'mih',  sigla:'MIH',  nome:'Ministério das Infraestruturas e Habitação'},
  {id:'mcjd', sigla:'MCJD', nome:'Ministério da Cultura, Juventude e Desporto'},
  {id:'mam',  sigla:'MAM',  nome:'Ministério da Agricultura e Mar'},
  {id:'mdn',  sigla:'MDN',  nome:'Ministério da Defesa Nacional'},
  {id:'mene', sigla:'MENE', nome:'Ministério dos Negócios Estrangeiros'},
  {id:'mp',   sigla:'MP',   nome:'Ministério da Presidência'},
  {id:'mare', sigla:'MARE', nome:'Ministério Adjunto e da Reforma do Estado'},
  {id:'map',  sigla:'MAP',  nome:'Ministério dos Assuntos Parlamentares'},
];
// Os emails seguem o padrão `nome.sobrenome@<sigla-ministério>.gov.pt` em
// minúsculas — convenção oficial do XXV Governo. SGGOV usa `@sggoverno.gov.pt`.
const PERFIS = [
  {id:'u-maria', nome:'Maria Silva',   email:'maria.silva@maen.gov.pt',    papel:'PONTO_FOCAL',     gabinete:'maen',  cor:'#1d3461'},
  {id:'u-joao',  nome:'João Pereira',  email:'joao.pereira@mect.gov.pt',   papel:'PONTO_FOCAL_ALT', gabinete:'mect',  cor:'#2f4f8a'},
  {id:'u-rui',   nome:'Rui Ferreira',  email:'rui.ferreira@sggoverno.gov.pt',   papel:'SGGOV_QA',    gabinete:null,    cor:'#a36507'},
  {id:'u-carla', nome:'Carla Almeida', email:'carla.almeida@sggoverno.gov.pt',  papel:'SGGOV_ADMIN', gabinete:null,    cor:'#a71728'},
  {id:'u-cidadao',nome:'Acesso Público',email:'—',                          papel:'PUBLICO',       gabinete:null,    cor:'#5e6573'},
];
const PAPEL_LBL = {PONTO_FOCAL:'Ponto Focal',PONTO_FOCAL_ALT:'Ponto Focal (alt.)',SGGOV_QA:'SGGOV · Auditoria',SGGOV_ADMIN:'SGGOV · Administração',PUBLICO:'Cidadão'};

const RTRI_ENTIDADES = [
  ['RTRI/2025/00018','Confederação da Indústria Portuguesa (CIP)','Confederação patronal'],
  ['RTRI/2025/00027','Confederação Geral dos Trabalhadores Portugueses (CGTP)','Confederação sindical'],
  ['RTRI/2025/00031','União Geral de Trabalhadores (UGT)','Confederação sindical'],
  ['RTRI/2025/00056','Ordem dos Engenheiros (OE)','Associação pública profissional'],
  ['RTRI/2025/00061','Ordem dos Médicos','Associação pública profissional'],
  ['RTRI/2025/00088','EDP — Energias de Portugal, S.A.','Empresa'],
  ['RTRI/2025/00091','Galp Energia, S.A.','Empresa'],
  ['RTRI/2025/00142','APREN — Associação Portuguesa de Energias Renováveis','Associação setorial'],
  ['RTRI/2025/00214','ZERO — Associação Sistema Terrestre Sustentável','Associação ambientalista'],
  ['RTRI/2025/00309','Quercus — Associação Nacional de Conservação da Natureza','Associação ambientalista'],
  ['RTRI/2025/00415','APED — Associação Portuguesa de Empresas de Distribuição','Associação setorial'],
  ['RTRI/2025/00467','APIFARMA — Associação Portuguesa da Indústria Farmacêutica','Associação setorial'],
  ['RTRI/2025/00482','Associação Portuguesa de Bancos (APB)','Associação setorial'],
  ['RTRI/2025/00513','CCP — Confederação do Comércio e Serviços de Portugal','Confederação patronal'],
  ['RTRI/2025/00604','DECO — Associação Portuguesa para a Defesa do Consumidor','Associação de consumidores'],
].map(([rtri_id,designacao,natureza])=>({rtri_id,designacao,natureza,ativo:true}));

/* ============ UTIL ============ */
const uuid = () => 'x'+Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4);
const nowISO = () => new Date().toISOString();
const esc = s => String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmtD = d => {if(!d)return'—';const s=String(d).slice(0,10);const[y,m,dd]=s.split('-');return `${dd}/${m}/${y}`;};
const fmtDH = d => {if(!d)return'—';const dt=new Date(d);return dt.toLocaleDateString('pt-PT')+' '+dt.toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit'});};
const inits = n => (n||'').split(' ').filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase();
const gab = id => GABINETES.find(g=>g.id===id) || {sigla:id,nome:id};
const badge = e => {const x=ESTADOS[e]||{l:e,c:'criado'};return `<span class="badge ${x.c}">${x.l}</span>`;};
const tag = t => `<span class="tag t-${t}">${t}</span>`;
const b64u = obj => btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');

/* ============ STORE (backend simulado + localStorage) ============ */
const LS_KEY = 'fpl-demo-v3';
let DB = null;

function seed() {
  const mk = (o) => Object.assign({bloco_c:[],bloco_d:[],versoes:[],comprovativos:[]},o);
  const fpls = [
    // ── fpl-001 · EM_RSE ────────────────────────────────────────────────
    mk({
      id:'fpl-001', numero:'2026/MAEN/0042', tipo:'DL', gabinete:'maen',
      titulo:'Decreto-Lei que aprova o regime jurídico da produção descentralizada de energia a partir de fontes renováveis em comunidades de energia',
      titulo_curto:'Comunidades de energia renovável',
      estado:'EM_RSE', origem:'PROGRAMA_GOVERNO', ref_origem:'Programa do Governo XXV, Eixo III — Transição Climática, medida 4.2',
      sintese:'O presente diploma estabelece o quadro jurídico para a constituição e funcionamento de comunidades de energia renovável (CER) e de comunidades de cidadãos para a energia (CCE), em transposição parcial das Diretivas (UE) 2018/2001 (RED II) e (UE) 2019/944 (IEM), eliminando as barreiras administrativas e tarifárias subsistentes e fixando um modelo de partilha de energia produzida em autoconsumo coletivo. Visa simultaneamente operacionalizar a meta de 5 GW de capacidade descentralizada inscrita no PNEC 2030 e prevenir efeitos regressivos sobre os agregados em pobreza energética.',
      avaliacao_previa:1, criado_por:'u-maria', criado_em:'2026-01-12T09:14:00Z',
      cl_ref:null, cl_inicio:null, cl_fim:null, cl_n:null, cl_sintese:null, cl_decisao:null,
      m0:'2026-01-12T11:32:00Z',m0_por:'u-maria',
      m1:'2026-05-04T16:05:00Z',m1_por:'u-maria',m1_decl:1,
      m2:null,m3:null,m4:null,m5:null,ref_dr:null,
      rse_prevista:'2026-05-26',cp_prevista_inicio:'2026-06-01',cp_prevista_fim:'2026-07-01',cm_prevista:'2026-07-23',dr_prevista:'2026-08-10',
      bloco_d:[
        {id:'d1',data:'2026-02-12',forma:'REUNIAO',entidade:'APREN — Associação Portuguesa de Energias Renováveis',rtri_id:'RTRI/2025/00142',natureza:'RTRI_INSCRITO',gov:'Secretária de Estado da Energia; Adjunta SEEN',interlocutor:'Presidente; Diretor-geral',objeto:'Apresentação da proposta APREN para um regime único de CER independente da fonte primária renovável e simplificação do licenciamento até 1 MW.',sintese:'A APREN defendeu a consolidação num regime único aplicável a CER fotovoltaicas, eólicas onshore e híbridas, com isenção de licenciamento prévio para instalações até 1 MW de potência instalada e mera comunicação à DGEG. Apresentou estudo de impacto comparando os custos administrativos atuais com modelos análogos da Alemanha (BEG) e Itália (CER), estimando uma poupança média de 14 meses no time-to-market.',decisao:'PARCIALMENTE_INCORPORADA',justificacao:'O regime único foi acolhido na arquitetura do diploma (art. 3.º), eliminando-se a fragmentação anterior por tecnologia. A simplificação até 1 MW não foi acolhida na sua plenitude por colidir com as obrigações de medição e comunicação à ERSE previstas no art. 7.º do RRC, tendo-se optado por um regime de comunicação prévia simplificada até 700 kW (art. 14.º).'},
        {id:'d2',data:'2026-02-19',forma:'VIDEOCONFERENCIA',entidade:'EDP — Energias de Portugal, S.A.',rtri_id:'RTRI/2025/00088',natureza:'RTRI_INSCRITO',gov:'Secretária de Estado da Energia; Chefe de gabinete',interlocutor:'Diretor de Regulação; Diretor de Mercado de Retalho',objeto:'Efeitos do diploma na operação da rede de distribuição e adequação dos sistemas de medição inteligente em zonas de elevada penetração solar.',sintese:'A EDP manifestou preocupação com o aumento da complexidade da gestão de fluxos bidirecionais em zonas onde a penetração solar excede já 35% da carga local, designadamente no Algarve e Baixo Alentejo. Propôs um período transitório de 24 meses para reforço dos sistemas SCADA e migração dos contadores de segunda geração, bem como a criação de uma cláusula de salvaguarda tarifária a invocar perante a ERSE em caso de congestionamento.',decisao:'NAO_INCORPORADA',justificacao:'O período transitório proposto é incompatível com o calendário das metas inscritas no PNEC 2030 e com o objetivo orçamental do PRR (componente C13). Quanto à cláusula tarifária, a competência regulamentar é da ERSE nos termos do Decreto-Lei n.º 97/2002, não cabendo no presente diploma a sua disciplina, sem prejuízo da articulação prevista no art. 24.º.'},
        {id:'d3',data:'2026-02-26',forma:'REUNIAO',entidade:'ZERO — Associação Sistema Terrestre Sustentável',rtri_id:'RTRI/2025/00214',natureza:'RTRI_INSCRITO',gov:'Secretária de Estado da Energia; Adjunta SEEN',interlocutor:'Coordenador de Energia; Investigadora associada',objeto:'Mecanismos de inclusão de agregados em pobreza energética nas comunidades de energia e proteção contra efeitos distributivos regressivos.',sintese:'A ZERO defendeu a criação de um mecanismo de comparticipação para participação de agregados em situação de pobreza energética nos CER municipais, com financiamento via Fundo Ambiental e dotação anual de 12M€, e a obrigatoriedade de pelo menos 10% dos membros de CER municipais serem agregados elegíveis para a tarifa social. Apresentou simulação de impacto com base nos dados do INE/EU-SILC 2024.',decisao:'INCORPORADA',justificacao:'O mecanismo de comparticipação foi acolhido no art. 17.º com remissão para portaria conjunta MAEN/MTSSS. A quota mínima de 10% ficou consagrada no art. 12.º/3, com modulação por dimensão da CER. A avaliação de impacto distributivo foi integrada como anexo IV do RIA, conforme proposto pela ZERO.'},
        {id:'d4',data:'2026-03-05',forma:'AUDIENCIA',entidade:'Confederação Geral dos Trabalhadores Portugueses (CGTP-IN)',rtri_id:'RTRI/2025/00027',natureza:'RTRI_INSCRITO',gov:'Secretária de Estado da Energia',interlocutor:'Coordenador; Responsável Departamento Ambiente',objeto:'Posição sindical sobre transição energética justa, proteção do emprego na cadeia de valor das renováveis e participação dos trabalhadores na governação das CER.',sintese:'A CGTP-IN manifestou apoio de princípio às comunidades de energia, mas alertou para a ausência de salvaguardas relativas ao emprego em setores adjacentes (distribuição e comercialização tradicionais) e à conversão das competências profissionais. Solicitou a inclusão de representação sindical no Conselho Consultivo das Comunidades de Energia e a obrigatoriedade de avaliação anual de impacto laboral.',decisao:'PARCIALMENTE_INCORPORADA',justificacao:'A representação sindical no Conselho Consultivo foi acolhida no art. 22.º/2, alínea f). A avaliação anual de impacto laboral foi remetida para o plano de monitorização da DGEG (art. 26.º), por exceder, na sua concretização, o âmbito normativo do diploma.'},
        {id:'d5',data:'2026-03-21',forma:'CORRESPONDENCIA',entidade:'Prof. António Sá da Costa (Universidade de Évora — Cátedra ENERGEIA)',rtri_id:'',natureza:'ACADEMIA_PERITO',gov:'Adjunta SEEN',interlocutor:'',objeto:'Parecer técnico solicitado sobre o modelo de cálculo dos coeficientes de partilha em autoconsumo coletivo e o tratamento de excedentes injetados na rede.',sintese:'O parecer rejeita o modelo estático baseado em quotas fixas constantes da versão preliminar do anexo I, por não refletir adequadamente os padrões de consumo reais nem responder a fenómenos de duck curve. Propõe, em alternativa, um modelo dinâmico de coeficientes baseado em consumo histórico ponderado (rolling 30 dias) com fator de correção sazonal, apresentando análise comparativa quantitativa com os modelos italiano (TIAD) e alemão (Mieterstrom).',decisao:'INCORPORADA',justificacao:'O modelo dinâmico de coeficientes ponderados foi acolhido no anexo I, secção 3, com a simplificação adicional sugerida pelo parecer (médias trimestrais) para CER até 50 membros, reduzindo a sobrecarga computacional para pequenas comunidades.'},
        {id:'d6',data:'2026-04-02',forma:'REUNIAO',entidade:'Coopérnico — Cooperativa de Energia Renovável CRL',rtri_id:'RTRI/2025/00341',natureza:'RTRI_INSCRITO',gov:'Secretária de Estado da Energia; Adjunta SEEN',interlocutor:'Presidente da Direção; Vogal técnico',objeto:'Equiparação das cooperativas de energia ao regime das CER e critérios de governação democrática.',sintese:'A Coopérnico defendeu a equiparação plena das cooperativas de energia já constituídas ao abrigo do Código Cooperativo ao regime das CER, sem exigência de reconstituição jurídica, e a consagração legal dos princípios "um membro, um voto" e do limite máximo de 33% de participação por membro singular ou coletivo. Apresentou estudo comparativo com Espanha (Som Energia) e Alemanha (BBEn) demonstrando a robustez do modelo cooperativo.',decisao:'PARCIALMENTE_INCORPORADA',justificacao:'A equiparação automática foi consagrada no art. 5.º/4, dispensando reconstituição jurídica. O princípio "um membro, um voto" foi acolhido no art. 11.º para todas as CER. O limite de 33% foi diferido para portaria do MAEN, por exigir calibração mais fina em função da escala (art. 11.º/5).'},
        {id:'d7',data:'2026-04-21',forma:'REUNIAO',entidade:'REN — Redes Energéticas Nacionais, SGPS, S.A.',rtri_id:'RTRI/2025/00021',natureza:'RTRI_INSCRITO',gov:'Secretária de Estado da Energia; Chefe de gabinete',interlocutor:'Diretor de Sistema; Diretor de Planeamento de Rede',objeto:'Análise da capacidade de receção da rede de transporte e critérios de prioridade no acesso para CER com componente social.',sintese:'A REN apresentou avaliação técnica da capacidade de receção em 17 subestações críticas, identificando bloqueios estruturais no eixo Sines-Évora e propondo critérios de prioridade no acesso à rede de transporte para CER com pelo menos 25% de agregados elegíveis para tarifa social. Sugeriu ainda um mecanismo escalonado de ligação correlacionando potência admitida e prazos de reforço da rede.',decisao:'PARCIALMENTE_INCORPORADA',justificacao:'Os critérios de prioridade para CER com componente social foram acolhidos no art. 19.º/2, alínea b). O mecanismo escalonado de ligação foi remetido para regulamentação subsequente da ERSE no quadro do Regulamento da Rede de Transporte, por exceder o âmbito do presente diploma.'},
      ],
      bloco_c:[
        {id:'c1',data:'2026-02-08',entidade:'Direção-Geral de Energia e Geologia (DGEG)',cargo:'',forma:'PARECER_ESCRITO',objeto:'Parecer técnico sobre o regime de licenciamento e regime de exceção para pequenas instalações',sintese:'A DGEG considera o regime tecnicamente sólido e propõe ajustes a três artigos relativos à comunicação prévia, ao regime de exceção para sistemas até 30 kW e à coordenação com o regime de produção em autoconsumo individual já vigente.'},
        {id:'c2',data:'2026-02-16',entidade:'Entidade Reguladora dos Serviços Energéticos (ERSE)',cargo:'',forma:'PARECER_ESCRITO',objeto:'Implicações regulatórias e tarifárias',sintese:'A ERSE confirma a sua competência regulatória exclusiva nas matérias tarifárias e propõe coordenação institucional na elaboração das portarias de execução previstas nos arts. 14.º e 18.º, com um cronograma de consulta de 60 dias.'},
        {id:'c3',data:'2026-02-22',entidade:'Ministério de Estado e das Finanças (Gabinete SEAF)',cargo:'',forma:'REUNIAO',objeto:'Tratamento fiscal de excedentes injetados em rede',sintese:'Foi acordado o enquadramento fiscal dos excedentes em sede de IRS, categoria E, com isenção até 600€/ano por agregado familiar, com reporte ao OE/2027 e estimativa de impacto orçamental neutro até 2028.'},
      ],
      comprovativos:[
        {jti:'cmp_M0-a3F27Kx9bMnQ',marco:'M0',emitido_em:'2026-01-12T11:32:00Z',estado:'VERIFICADO'},
        {jti:'cmp_M1-9fK2bL7xQw4p',marco:'M1',emitido_em:'2026-05-04T16:05:00Z',estado:'VERIFICADO'},
      ],
      versoes:[
        {n:1,ts:'2026-01-12T09:14:00Z',autor:'Maria Silva',marco:null,desc:'FPL criada · Bloco A preenchido'},
        {n:2,ts:'2026-01-12T11:32:00Z',autor:'Maria Silva',marco:'M0',desc:'M0 validado · comprovativo emitido · estado → Em elaboração'},
        {n:3,ts:'2026-02-12T18:30:00Z',autor:'Maria Silva',marco:null,desc:'Bloco D: registo da reunião com APREN'},
        {n:5,ts:'2026-02-19T17:00:00Z',autor:'Maria Silva',marco:null,desc:'Bloco D: registo da videoconferência com EDP'},
        {n:7,ts:'2026-03-05T16:10:00Z',autor:'Maria Silva',marco:null,desc:'Bloco D: registo da audiência com CGTP-IN'},
        {n:9,ts:'2026-03-21T11:00:00Z',autor:'Maria Silva',marco:null,desc:'Bloco D: parecer escrito do Prof. Sá da Costa anexado'},
        {n:11,ts:'2026-04-02T17:45:00Z',autor:'Maria Silva',marco:null,desc:'Bloco D: registo da reunião com Coopérnico'},
        {n:12,ts:'2026-04-21T19:00:00Z',autor:'Maria Silva',marco:null,desc:'Bloco D: registo da reunião com REN'},
        {n:13,ts:'2026-05-04T16:05:00Z',autor:'Maria Silva',marco:'M1',desc:'M1 validado · declaração da titular assinada · comprovativo emitido · estado → Em RSE'},
      ],
    }),
    // ── fpl-002 · EM_ELABORACAO ─────────────────────────────────────────
    mk({
      id:'fpl-002', numero:'2026/MAEN/0049', tipo:'DL', gabinete:'maen',
      titulo:'Decreto-Lei que estabelece o regime de gestão de resíduos de equipamentos elétricos e eletrónicos (transposição da Diretiva (UE) 2024/884)',
      titulo_curto:'Gestão de REEE — transposição UE 2024/884',
      estado:'EM_ELABORACAO', origem:'TRANSPOSICAO_UE', ref_origem:'Diretiva (UE) 2024/884 do Parlamento Europeu e do Conselho, de 11 de março de 2024',
      sintese:'O presente diploma transpõe a Diretiva (UE) 2024/884, que estabelece novos limites de recuperação e reciclagem de resíduos de equipamentos elétricos e eletrónicos (REEE), incluindo as categorias adicionais introduzidas pela revisão de 2024 (designadamente equipamentos com baterias integradas não removíveis e pequenos equipamentos de tecnologia da informação) e novos requisitos de informação ao consumidor sobre origem, composição material e conteúdo de matérias-primas críticas. O prazo de transposição expira em 30 de junho de 2027.',
      avaliacao_previa:1, criado_por:'u-maria', criado_em:'2026-04-28T09:40:00Z',
      m0:'2026-04-28T10:00:00Z',m0_por:'u-maria',
      rse_prevista:'2026-08-15',cp_prevista_inicio:'2026-08-25',cm_prevista:'2026-11-12',
      bloco_d:[
        {id:'d1',data:'2026-05-12',forma:'REUNIAO',entidade:'APED — Associação Portuguesa de Empresas de Distribuição',rtri_id:'RTRI/2025/00415',natureza:'RTRI_INSCRITO',gov:'Secretária de Estado do Ambiente; Adjunta',interlocutor:'Diretora-geral; Coordenador de sustentabilidade',objeto:'Modelo de retoma de pequenos REEE pelos distribuidores e impacto da nova categoria de equipamentos com baterias integradas.',sintese:'A APED solicitou clarificação quanto ao perímetro da obrigação 1-por-1 e 1-por-0 nas grandes superfícies, especialmente para equipamentos com baterias integradas não removíveis cujo manuseamento envolve risco específico. Defendeu período de adaptação logística de 18 meses após entrada em vigor e modelo de financiamento ajustado via SIGRE.',decisao:null,justificacao:''},
        {id:'d2',data:'2026-05-15',forma:'CORRESPONDENCIA',entidade:'Sociedade Ponto Verde',rtri_id:'',natureza:'OUTRA',gov:'Adjunta SEA',interlocutor:'',objeto:'Articulação com o sistema integrado de gestão e revisão das taxas de gestão.',sintese:'A SPV apresentou em correspondência escrita propostas técnicas para a articulação entre o novo regime e os fluxos de recolha seletiva já operacionais, alertando para a necessidade de revisão das taxas ecocontribuição face às novas categorias.',decisao:null,justificacao:''},
      ],
      comprovativos:[{jti:'cmp_M0-5kT2yB8nQp1r',marco:'M0',emitido_em:'2026-04-28T10:00:00Z',estado:'VALIDO'}],
      versoes:[
        {n:1,ts:'2026-04-28T09:40:00Z',autor:'Maria Silva',marco:null,desc:'FPL criada'},
        {n:2,ts:'2026-04-28T10:00:00Z',autor:'Maria Silva',marco:'M0',desc:'M0 validado · comprovativo emitido · estado → Em elaboração'},
        {n:3,ts:'2026-05-12T17:30:00Z',autor:'Maria Silva',marco:null,desc:'Bloco D: registo da reunião com APED'},
        {n:4,ts:'2026-05-15T11:00:00Z',autor:'Maria Silva',marco:null,desc:'Bloco D: correspondência da Sociedade Ponto Verde anexada'},
      ],
    }),
    // ── fpl-005 · PUBLICADO (ciclo completo) ────────────────────────────
    mk({
      id:'fpl-005', numero:'2025/MJ/0058', tipo:'DL', gabinete:'mj',
      titulo:'Decreto-Lei que aprova o regime jurídico da mediação civil e comercial e revoga a Lei n.º 29/2013, de 19 de abril',
      titulo_curto:'Regime jurídico da mediação civil e comercial',
      estado:'PUBLICADO', origem:'PROGRAMA_GOVERNO', ref_origem:'Programa do Governo XXV, Eixo IV — Justiça Próxima e Acessível',
      sintese:'O presente diploma consolida e moderniza o quadro normativo da mediação extrajudicial em matérias civis e comerciais, alinhando o regime nacional com a revisão da Diretiva (UE) 2008/52 e com as melhores práticas europeias. Reforça o estatuto do mediador certificado, clarifica a executoriedade dos acordos de mediação homologados, articula a mediação com os julgados de paz e com os centros de arbitragem institucionalizada, e cria um regime de incentivo fiscal limitado para utilização da mediação em litígios comerciais de valor superior a 50.000€. Revoga, com produção de efeitos a 1 de julho de 2026, a Lei n.º 29/2013, de 19 de abril.',
      avaliacao_previa:1, criado_por:'u-carla', criado_em:'2025-09-01T09:30:00Z',
      cl_ref:'CL-2025-211', cl_inicio:'2025-11-08', cl_fim:'2025-12-08', cl_n:67,
      cl_sintese:'Os 67 contributos recebidos incidem sobretudo em quatro eixos. Em primeiro lugar, as ordens profissionais (Ordem dos Advogados, Ordem dos Notários, Ordem dos Solicitadores e Agentes de Execução) manifestaram posições convergentes quanto à exigência de formação certificada de 200 horas para os mediadores e à criação de uma carteira profissional unificada. Em segundo lugar, os centros de arbitragem e as associações representativas de mediadores (APMC, GRAL) defenderam a executoriedade automática dos acordos homologados, sem necessidade de exequatur judicial, e o reforço da articulação institucional com os tribunais judiciais. Em terceiro lugar, recebeu-se um conjunto de 28 contributos individuais de cidadãos e de pequenas empresas que sublinharam a importância da redução do custo da mediação e a necessidade de informação clara sobre os direitos das partes durante o processo. Por fim, o Conselho Superior da Magistratura e a Procuradoria-Geral da República, em pareceres concordantes, recomendaram a clarificação do regime da prescrição e da litispendência durante a pendência da mediação e a salvaguarda do princípio do contraditório.',
      cl_decisao:'Acolheu-se integralmente o reforço dos requisitos de certificação dos mediadores (200 horas, art. 9.º) e a criação da carteira profissional unificada, gerida pela DGPJ. A executoriedade automática dos acordos homologados foi consagrada nos arts. 27.º e 28.º. A articulação com os julgados de paz foi clarificada no capítulo V. Os incentivos fiscais para mediação comercial foram limitados, na sua aplicação prática, por exigência das Finanças, ao patamar de 50.000€ inicialmente proposto. Não foram acolhidas as propostas que pretendiam tornar a mediação obrigatória em certas matérias, por suscitarem reservas de constitucionalidade.',
      m0:'2025-09-01T10:00:00Z',m0_por:'u-carla',
      m1:'2025-10-30T16:00:00Z',m1_por:'u-carla',m1_decl:1,
      m2:'2025-11-07T11:00:00Z',
      m3:'2025-12-16T15:00:00Z',
      m4:'2026-03-09T10:30:00Z',m4_por:'u-carla',m4_decl:1,
      m5:'2026-04-22T08:00:00Z',ref_dr:'DR n.º 78/2026, 1.ª Série, de 22-04-2026', data_publicacao:'2026-04-22T08:00:00Z',
      bloco_d:[
        {id:'d1',data:'2025-10-02',forma:'REUNIAO',entidade:'Ordem dos Advogados',rtri_id:'',natureza:'RTRI_FORCA_LEI',gov:'Secretário de Estado da Justiça',interlocutor:'Bastonária; Presidente do Conselho Distrital de Lisboa',objeto:'Estatuto do mediador, articulação com o patrocínio judiciário e formação certificada.',sintese:'A Ordem dos Advogados defendeu a exigência de formação certificada equivalente para todos os mediadores (200 horas mínimas) e a clarificação inequívoca da articulação entre a atividade de mediação e o patrocínio judiciário, evitando sobreposições de competências e situações de conflito de interesses. Solicitou ainda a inclusão de incompatibilidades expressas e a previsão de regime disciplinar uniforme.',decisao:'INCORPORADA',justificacao:'Os requisitos de formação certificada de 200 horas foram consagrados no art. 9.º. A articulação com o patrocínio judiciário foi clarificada no art. 24.º, com regime expresso de incompatibilidades no art. 11.º. O regime disciplinar uniforme ficou previsto no capítulo VII (arts. 35.º a 41.º).'},
        {id:'d2',data:'2025-10-09',forma:'REUNIAO',entidade:'Ordem dos Solicitadores e Agentes de Execução',rtri_id:'',natureza:'RTRI_FORCA_LEI',gov:'SE Justiça',interlocutor:'Bastonário; Presidente do Conselho Profissional dos Solicitadores',objeto:'Acesso dos solicitadores à atividade de mediação e articulação com a execução dos acordos.',sintese:'A OSAE defendeu o reconhecimento dos solicitadores como mediadores elegíveis, em paridade com os advogados, e propôs a criação de um regime simplificado de execução dos acordos de mediação através dos agentes de execução, dispensando recurso aos tribunais nos casos de cumprimento voluntário parcial.',decisao:'PARCIALMENTE_INCORPORADA',justificacao:'O reconhecimento dos solicitadores como mediadores foi consagrado no art. 8.º. O regime simplificado de execução foi acolhido na sua arquitetura essencial (art. 29.º), embora com a salvaguarda da homologação judicial prévia, dada a sua relevância para a executoriedade.'},
        {id:'d3',data:'2025-10-20',forma:'AUDIENCIA',entidade:'Conselho Superior da Magistratura (CSM)',rtri_id:'',natureza:'AUTORIDADE_PUBLICA',gov:'Ministra da Justiça; SE Justiça',interlocutor:'Vice-Presidente; Vogal relator',objeto:'Articulação da mediação com a tramitação judicial, homologação e suspensão da prescrição.',sintese:'O CSM emitiu parecer favorável, recomendando a clarificação do regime de homologação judicial dos acordos de mediação (designadamente a competência territorial), a executoriedade automática dos acordos homologados (sem necessidade de exequatur autónomo) e a previsão expressa da suspensão dos prazos de prescrição e caducidade durante a pendência da mediação, à semelhança da arbitragem.',decisao:'INCORPORADA',justificacao:'O regime de homologação foi consagrado nos arts. 26.º e 27.º com regras de competência territorial expressas. A executoriedade automática ficou prevista no art. 28.º. A suspensão dos prazos de prescrição e caducidade foi consagrada no art. 18.º com início na data da aceitação do procedimento pelo mediador.'},
        {id:'d4',data:'2025-10-27',forma:'REUNIAO',entidade:'Associação Portuguesa de Mediadores de Conflitos (APMC)',rtri_id:'',natureza:'OUTRA',gov:'SE Justiça; Adjunto SEJ',interlocutor:'Presidente; Diretora-executiva',objeto:'Estatuto profissional do mediador certificado e modelo de financiamento da mediação para cidadãos com baixos rendimentos.',sintese:'A APMC defendeu a profissionalização efetiva da mediação através de carteira profissional unificada gerida pela DGPJ, a previsão de honorários mínimos indicativos para mediação extrajudicial e a criação de um mecanismo de apoio público (mediação protegida) para cidadãos com baixos rendimentos, financiado pelo Fundo de Garantia de Justiça.',decisao:'PARCIALMENTE_INCORPORADA',justificacao:'A carteira profissional unificada foi consagrada no art. 12.º. A mediação protegida para cidadãos com baixos rendimentos foi acolhida no art. 32.º com financiamento via IGFEJ. Os honorários mínimos indicativos não foram acolhidos por incompatibilidade com o direito da concorrência (parecer da AdC anexado ao processo).'},
        {id:'d5',data:'2025-11-04',forma:'VIDEOCONFERENCIA',entidade:'Confederação do Comércio e Serviços de Portugal (CCP)',rtri_id:'RTRI/2025/00513',natureza:'RTRI_INSCRITO',gov:'SE Justiça',interlocutor:'Presidente; Coordenadora de assuntos jurídicos',objeto:'Mediação comercial, executoriedade transfronteiriça e incentivos fiscais.',sintese:'A CCP defendeu o reforço da mediação como mecanismo preferencial de resolução de litígios comerciais, propondo a criação de incentivos fiscais (dedução de 50% das despesas de mediação em sede de IRC para litígios entre empresas) e a articulação plena com a Convenção de Singapura sobre Acordos Internacionais Resultantes de Mediação, a ratificar oportunamente.',decisao:'PARCIALMENTE_INCORPORADA',justificacao:'O incentivo fiscal foi acolhido em versão calibrada com o MEF (dedução de 30%, com teto anual de 25.000€ por empresa e aplicação limitada a litígios de valor superior a 50.000€) — art. 33.º. A ratificação da Convenção de Singapura foi remetida para iniciativa autónoma do MNE.'},
        {id:'d6',data:'2025-11-12',forma:'CORRESPONDENCIA',entidade:'Prof. José Luís Bonifácio Ramos (Faculdade de Direito da Universidade de Lisboa)',rtri_id:'',natureza:'ACADEMIA_PERITO',gov:'Adjunto SEJ',interlocutor:'',objeto:'Parecer jurídico sobre constitucionalidade da mediação obrigatória prévia em matérias específicas.',sintese:'O parecer analisou em detalhe a constitucionalidade da introdução de mediação obrigatória prévia em matérias específicas (designadamente arrendamento urbano e propriedade horizontal), concluindo pela existência de reservas substanciais à luz do art. 20.º da CRP (acesso ao direito) e propondo, em alternativa, mecanismos de mediação fortemente incentivada mas voluntária.',decisao:'INCORPORADA',justificacao:'Em conformidade com o parecer, abandonou-se a opção pela mediação obrigatória que constava da versão preliminar (anteproj. art. 4.º-A), substituindo-a por um regime de incentivo voluntário forte (art. 31.º), preservando a opção dos cidadãos pela via judicial direta.'},
        {id:'d7',data:'2025-11-19',forma:'REUNIAO',entidade:'Procuradoria-Geral da República',rtri_id:'',natureza:'AUTORIDADE_PUBLICA',gov:'Ministra da Justiça',interlocutor:'Vice-Procurador-Geral da República',objeto:'Salvaguarda do princípio do contraditório e proteção de menores e adultos vulneráveis em mediação.',sintese:'A PGR sublinhou a necessidade de salvaguardas processuais específicas em mediações que envolvam menores ou adultos com capacidade diminuída, propondo a obrigatoriedade de avaliação prévia da capacidade negocial das partes e a previsão de regime expresso de intervenção do Ministério Público nas situações com indício de desequilíbrio negocial estrutural.',decisao:'INCORPORADA',justificacao:'A obrigatoriedade de avaliação prévia da capacidade negocial foi consagrada no art. 16.º. A intervenção do MP em situações de desequilíbrio negocial estrutural ficou prevista no art. 17.º. As exclusões objetivas do âmbito da mediação foram revistas no art. 4.º para refletir as recomendações da PGR.'},
        {id:'d8',data:'2025-11-26',forma:'AUDIENCIA',entidade:'DECO — Associação Portuguesa para a Defesa do Consumidor',rtri_id:'RTRI/2025/00604',natureza:'RTRI_INSCRITO',gov:'SE Justiça',interlocutor:'Direção; Coordenadora do Departamento Jurídico',objeto:'Mediação de consumo, acesso de cidadãos com baixos rendimentos e informação ao consumidor.',sintese:'A DECO defendeu a articulação plena do regime com os Centros de Arbitragem de Conflitos de Consumo, a gratuidade da mediação de consumo até um determinado valor do litígio (50€) e a obrigatoriedade de informação clara, em linguagem acessível, sobre os direitos das partes durante o processo de mediação, designadamente quanto à possibilidade de recurso aos tribunais.',decisao:'INCORPORADA',justificacao:'A articulação com os CACC foi consagrada no art. 30.º. A gratuidade da mediação de consumo abaixo do limiar de 50€ foi prevista no art. 32.º/3. A obrigação de informação clara em linguagem acessível ficou inscrita no art. 14.º, com aprovação dos modelos pela DGC após auscultação da DECO.'},
        {id:'d9',data:'2025-12-02',forma:'CORRESPONDENCIA',entidade:'Associação Sindical dos Juízes Portugueses (ASJP)',rtri_id:'',natureza:'OUTRA',gov:'Ministra da Justiça',interlocutor:'',objeto:'Impacto operacional do novo regime nos tribunais judiciais.',sintese:'A ASJP submeteu contributo manifestando preocupação com o impacto operacional da homologação judicial dos acordos de mediação no volume processual dos tribunais judiciais, sobretudo nas comarcas mais carregadas. Propôs a criação de uma secção especializada de homologação na primeira instância e a previsão de tramitação eletrónica simplificada.',decisao:'PARCIALMENTE_INCORPORADA',justificacao:'A tramitação eletrónica simplificada da homologação foi acolhida no art. 26.º/3, com remissão para portaria do MJ. A criação de secção especializada não foi acolhida por exceder o âmbito do diploma, sendo a matéria remetida para a Lei da Organização do Sistema Judiciário.'},
      ],
      bloco_c:[
        {id:'c1',data:'2025-09-25',entidade:'Direção-Geral da Política de Justiça (DGPJ)',forma:'PARECER_ESCRITO',objeto:'Capacidade operacional para gestão da carteira profissional',sintese:'A DGPJ confirmou disponibilidade para assumir a gestão da carteira profissional unificada, estimando custo plurianual de 1,8M€ no triénio 2026-2028 e propondo articulação com o sistema CITIUS para registo das homologações.'},
        {id:'c2',data:'2025-10-08',entidade:'Autoridade Tributária e Aduaneira (AT)',forma:'PARECER_ESCRITO',objeto:'Análise dos incentivos fiscais previstos',sintese:'A AT analisou os incentivos fiscais propostos no art. 33.º, concluindo pela compatibilidade técnica com o CIRC e propondo a previsão de obrigações declarativas específicas para evitar duplicação com outras deduções.'},
        {id:'c3',data:'2025-10-22',entidade:'Autoridade da Concorrência (AdC)',forma:'PARECER_ESCRITO',objeto:'Compatibilidade com o direito da concorrência',sintese:'A AdC emitiu parecer concluindo pela incompatibilidade de honorários mínimos indicativos com os princípios da concorrência, recomendando, em alternativa, a publicação periódica de estatísticas anonimizadas pela DGPJ.'},
      ],
      comprovativos:[
        {jti:'cmp_M0-9wQ2xK7nLp4m',marco:'M0',emitido_em:'2025-09-01T10:00:00Z',estado:'VERIFICADO'},
        {jti:'cmp_M1-2bH7vN9kLx3p',marco:'M1',emitido_em:'2025-10-30T16:00:00Z',estado:'VERIFICADO'},
        {jti:'cmp_M4-5tR3kP8nQy7m',marco:'M4',emitido_em:'2026-03-09T10:30:00Z',estado:'VERIFICADO'},
        {jti:'cmp_M5-7wQx1aF9bL3m',marco:'M5',emitido_em:'2026-04-22T08:00:00Z',estado:'VERIFICADO'},
      ],
      versoes:[
        {n:1,ts:'2025-09-01T09:30:00Z',autor:'Carla Almeida',marco:null,desc:'FPL criada'},
        {n:2,ts:'2025-09-01T10:00:00Z',autor:'Carla Almeida',marco:'M0',desc:'M0 validado · comprovativo emitido'},
        {n:5,ts:'2025-10-09T17:00:00Z',autor:'Carla Almeida',marco:null,desc:'Bloco D: registo da reunião com OSAE'},
        {n:8,ts:'2025-10-27T18:00:00Z',autor:'Carla Almeida',marco:null,desc:'Bloco D: registo da reunião com APMC'},
        {n:10,ts:'2025-10-30T16:00:00Z',autor:'Carla Almeida',marco:'M1',desc:'M1 validado · declaração da titular assinada · estado → Em RSE'},
        {n:12,ts:'2025-11-07T11:00:00Z',autor:'Carla Almeida',marco:'M2',desc:'M2 registado · CL-2025-211 ConsultaLEX · CP aberta a 08/11'},
        {n:15,ts:'2025-12-16T15:00:00Z',autor:'Carla Almeida',marco:'M3',desc:'M3 registado · CP encerrada · 67 contributos · síntese e decisão Bloco E preenchidas'},
        {n:17,ts:'2026-02-26T11:00:00Z',autor:'Rui Ferreira',marco:null,desc:'Auditoria SGGOV-QA · pontuação 92/100 · ex-post · CONCLUIDA'},
        {n:18,ts:'2026-03-09T10:30:00Z',autor:'Carla Almeida',marco:'M4',desc:'M4 validado · comprovativo emitido · estado → Em CM'},
        {n:19,ts:'2026-04-09T19:00:00Z',autor:'Carla Almeida',marco:null,desc:'Aprovado em Conselho de Ministros de 09/04/2026'},
        {n:20,ts:'2026-04-22T08:00:00Z',autor:'Carla Almeida',marco:'M5',desc:'M5 validado · DR n.º 78/2026 · FPL exportada para o Portal do Governo'},
      ],
    }),
    // ── fpl-006 · EM_ELABORACAO (perto de M1, mais matura que fpl-002) ──
    mk({
      id:'fpl-006', numero:'2026/MECT/0023', tipo:'DL', gabinete:'mect',
      titulo:'Decreto-Lei que estabelece o regime jurídico das sandboxes regulatórias para tecnologia financeira e prestadores de serviços em cripto-ativos',
      titulo_curto:'Sandboxes para tecnologia financeira',
      estado:'EM_ELABORACAO', origem:'INICIATIVA_MINISTERIO', ref_origem:'Programa do Governo XXV, Eixo IV — Inovação e Competitividade, medida 7.1',
      sintese:'O presente diploma cria um quadro experimental de regulação flexível (sandbox) para empresas de tecnologia financeira e prestadores de serviços em cripto-ativos, em coordenação institucional com o Banco de Portugal, a Comissão do Mercado de Valores Mobiliários e a Autoridade de Supervisão de Seguros e Fundos de Pensões. Permite testar produtos, serviços e modelos de negócio inovadores em ambiente controlado, com duração máxima de 24 meses, derrogações específicas de obrigações regulatórias previamente autorizadas e regime reforçado de supervisão e de proteção do consumidor. Articula-se com o Regulamento (UE) 2023/1114 (MiCA) e com a Sandbox-RT já operacional ao nível europeu.',
      avaliacao_previa:1, criado_por:'u-joao', criado_em:'2026-03-18T10:00:00Z',
      m0:'2026-03-18T11:00:00Z',m0_por:'u-joao',
      rse_prevista:'2026-06-15',cp_prevista_inicio:'2026-06-22',cm_prevista:'2026-08-13',
      bloco_c:[
        {id:'c1',data:'2026-04-05',entidade:'Banco de Portugal',forma:'PARECER_ESCRITO',objeto:'Coordenação com regulador financeiro e salvaguardas AML/CFT',sintese:'O BdP confirma a sua disponibilidade para coordenar a sandbox no perímetro da sua competência, sublinhando a necessidade de critérios objetivos e mensuráveis para a seleção de candidatos, a articulação plena com as obrigações de prevenção do branqueamento e do financiamento do terrorismo decorrentes da Lei n.º 83/2017 e a previsão de mecanismos de saída ordenada (wind-down) do ambiente experimental.'},
        {id:'c2',data:'2026-04-12',entidade:'Comissão do Mercado de Valores Mobiliários (CMVM)',forma:'PARECER_ESCRITO',objeto:'Articulação com o regime MiCA e proteção dos investidores não-profissionais',sintese:'A CMVM defende a articulação obrigatória com o Regulamento (UE) 2023/1114 (MiCA) na fase de avaliação prévia de cada candidatura, evitando regimes paralelos, e propõe a interdição de participação de investidores não-profissionais em sandboxes envolvendo cripto-ativos de elevada volatilidade no primeiro ciclo experimental.'},
        {id:'c3',data:'2026-04-22',entidade:'Autoridade de Supervisão de Seguros e Fundos de Pensões (ASF)',forma:'PARECER_ESCRITO',objeto:'Sandbox para produtos insurtech e proteção do tomador',sintese:'A ASF emitiu parecer favorável quanto à inclusão de produtos insurtech, propondo a previsão expressa de proteção do tomador através de fundo de garantia específico para o período experimental e regime simplificado de portabilidade dos contratos celebrados em ambiente sandbox.'},
      ],
      bloco_d:[
        {id:'d1',data:'2026-04-08',forma:'REUNIAO',entidade:'Portugal Fintech',rtri_id:'',natureza:'OUTRA',gov:'Secretário de Estado da Economia; Adjunto SEE',interlocutor:'Presidente; Diretor executivo',objeto:'Prioridades do ecossistema fintech português para o regime de sandbox.',sintese:'A Portugal Fintech defendeu critérios de elegibilidade tecnologicamente neutros e centrados no nível de risco e na maturidade do projeto, prazo máximo de 6 meses para decisão sobre candidaturas, regime simplificado de prorrogação até 12 meses adicionais e a criação de um "passaporte sandbox" facilitador da expansão para outros ordenamentos europeus. Apresentou análise comparativa detalhada com as sandboxes do Reino Unido (FCA), Lituânia (LB) e Países Baixos (DNB).',decisao:'PARCIALMENTE_INCORPORADA',justificacao:'O prazo de 6 meses para decisão foi acolhido no art. 14.º/3, com possibilidade de prorrogação fundamentada até 9 meses. O regime simplificado de prorrogação até 12 meses foi acolhido no art. 18.º. O "passaporte sandbox" foi remetido para fase posterior, dada a necessidade de coordenação prévia ao nível europeu, designadamente no quadro da EBA e da ESMA.'},
        {id:'d2',data:'2026-04-15',forma:'VIDEOCONFERENCIA',entidade:'Confederação da Indústria Portuguesa (CIP)',rtri_id:'RTRI/2025/00018',natureza:'RTRI_INSCRITO',gov:'Secretário de Estado da Economia',interlocutor:'Coordenador da área digital; Diretor adjunto',objeto:'Posição patronal sobre o regime de sandbox e equilíbrio entre inovação e proteção do consumidor.',sintese:'A CIP saudou a iniciativa como mecanismo de competitividade do mercado nacional face a outros ordenamentos europeus mais avançados, pedindo, simultaneamente, salvaguardas robustas de proteção do consumidor (designadamente limites quantitativos de exposição individual em projetos de elevado risco) e mecanismos de saída ordeira que evitem o reaproveitamento do ambiente experimental como contorno à regulação plena.',decisao:'PARCIALMENTE_INCORPORADA',justificacao:'Os limites quantitativos de exposição individual foram acolhidos no art. 11.º/2 (teto de 5.000€ por consumidor não-profissional em projetos com classificação de risco elevado). O mecanismo de saída ordeira foi consagrado no art. 20.º, alinhado com a recomendação prévia do BdP.'},
        {id:'d3',data:'2026-04-29',forma:'AUDIENCIA',entidade:'DECO — Associação Portuguesa para a Defesa do Consumidor',rtri_id:'RTRI/2025/00604',natureza:'RTRI_INSCRITO',gov:'Adjunto SEE',interlocutor:'Coordenadora do Departamento Financeiro',objeto:'Proteção dos consumidores em ambiente experimental de cripto-ativos.',sintese:'A DECO manifestou reservas significativas quanto à participação de consumidores não-profissionais em sandboxes envolvendo cripto-ativos, propondo a interdição absoluta nesta primeira fase experimental, a obrigatoriedade de informação pré-contratual normalizada em linguagem acessível e o reforço dos mecanismos de resolução extrajudicial de litígios decorrentes da experiência sandbox.',decisao:null,justificacao:''},
      ],
      comprovativos:[{jti:'cmp_M0-8nF2kQ7pLx9m',marco:'M0',emitido_em:'2026-03-18T11:00:00Z',estado:'VERIFICADO'}],
      versoes:[
        {n:1,ts:'2026-03-18T10:00:00Z',autor:'João Pereira',marco:null,desc:'FPL criada'},
        {n:2,ts:'2026-03-18T11:00:00Z',autor:'João Pereira',marco:'M0',desc:'M0 validado · comprovativo emitido'},
        {n:3,ts:'2026-04-05T16:00:00Z',autor:'João Pereira',marco:null,desc:'Bloco C: parecer escrito do Banco de Portugal anexado'},
        {n:4,ts:'2026-04-08T17:30:00Z',autor:'João Pereira',marco:null,desc:'Bloco D: registo da reunião com Portugal Fintech'},
        {n:5,ts:'2026-04-12T11:00:00Z',autor:'João Pereira',marco:null,desc:'Bloco C: parecer escrito da CMVM anexado'},
        {n:7,ts:'2026-04-22T15:00:00Z',autor:'João Pereira',marco:null,desc:'Bloco C: parecer escrito da ASF anexado'},
        {n:8,ts:'2026-04-29T18:00:00Z',autor:'João Pereira',marco:null,desc:'Bloco D: audiência DECO registada (decisão pendente)'},
      ],
    }),
  ];
  const auditorias = [
    {id:'a1',fpl_id:'fpl-001',auditor:'Rui Ferreira',data:'2026-05-06T10:00:00Z',pontuacao:94,observacoes:'FPL com cobertura adequada e proporcional das interações relevantes. Decisões de incorporação bem fundamentadas, com remissão expressa para articulado. Diversidade de naturezas (RTRI, perito académico, autoridade pública) bem assegurada. Sugestão menor: explicitar no objeto da entrada D-2 (EDP) se a videoconferência abrangeu também aspetos tarifários (decisão correta de remissão para ERSE, mas merece registo expresso).',pedido_correcao:0,estado_correcao:'CONCLUIDA'},
    {id:'a3',fpl_id:'fpl-005',auditor:'Rui Ferreira',data:'2026-02-26T11:00:00Z',pontuacao:92,observacoes:'Auditoria ex-post realizada na transição entre M3 e M4. FPL exemplar quanto ao equilíbrio das audiências e à fundamentação detalhada das decisões de não-incorporação, designadamente quanto à mediação obrigatória (parecer Prof. Bonifácio Ramos) e aos honorários mínimos (parecer AdC). Excelente articulação Bloco C/Bloco D/Bloco E.',pedido_correcao:0,estado_correcao:'CONCLUIDA'},
  ];
  const notificacoes = [
    // fpl-001
    {id:'n01',user:'u-maria',tipo:'M1_VALIDADO',titulo:'M1 validado · 2026/MAEN/0042',msg:'Comprovativo de M1 (pré-RSE) emitido. Aguarda agendamento em Reunião de Secretários de Estado.',ts:'2026-05-04T16:08:00Z',lida:false,fpl_id:'fpl-001'},
    {id:'n02',user:'u-maria',tipo:'AUDITORIA_QA_CONCLUIDA',titulo:'Auditoria QA concluída · 2026/MAEN/0042',msg:'Pontuação 94/100. Sem pedidos de correção. Observação menor sobre a entrada D-2.',ts:'2026-05-06T10:30:00Z',lida:true,fpl_id:'fpl-001'},
    {id:'n03',user:'u-rui',tipo:'M1_VALIDADO',titulo:'M1 emitido · 2026/MAEN/0042',msg:'Comprovativo de M1 verificado pelo SmartLegis.',ts:'2026-05-04T16:10:00Z',lida:true,fpl_id:'fpl-001'},
    // fpl-005
    {id:'n09',user:'u-carla',tipo:'M5_VALIDADO',titulo:'M5 validado · 2025/MJ/0058',msg:'Diploma publicado no DR n.º 78/2026, 1.ª Série. FPL exportada para o Portal do Governo.',ts:'2026-04-22T08:05:00Z',lida:true,fpl_id:'fpl-005'},
    // fpl-006
    {id:'n10',user:'u-joao',tipo:'M0_VALIDADO',titulo:'Bloco D: decisão pendente · 2026/MECT/0023',msg:'Entrada DECO (29/04) ainda sem decisão de incorporação. M1 (pré-RSE) bloqueado.',ts:'2026-04-29T18:10:00Z',lida:false,fpl_id:'fpl-006'},
  ];
  return {fpls,auditorias,notificacoes,seq:96};
}

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) { DB = JSON.parse(raw); return; }
  } catch {}
  DB = seed();
  save();
}
function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(DB)); } catch {} }
function resetDB() { DB = seed(); save(); }

/* ============ WORKFLOW (validação client-side real) ============
   Novo desenho: CP depois da RSE.
     CRIADO → (M0) EM_ELABORACAO → (M1 pré-RSE, bloq) EM_RSE
     → (M2 abre CP) EM_CONSULTA_PUBLICA → (M3 encerra CP, informativo)
     → (M4 pré-CM, bloq) EM_CM → APROVADO → (M5) PUBLICADO       */
const TRANS = {
  M0:{from:['CRIADO'],to:'EM_ELABORACAO'},
  M1:{from:['EM_ELABORACAO','EM_CONSULTA_INTERNA'],to:'EM_RSE'},
  // M2: abertura da CP (EM_RSE → EM_CONSULTA_PUBLICA) ou, se CP dispensada,
  //     marca apenas a saída de RSE (EM_RSE → POS_RSE).
  M2:{from:['EM_RSE'],to:'EM_CONSULTA_PUBLICA'},
  // M3 (encerramento da CP) é informativo — mantém estado EM_CONSULTA_PUBLICA.
  M3:{from:['EM_CONSULTA_PUBLICA'],to:'EM_CONSULTA_PUBLICA'},
  // M4: aceita CP encerrada ou CP dispensada (POS_RSE).
  M4:{from:['EM_CONSULTA_PUBLICA','POS_RSE'],to:'EM_CM'},
  M5:{from:['APROVADO'],to:'PUBLICADO'},
};
function validarMarco(f, marco) {
  const p = [];
  const t = TRANS[marco];
  if (!t) return {ok:false,pend:[{d:'Marco desconhecido'}]};
  if (!t.from.includes(f.estado))
    return {ok:false,pend:[{d:`Estado atual "${ESTADOS[f.estado].l}" — ${marco} requer um de: ${t.from.map(s=>ESTADOS[s].l).join(', ')}`}]};
  if (marco==='M0') {
    if (!f.origem) p.push({d:'Bloco B: tipo de origem por definir'});
    if (!f.sintese || f.sintese.length<LIM.SINTESE_B) p.push({d:`Bloco B: síntese do problema (mínimo ${LIM.SINTESE_B} caracteres; atual ${f.sintese?f.sintese.length:0})`});
  }
  // M1 · Pré-RSE (bloqueante) — exige decisão + justificação em todas as
  // entradas do Bloco D (lógica que antes vivia em M3, antes da reordenação).
  if (marco==='M1') {
    if (!f.m0) p.push({d:'M0 não validado'});
    (f.bloco_d||[]).forEach((d,i)=>{
      if (!d.decisao) p.push({d:`Bloco D · entrada ${i+1} (${d.entidade}): decisão de incorporação por preencher`});
      else if (!d.justificacao || d.justificacao.length<LIM.JUSTIF_D) p.push({d:`Bloco D · entrada ${i+1} (${d.entidade}): justificação (mínimo ${LIM.JUSTIF_D} caracteres)`});
    });
  }
  // M2 · Pós-RSE / Abertura da CP (informativo)
  // Se CP dispensada: M2 marca apenas a saída da RSE; exige justificação ≥ LIM.JUSTIF_CP.
  if (marco==='M2') {
    if (!f.m1) p.push({d:'M1 (pré-RSE) não validado'});
    if (f.cl_dispensada) {
      const j = f.cl_dispensada_justif || '';
      if (j.length < LIM.JUSTIF_CP) p.push({d:`Bloco E: justificação da dispensa de consulta pública (mínimo ${LIM.JUSTIF_CP} caracteres; atual ${j.length})`});
    } else {
      if (!f.cl_ref) p.push({d:'Bloco E: referência da consulta pública por preencher'});
      if (!f.cl_inicio) p.push({d:'Bloco E: data de início da CP por preencher'});
    }
  }
  // M3 · Encerramento da CP (informativo) — não se aplica se CP dispensada
  if (marco==='M3') {
    if (f.cl_dispensada) p.push({d:'CP dispensada — M3 não é aplicável'});
    if (!f.m2) p.push({d:'M2 (abertura da CP) não validado'});
    if (!f.cl_fim) p.push({d:'Bloco E: data de fim da CP por preencher'});
    if (!f.cl_sintese || f.cl_sintese.length<LIM.SINTESE_E) p.push({d:`Bloco E: síntese das posições (mínimo ${LIM.SINTESE_E} caracteres)`});
    if (!f.cl_decisao || f.cl_decisao.length<LIM.DECISAO_E) p.push({d:`Bloco E: decisão sobre incorporação (mínimo ${LIM.DECISAO_E} caracteres)`});
  }
  // M4 · Pré-CM (bloqueante) — depende de M1 e (M3 ou CP dispensada) e auditoria QA sem pedidos.
  if (marco==='M4') {
    if (!f.m1) p.push({d:'M1 (pré-RSE) não validado'});
    if (!f.cl_dispensada && !f.m3) p.push({d:'M3 (encerramento da CP) não validado'});
    const pend = DB.auditorias.filter(a=>a.fpl_id===f.id && a.pedido_correcao && a.estado_correcao!=='CONCLUIDA');
    if (pend.length) p.push({d:`${pend.length} pedido(s) de correção pendente(s) da auditoria SGGOV`});
  }
  if (marco==='M5') {
    if (!f.m4) p.push({d:'M4 não validado'});
    if (f.estado!=='APROVADO') p.push({d:'A FPL tem de estar em "Aprovado" (após Conselho de Ministros) antes de M5'});
    if (!f.ref_dr) p.push({d:'Referência do Diário da República por preencher'});
  }
  return {ok:p.length===0,pend:p};
}
function proxMarco(f) {
  if (!f.m0) return 'M0';
  if (!f.m1 && ['EM_ELABORACAO','EM_CONSULTA_INTERNA'].includes(f.estado)) return 'M1';
  if (!f.m2 && f.estado==='EM_RSE') return 'M2';
  // CP dispensada: salta M3, vai direto a M4 a partir de POS_RSE
  if (f.cl_dispensada) {
    if (!f.m4 && f.estado==='POS_RSE') return 'M4';
  } else {
    if (!f.m3 && f.estado==='EM_CONSULTA_PUBLICA' && f.cl_fim) return 'M3';
    if (!f.m4 && f.estado==='EM_CONSULTA_PUBLICA' && f.m3) return 'M4';
  }
  if (!f.m5 && f.estado==='APROVADO') return 'M5';
  if (f.estado==='EM_CM') return 'APROVAR';
  return null;
}

/* ============ COMPROVATIVO CRIPTOGRÁFICO (simulado) ============ */
function emitirComprovativo(f, marco, user) {
  const jti = 'cmp_'+marco+'-'+Math.random().toString(36).slice(2,14);
  const header = {alg:'EdDSA',typ:'fpl-comprovativo+jws',kid:'fpl-2026-01'};
  const payload = {
    iss:'fpl.gov.pt', sub:f.numero, fpl_id:f.id, marco,
    validado_em:nowISO(), validado_por:user.papel+':'+(user.gabinete||'sggov'),
    snapshot_hash:'sha256:'+Math.random().toString(16).slice(2,18)+Math.random().toString(16).slice(2,18),
    jti, iat:Math.floor(Date.now()/1000),
  };
  if (marco==='M2' && f.cl_dispensada) {
    payload.cp_dispensada = true;
    payload.cp_justif_hash = 'sha256:'+Math.random().toString(16).slice(2,18)+Math.random().toString(16).slice(2,18);
  }
  const sig = (Math.random().toString(36)+Math.random().toString(36)+Math.random().toString(36)).replace(/[^a-z0-9]/g,'').slice(0,86);
  const jws = b64u(header)+'.'+b64u(payload)+'.'+sig;
  return {jti, marco, emitido_em:payload.validado_em, estado:'VALIDO', jws, header, payload};
}

/* ============ NOTIFICAÇÕES ============ */
function notificar(userId, tipo, titulo, msg, fpl_id) {
  DB.notificacoes.unshift({id:uuid(),user:userId,tipo,titulo,msg,ts:nowISO(),lida:false,fpl_id});
}

/* ============ ESTADO DA APP ============ */
const S = {
  user:null, view:'dashboard', fplId:null, tab:'A', dropdown:null,
  // F3 extras
  cronoMesOffset: 0,
  listaSort: { col: 'numero', dir: 'desc' },
  listaQ: '',
};

function isSggov() { return S.user && ['SGGOV_QA','SGGOV_ADMIN'].includes(S.user.papel); }
function isPublico() { return S.user && S.user.papel==='PUBLICO'; }
function scopeOk(f) {
  if (!S.user) return false;
  if (isSggov()) return true;
  return f.gabinete === S.user.gabinete;
}
function fplsVisiveis() {
  if (isPublico()) return DB.fpls.filter(f=>f.estado==='PUBLICADO');
  if (isSggov()) return DB.fpls;
  return DB.fpls.filter(f=>f.gabinete===S.user.gabinete);
}
function getFpl(id) { return DB.fpls.find(f=>f.id===id); }

/* ============ TOAST / MODAL ============ */
function toast(msg, type='info', titulo='') {
  const stack = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast '+type;
  el.innerHTML = (titulo?`<div class="tt">${esc(titulo)}</div>`:'')+esc(msg);
  stack.appendChild(el);
  setTimeout(()=>el.remove(), 4800);
}
function openModal(html, lg) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-overlay" id="mov"><div class="modal ${lg?'lg':''}">${html}</div></div>`;
  document.body.style.overflow = 'hidden';
  document.getElementById('mov').addEventListener('click', e=>{ if(e.target.id==='mov') closeModal(); });
}
function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
  document.body.style.overflow = '';
}
window.closeModal = closeModal;
document.addEventListener('keydown', e=>{ if(e.key==='Escape'){closeModal();S.dropdown=null;render();} });

/* ============ THEME ============ */
function applyTheme(t){ document.documentElement.dataset.theme = t; try{localStorage.setItem('fpl-demo-theme',t);}catch{} }
function toggleTheme(){ applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark'); }
applyTheme((()=>{try{return localStorage.getItem('fpl-demo-theme')||'light';}catch{return'light';}})());

/* ============ NAVEGAÇÃO (hash routing + history) ============ */
const VIEWS_SIMPLES_DEMO = new Set(['dashboard','lista','nova','comprovativos','entidades','auditoria','portal','perfil']);

function parseHashDemo() {
  const raw = (window.location.hash || '').replace(/^#\/?/, '');
  if (!raw) return { view: null, fplId: null, sub: null };
  const parts = raw.split('/').filter(Boolean);
  if (parts[0] === 'fpl' && parts[1]) return { view: 'detalhe', fplId: parts[1], sub: parts[2] || null };
  if (VIEWS_SIMPLES_DEMO.has(parts[0])) return { view: parts[0], fplId: null, sub: null };
  return { view: null, fplId: null, sub: null };
}

function buildHashDemo(view, fplId, sub) {
  if (view === 'detalhe' && fplId) return sub ? `#/fpl/${fplId}/${sub}` : `#/fpl/${fplId}`;
  return `#/${view}`;
}

let _demoIgnoreHash = false;

function go(view, opts={}) {
  S.view = view;
  if (opts.fplId!==undefined) S.fplId = opts.fplId;
  if (opts.tab) S.tab = opts.tab;
  if (opts.sub && view === 'detalhe') {
    try { sessionStorage.setItem('fpl.detailView.' + S.fplId, opts.sub); } catch {}
  }
  S.dropdown = null;
  const novo = buildHashDemo(view, S.fplId, opts.sub);
  if (window.location.hash !== novo) {
    _demoIgnoreHash = true;
    window.location.hash = novo;
  }
  render();
  window.scrollTo(0,0);
}
window.go = go;

window.addEventListener('hashchange', () => {
  if (_demoIgnoreHash) { _demoIgnoreHash = false; return; }
  if (!S.user) return; // login não usa hash
  const p = parseHashDemo();
  if (!p.view) return;
  S.view = p.view;
  if (p.fplId) S.fplId = p.fplId;
  if (p.sub) { try { sessionStorage.setItem('fpl.detailView.' + p.fplId, p.sub); } catch {} }
  render();
});

function login(perfilId) {
  S.user = PERFIS.find(p=>p.id===perfilId);
  // Após login, se houver um hash válido respeita-o; caso contrário vai para o default
  const p = parseHashDemo();
  S.view = p.view || (isPublico() ? 'portal' : 'dashboard');
  if (p.fplId) S.fplId = p.fplId;
  render();
}
window.login = login;
function logout() { S.user=null; S.dropdown=null; render(); }
window.logout = logout;

/* ============ SVG ICONS ============ */
const I = {
  home:'<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  doc:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>',
  check:'<path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  shield:'<path d="M12 3l8 4v5c0 5-3.5 9-8 10-4.5-1-8-5-8-10V7z"/><path d="M9 12l2 2 4-4"/>',
  search:'<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>',
  globe:'<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
  download:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  user:'<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  key:'<path d="M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8zM15.5 7.5l3 3L22 7l-3-3"/>',
  bar:'<path d="M12 20V10M18 20V4M6 20v-4"/>',
  out:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  moon:'<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>',
  refresh:'<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/>',
  building:'<path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-3"/>',
  list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  edit:'<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"/>',
};
const svg = (p,cls='') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${cls}">${p}</svg>`;

/* =================================================================
   VISTAS
   ================================================================= */
function render() {
  const app = document.getElementById('app');
  if (!S.user) { app.innerHTML = renderLogin(); bindLogin(); return; }
  app.innerHTML = renderShell();
  bindShell();
}

/* ---------- LOGIN ---------- */
function renderLogin() {
  // Agrupar os perfis por contexto (PF, SGGOV, Público) para um login mais legível
  const pfs   = PERFIS.filter(p => p.papel === 'PONTO_FOCAL' || p.papel === 'PONTO_FOCAL_ALT');
  const sggov = PERFIS.filter(p => p.papel === 'SGGOV_QA' || p.papel === 'SGGOV_ADMIN' || p.papel === 'GSEPCM');
  const pub   = PERFIS.filter(p => p.papel === 'PUBLICO');

  const card = (p, destaque = false) => `
    <button class="role-card ${destaque ? 'destaque' : ''}" onclick="login('${p.id}')">
      <span class="avatar" style="background:${p.cor}">${inits(p.nome)}</span>
      <span class="meta">
        <span class="nome">${esc(p.nome)}</span>
        <span class="papel">${PAPEL_LBL[p.papel]}${p.gabinete ? ' · ' + gab(p.gabinete).sigla : ''}</span>
        ${p.email !== '—' ? `<span class="email">${esc(p.email)}</span>` : ''}
      </span>
      <span class="seta" aria-hidden="true">→</span>
    </button>`;

  return `
  <div class="entrada-painel">
    <aside class="entrada-side">
      <div class="entrada-brand">
        <div class="brand-crest">${svg(I.shield)}</div>
        <div class="brand-name">FPL · SGGOV</div>
        <div class="brand-sub">Pegada Legislativa do Governo</div>
      </div>
      <div class="entrada-tagline">
        <h2>Documentar quem influencia a lei.</h2>
        <p>Em execução do art.º 4.º da Lei n.º 5-A/2026 e da RCM da Pegada Legislativa, todos os diplomas do Governo passam a registar — bloco a bloco — quem foi ouvido, o que foi dito, e o que foi acolhido.</p>
        <ul class="entrada-feat">
          <li><span class="ico">⚿</span><span><strong>Comprovativos criptográficos</strong> em cada marco bloqueante (M0, M1, M4, M5)</span></li>
          <li><span class="ico">▤</span><span><strong>Painel + cronograma</strong> da tramitação de cada FPL</span></li>
          <li><span class="ico">↗</span><span><strong>Exportação automática</strong> para o Portal do Governo após M5</span></li>
        </ul>
      </div>
      <div class="entrada-foot">
        Demonstração interativa autónoma · v1.5<br>
        Corre inteiramente no seu navegador · dados fictícios<br>
        XXV Governo Constitucional
      </div>
    </aside>
    <main class="entrada-main">
      <div class="entrada-corpo">
        <header>
          <span class="kicker">Demonstração técnica · sem compromisso oficial</span>
          <h1>Escolha um perfil para entrar.</h1>
          <p>Numa instalação real, o login faz-se contra o diretório interno dos serviços (LDAP/AD do Governo) e a aplicação está confinada à Rede Informática do Governo. Aqui pode trocar de perspetiva a qualquer momento.</p>
        </header>

        <section>
          <div class="grupo-titulo"><span class="num">1</span>Pontos focais dos gabinetes ministeriais</div>
          <div class="role-grid">${pfs.map(p => card(p, p.id === 'u-maria')).join('')}</div>
        </section>

        <section>
          <div class="grupo-titulo"><span class="num">2</span>Secretaria-Geral do Governo (SGGOV)</div>
          <div class="role-grid">${sggov.map(p => card(p)).join('')}</div>
        </section>

        <section>
          <div class="grupo-titulo"><span class="num">3</span>Vista pública</div>
          <div class="role-grid">${pub.map(p => card(p)).join('')}</div>
        </section>

        <div class="entrada-aviso">
          <strong>O estado é guardado apenas no seu navegador.</strong> Pode reiniciar a demonstração em qualquer momento através do menu do utilizador (canto inferior esquerdo, depois de entrar).
        </div>
      </div>
    </main>
  </div>`;
}
function bindLogin() {}

/* ---------- SHELL ---------- */
function renderShell() {
  const u = S.user;
  const sggov = isSggov();
  const pub = isPublico();
  const nUnread = DB.notificacoes.filter(n=>n.user===u.id && !n.lida).length;
  document.body.classList.add('painel-mode');

  // Layout do PÚBLICO usa um shell diferente (topbar simples + main full-width)
  if (pub) {
    document.body.classList.remove('painel-mode');
    const body = S.view==='portal-fpl' ? viewPortalFpl() : (S.view==='portal-dataset'?viewPortalDataset():viewPortal());
    return `
    <div class="demo-banner">DEMONSTRAÇÃO · dados fictícios · estado guardado apenas neste navegador · <button onclick="confirmReset()">reiniciar demonstração</button></div>
    <header class="topbar">
      <div class="brand">
        <span class="crest">${svg(I.shield)}</span>
        <span class="bt"><span class="t1">República Portuguesa</span><span class="t2">Portal do Governo</span></span>
      </div>
      <nav>
        <button class="${S.view==='portal'?'active':''}" onclick="go('portal')">Portal do Governo</button>
        <button class="${S.view==='portal-dataset'?'active':''}" onclick="go('portal-dataset')">Dados abertos</button>
      </nav>
      <div class="right">
        <button class="icon-btn" title="Tema claro/escuro" onclick="toggleTheme();render()">${svg(I.moon)}</button>
        <div class="userchip" onclick="S.dropdown=S.dropdown==='user'?null:'user';render()">
          <span class="avatar" style="background:${u.cor}">${inits(u.nome)}</span>
          <span class="um"><span class="n">${esc(u.nome)}</span><span class="r">${PAPEL_LBL[u.papel]}</span></span>
        </div>
        ${S.dropdown==='user'?renderUserMenu():''}
      </div>
    </header>
    <div class="shell"><main class="main">${body}</main></div>
    <footer class="footer">Portal do Governo · Demonstração · dados fictícios</footer>`;
  }

  // ── Layout autenticado (painel com sidebar escura) ──
  const body = ({
    dashboard: viewDashboard, lista: viewLista, nova: viewNova, detalhe: viewDetalhe,
    auditoria: viewAuditoria, entidades: viewEntidades, comprovativos: viewComprovativos,
  }[S.view] || viewDashboard)();
  const isDetalhe = S.view === 'detalhe';

  return `
  <div class="painel-app">
    ${renderSidebar(nUnread)}
    <div class="painel-main">
      <div class="demo-banner-top">DEMONSTRAÇÃO · dados fictícios · guardados apenas neste navegador · <button onclick="confirmReset()">reiniciar</button></div>
      <main id="main" class="painel-main-inner ${isDetalhe?'no-padding':''}" tabindex="-1">${body}</main>
    </div>
    ${S.dropdown==='notif'?renderNotifPanel():''}
    ${S.dropdown==='user'?renderUserMenu():''}
  </div>`;
}

function bindShell() {
  if (S.view==='detalhe') bindDetalhe();
  if (S.view==='nova') bindNova();
  if (S.view==='lista') bindLista();
}

function renderSidebar(nUnread) {
  const u = S.user;
  const sggov = isSggov();
  const myFpls = fplsVisiveis();
  const ativos = myFpls.filter(f=>!['PUBLICADO','ARQUIVADO'].includes(f.estado)).length;
  const emCm = myFpls.filter(f=>f.estado==='EM_CM').length;
  const publicadas = myFpls.filter(f=>f.estado==='PUBLICADO').length;
  const validar = myFpls.filter(f=>f.estado==='EM_ELABORACAO' && !f.m1).length;
  const link = (v,ic,l,extra='') => `<button class="link ${S.view===v?'active':''}" onclick="go('${v}')">${svg(ic)}<span>${l}</span>${extra}</button>`;
  const pill = (n,gold=true) => n>0 ? `<span class="${gold?'pill':'dot-unread'}">${gold?n:''}</span>` : '';

  return `
  <aside class="painel-side" aria-label="Menu lateral">
    <div class="brand">
      <span class="crest-mini">${svg(I.shield)}</span>
      <div class="brand-text">
        <div class="brand-name">FPL · SGGOV</div>
        <div class="brand-sub">Pegada Legislativa</div>
      </div>
    </div>
    <div class="group">
      <div class="group-title">Trabalho</div>
      ${link('dashboard',I.home,'Início')}
      ${link('lista',I.doc, sggov?'Todas as FPL':'As minhas FPL', pill(ativos))}
      ${!sggov?link('nova',I.plus,'Nova FPL'):''}
      <button class="link" onclick="S.dropdown=S.dropdown==='notif'?null:'notif';render()">${svg(I.bell)}<span>Notificações</span>${pill(nUnread)}</button>
    </div>
    <div class="group">
      <div class="group-title">Vistas</div>
      ${validar>0?`<button class="link" onclick="go('lista')">${svg(I.check)}<span>A validar (${validar})</span></button>`:''}
      ${emCm>0?`<button class="link" onclick="go('lista')">${svg(I.shield)}<span>Em CM (${emCm})</span></button>`:''}
      ${publicadas>0?`<button class="link" onclick="go('lista')">${svg(I.check)}<span>Publicadas (${publicadas})</span></button>`:''}
      ${sggov?link('auditoria',I.shield,'Auditoria QA'):''}
      ${sggov?link('comprovativos',I.key,'Comprovativos'):''}
      ${sggov?link('entidades',I.search,'Entidades RTRI'):''}
    </div>
    <div class="group">
      <div class="group-title">Transparência</div>
      <button class="link" onclick="S.user=PERFIS.find(p=>p.id==='u-cidadao');go('portal')">${svg(I.globe)}<span>Portal do Governo</span></button>
      <button class="link" onclick="toggleTheme();render()">${svg(I.moon)}<span>Tema claro/escuro</span></button>
    </div>
    <button class="bottom user-trigger" onclick="S.dropdown=S.dropdown==='user'?null:'user';render()" aria-label="Abrir menu do utilizador" aria-haspopup="true" aria-expanded="${S.dropdown==='user'}">
      <div class="av" style="background:${u.cor}">${inits(u.nome)}</div>
      <div class="nm"><strong>${esc(u.nome)}</strong><span>${PAPEL_LBL[u.papel]}${u.gabinete?' · '+gab(u.gabinete).sigla:''}</span></div>
      <span class="caret" aria-hidden="true">⌃</span>
    </button>
  </aside>`;
}
function renderUserMenu() {
  const u = S.user;
  const tema = document.documentElement.dataset.theme === 'dark' ? 'escuro' : 'claro';
  return `<div class="dropdown">
    <div class="dh">
      <div class="dh-top">
        <div class="dh-avatar" style="background:${u.cor}">${inits(u.nome)}</div>
        <div>
          <div class="n">${esc(u.nome)}</div>
          <div class="e">${esc(u.email)}</div>
        </div>
      </div>
      <div class="dh-papel">${PAPEL_LBL[u.papel]}${u.gabinete?' · '+esc(gab(u.gabinete).nome):''}</div>
    </div>
    <button onclick="S.dropdown=null;toggleTheme();render()">${svg(I.moon)} Tema ${tema} → ${tema==='claro'?'escuro':'claro'}</button>
    <div class="sep"></div>
    <button onclick="S.dropdown=null;logout()">${svg(I.out)} <span>Terminar sessão · trocar perfil</span></button>
    <button onclick="S.dropdown=null;confirmReset()" class="danger">${svg(I.refresh)} <span>Reiniciar demonstração</span></button>
  </div>`;
}
function renderNotifPanel() {
  const list = DB.notificacoes.filter(n=>n.user===S.user.id).slice(0,12);
  const icoFor = t => ({M1:I.check,M3:I.check,M4:I.check,QA:I.shield,CONSULTA:I.globe}[t]||I.bell);
  return `<div class="notif-panel">
    <div class="nh"><span>Notificações</span><button class="btn sm ghost" onclick="marcarTodasLidas()">Marcar todas lidas</button></div>
    <div class="notif-list">
      ${list.length?list.map(n=>`
        <div class="notif ${n.lida?'':'unread'}" onclick="abrirNotif('${n.id}')">
          <span class="ni">${svg(icoFor(n.tipo))}</span>
          <span class="nc"><span class="nt">${esc(n.titulo)}</span><span class="nm">${esc(n.msg)} · ${fmtDH(n.ts)}</span></span>
        </div>`).join(''):'<div class="card-empty">Sem notificações</div>'}
    </div>
  </div>`;
}
window.marcarTodasLidas = () => { DB.notificacoes.forEach(n=>{if(n.user===S.user.id)n.lida=true;}); save(); render(); };
window.abrirNotif = (id) => {
  const n = DB.notificacoes.find(x=>x.id===id); if(!n) return;
  n.lida = true; save(); S.dropdown=null;
  if (n.fpl_id && getFpl(n.fpl_id)) go('detalhe',{fplId:n.fpl_id}); else render();
};
window.confirmReset = () => {
  openModal(`<div class="modal-h"><h3>Reiniciar demonstração</h3><button class="x-btn" onclick="closeModal()">✕</button></div>
  <div class="modal-b reset-modal">
    <div class="alert danger"><span class="at">Acção irreversível</span>Todas as alterações que fez (FPL criadas, marcos validados, edições) serão descartadas e os dados voltam ao estado inicial.</div>
    <label style="display:block;margin-top:14px;font-weight:600;font-size:13px;color:var(--ink-2)">Para confirmar, escreva <code class="mono" style="background:var(--surface-2);padding:1px 5px;border-radius:3px">RESET</code> em maiúsculas:</label>
    <input type="text" id="resetConfirmInp" placeholder="RESET" autocomplete="off" spellcheck="false">
  </div>
  <div class="modal-f"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn danger" id="resetConfirmBtn" disabled onclick="resetDB();closeModal();S.view='dashboard';S.fplId=null;window.location.hash='#/dashboard';render();toast('Demonstração reiniciada.','success')">Reiniciar</button></div>`);
  const inp = document.getElementById('resetConfirmInp');
  const btn = document.getElementById('resetConfirmBtn');
  inp?.addEventListener('input', () => { btn.disabled = inp.value !== 'RESET'; });
  setTimeout(() => inp?.focus(), 50);
};

window.confirmAction = (opts) => {
  // opts: { titulo, mensagem, btnLbl='Confirmar', btnClass='danger', danger=true, action }
  const danger = opts.danger !== false;
  const btnId = 'confActBtn_'+Math.random().toString(36).slice(2,8);
  openModal(`<div class="modal-h"><h3>${esc(opts.titulo)}</h3><button class="x-btn" onclick="closeModal()">✕</button></div>
  <div class="modal-b"><div class="alert ${danger?'danger':'warning'}"><span class="at">${danger?'Acção irreversível':'Confirmar acção'}</span>${esc(opts.mensagem)}</div></div>
  <div class="modal-f"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn ${opts.btnClass||(danger?'danger':'primary')}" id="${btnId}">${esc(opts.btnLbl||'Confirmar')}</button></div>`);
  const btn = document.getElementById(btnId);
  btn?.addEventListener('click', () => { closeModal(); opts.action && opts.action(); });
  setTimeout(() => btn?.focus(), 50);
};

/* ---------- DASHBOARD ---------- */
function viewDashboard() {
  return isSggov() ? dashSggov() : dashPF();
}
function dashPF() {
  const fpls = fplsVisiveis();
  const ativas = fpls.filter(f=>!['PUBLICADO','ARQUIVADO'].includes(f.estado));
  const pub = fpls.filter(f=>f.estado==='PUBLICADO');
  const emRseCm = fpls.filter(f=>['EM_RSE','EM_CM'].includes(f.estado));
  const recentes = [...fpls].sort((a,b)=>(b.criado_em||'').localeCompare(a.criado_em||'')).slice(0,6);
  const avisos = DB.notificacoes.filter(n=>n.user===S.user.id && !n.lida).slice(0,3);
  return `
  <div class="page-head">
    <div><div class="pt">Bom dia, ${esc(S.user.nome.split(' ')[0])}.</div>
    <div class="ps">${ativas.length} FPL ativas no gabinete ${gab(S.user.gabinete).sigla} · ${pub.length} publicadas</div></div>
    <button class="btn primary" onclick="go('nova')">${svg(I.plus)} Nova FPL</button>
  </div>
  <div class="kpis">
    <div class="kpi"><div class="l">FPL ativas</div><div class="v">${ativas.length}</div><div class="d">no seu gabinete</div></div>
    <div class="kpi"><div class="l">Em RSE / CM</div><div class="v" style="color:var(--accent)">${emRseCm.length}</div><div class="d">a aguardar tramitação</div></div>
    <div class="kpi"><div class="l">Publicadas</div><div class="v" style="color:var(--green)">${pub.length}</div><div class="d">no Portal do Governo</div></div>
    <div class="kpi"><div class="l">Comprovativos</div><div class="v">${fpls.reduce((s,f)=>s+(f.comprovativos||[]).length,0)}</div><div class="d">emitidos</div></div>
  </div>
  <div class="grid-2">
    <div class="card">
      <div class="card-h"><div><h3>FPL recentes</h3></div><button class="btn sm ghost" onclick="go('lista')">Ver todas</button></div>
      <table class="tbl"><thead><tr><th>Diploma</th><th>Tipo</th><th>Estado</th><th>Próximo marco</th></tr></thead><tbody>
      ${recentes.length?recentes.map(f=>{const pm=proxMarco(f);return `
        <tr class="clickable" onclick="go('detalhe',{fplId:'${f.id}'})">
          <td class="cel-t">${esc(f.titulo_curto||f.titulo.slice(0,70))}<div class="s">${esc(f.numero)}</div></td>
          <td>${tag(f.tipo)}</td><td>${badge(f.estado)}</td>
          <td>${pm?(pm==='APROVAR'?'<span class="muted small">Aguarda CM</span>':`<span class="tag">${pm}</span>`):'<span class="muted small">—</span>'}</td>
        </tr>`;}).join(''):'<tr><td colspan="4" class="card-empty">Ainda não há FPL. Crie a primeira.</td></tr>'}
      </tbody></table>
    </div>
    <div class="card">
      <div class="card-h"><h3>Avisos</h3></div>
      <div class="card-b">
        ${avisos.length?avisos.map(n=>`<div class="alert ${n.tipo==='QA'&&n.titulo.includes('correção')?'warning':'info'}" style="margin-bottom:10px"><span class="at">${esc(n.titulo)}</span>${esc(n.msg)}</div>`).join(''):'<div class="card-empty">Sem avisos pendentes</div>'}
      </div>
    </div>
  </div>`;
}
function dashSggov() {
  const all = DB.fpls;
  const porEstado = {};
  all.forEach(f=>porEstado[f.estado]=(porEstado[f.estado]||0)+1);
  const pub = all.filter(f=>f.estado==='PUBLICADO').length;
  const emRevisao = all.filter(f=>f.estado==='EM_REVISAO_QA').length;
  const totalCmp = all.reduce((s,f)=>s+(f.comprovativos||[]).length,0);
  const maxEstado = Math.max(...Object.values(porEstado),1);
  // top entidades bloco D
  const ent = {};
  all.forEach(f=>(f.bloco_d||[]).forEach(d=>{ent[d.entidade]=(ent[d.entidade]||0)+1;}));
  const topEnt = Object.entries(ent).sort((a,b)=>b[1]-a[1]).slice(0,6);
  return `
  <div class="page-head">
    <div><div class="pt">Dashboard executivo SGGOV</div><div class="ps">Visão consolidada do regime de Pegada Legislativa</div></div>
    <button class="btn" onclick="toast('Relatório trimestral gerado (demonstração).','success')">${svg(I.download)} Exportar relatório</button>
  </div>
  <div class="kpis">
    <div class="kpi"><div class="l">Total de FPL</div><div class="v">${all.length}</div><div class="d">todos os gabinetes</div></div>
    <div class="kpi"><div class="l">Publicadas</div><div class="v" style="color:var(--green)">${pub}</div><div class="d">no Portal do Governo</div></div>
    <div class="kpi"><div class="l">Comprovativos emitidos</div><div class="v">${totalCmp}</div><div class="d">verificáveis pelo SmartLegis</div></div>
    <div class="kpi"><div class="l">Em revisão QA</div><div class="v" style="color:var(--warning)">${emRevisao}</div><div class="d">pedidos de correção</div></div>
  </div>
  <div class="grid-2">
    <div class="card">
      <div class="card-h"><h3>Distribuição por estado</h3></div>
      <div class="card-b">
        ${Object.entries(porEstado).map(([e,n])=>`<div class="bar"><div class="bl">${ESTADOS[e].l}</div><div class="bt"><div class="bf" style="width:${Math.max(n/maxEstado*100,8)}%">${n}</div></div></div>`).join('')}
      </div>
    </div>
    <div class="card">
      <div class="card-h"><h3>Entidades mais interlocutadas</h3></div>
      <table class="tbl"><thead><tr><th>Entidade</th><th class="txt-r">Interações</th></tr></thead><tbody>
      ${topEnt.map(([e,n])=>`<tr><td>${esc(e)}</td><td class="txt-r"><strong>${n}</strong></td></tr>`).join('')}
      </tbody></table>
    </div>
  </div>
  <div class="card">
    <div class="card-h"><div><h3>Auditorias recentes · Bloco G</h3><div class="sub">Pontuação 0–100 · pedidos de correção</div></div>
    <button class="btn sm" onclick="go('auditoria')">Ver todas</button></div>
    <table class="tbl"><thead><tr><th>FPL</th><th>Gabinete</th><th>Auditor</th><th>Pontuação</th><th>Estado</th></tr></thead><tbody>
    ${DB.auditorias.map(a=>{const f=getFpl(a.fpl_id);return `
      <tr class="clickable" onclick="go('detalhe',{fplId:'${a.fpl_id}',tab:'G'})">
        <td><strong>${f?esc(f.numero):a.fpl_id}</strong> <span class="muted small">${f?esc(f.titulo_curto||''):''}</span></td>
        <td>${f?gab(f.gabinete).sigla:'—'}</td><td>${esc(a.auditor)}</td>
        <td><strong style="color:${a.pontuacao>=80?'var(--green)':'var(--warning)'}">${a.pontuacao}/100</strong></td>
        <td>${a.pedido_correcao&&a.estado_correcao!=='CONCLUIDA'?'<span class="badge revisao">Correção pedida</span>':'<span class="badge aprovado">Sem correções</span>'}</td>
      </tr>`;}).join('')}
    </tbody></table>
  </div>`;
}

/* ---------- LISTA ---------- */
const LISTA_COLS_DEMO = {
  numero:   'N.º Processo',
  tipo:     'Tipo',
  titulo:   'Título',
  gabinete: 'Gabinete',
  estado:   'Estado',
  m0:       'M0',
  m1:       'M1',
  m5:       'M5',
};
function viewLista() {
  const all = fplsVisiveis();
  const q = (S.listaQ || '').toLowerCase().trim();
  let filt = q ? all.filter(f => (`${f.numero} ${f.titulo} ${f.titulo_curto||''} ${gab(f.gabinete).sigla}`).toLowerCase().includes(q)) : all;
  const sort = S.listaSort;
  filt = [...filt].sort((a,b) => {
    let av = a[sort.col] ?? '', bv = b[sort.col] ?? '';
    if (sort.col === 'gabinete') { av = gab(av).sigla; bv = gab(bv).sigla; }
    if (av < bv) return sort.dir === 'asc' ? -1 : 1;
    if (av > bv) return sort.dir === 'asc' ?  1 : -1;
    return 0;
  });
  const chips = q ? [`<span class="chip">Pesquisa: "${esc(q)}"<button class="x" type="button" onclick="window._demoLimparQ()" aria-label="Limpar pesquisa">×</button></span>`] : [];
  return `
  <div class="page-head">
    <div><div class="pt">${isSggov()?'Todas as FPL':'As minhas FPL'}</div><div class="ps">${filt.length} de ${all.length} fichas${q ? ' (filtrado)' : ''}</div></div>
    ${!isSggov()?`<button class="btn primary" onclick="go('nova')">${svg(I.plus)} Nova FPL</button>`:''}
  </div>
  <div class="filters">
    <input type="search" id="demoListaQ" value="${esc(S.listaQ || '')}" placeholder="Pesquisar por número, título, gabinete..." aria-label="Pesquisar FPL" autocomplete="off">
    <div class="sep"></div>
  </div>
  ${chips.length ? `<div class="chips" aria-label="Filtros ativos">${chips.join('')}</div>` : ''}
  <div class="card">
    <table class="tbl tbl-sortable"><thead><tr>
      ${Object.entries(LISTA_COLS_DEMO).map(([col,lbl]) => `<th data-sort="${col}" class="${sort.col===col?'sort-'+sort.dir:''}">${lbl}</th>`).join('')}
    </tr></thead><tbody>
    ${filt.length?filt.map(f=>`
      <tr class="clickable" onclick="go('detalhe',{fplId:'${f.id}'})">
        <td><strong class="mono">${esc(f.numero)}</strong></td>
        <td>${tag(f.tipo)}</td>
        <td class="cel-t">${esc(f.titulo_curto||f.titulo)}</td>
        <td>${gab(f.gabinete).sigla}</td>
        <td>${badge(f.estado)}</td>
        <td class="cel-num">${fmtD(f.m0)}</td>
        <td class="cel-num">${fmtD(f.m1)}</td>
        <td class="cel-num">${fmtD(f.m5)}</td>
      </tr>`).join(''):'<tr><td colspan="8" class="card-empty">Sem FPL. Crie a primeira.</td></tr>'}
    </tbody></table>
  </div>`;
}

/* ---------- COMPROVATIVOS (SGGOV) ---------- */
function viewComprovativos() {
  const rows = [];
  DB.fpls.forEach(f=>(f.comprovativos||[]).forEach(c=>rows.push({...c,fpl:f})));
  rows.sort((a,b)=>(b.emitido_em||'').localeCompare(a.emitido_em||''));
  return `
  <div class="page-head">
    <div><div class="pt">Comprovativos criptográficos</div><div class="ps">JWS Ed25519 emitidos a cada marco bloqueante · verificáveis offline pelo SmartLegis</div></div>
    <button class="btn" onclick="modalFluxoComprovativo()">${svg(I.key)} Como funciona</button>
  </div>
  <div class="alert info"><span class="at">Acoplamento por comprovativo</span>Em cada marco bloqueante (M0, M1, M4, M5) a aplicação emite um comprovativo assinado. O ponto focal cola-o no SmartLegis, que o verifica com a chave pública partilhada e bloqueia a tramitação se a verificação falhar — sem integração síncrona entre os sistemas.</div>
  <div class="card">
    <div class="card-h"><h3>${rows.length} comprovativos emitidos</h3></div>
    <table class="tbl"><thead><tr><th>FPL</th><th>Marco</th><th>Identificador (jti)</th><th>Emitido</th><th>Estado</th></tr></thead><tbody>
    ${rows.map(r=>`
      <tr class="clickable" onclick="go('detalhe',{fplId:'${r.fpl.id}',tab:'CMP'})">
        <td><strong>${esc(r.fpl.numero)}</strong></td>
        <td><span class="tag">${r.marco}</span></td>
        <td class="cel-num">${esc(r.jti)}</td>
        <td class="cel-num">${fmtD(r.emitido_em)}</td>
        <td><span class="cmp-badge ${r.estado==='VERIFICADO'?'verif':'valido'}">${r.estado==='VERIFICADO'?'Verificado pelo SmartLegis':'Válido'}</span></td>
      </tr>`).join('')}
    </tbody></table>
  </div>`;
}

/* ---------- ENTIDADES RTRI (SGGOV) ---------- */
function viewEntidades() {
  return `
  <div class="page-head">
    <div><div class="pt">Entidades RTRI</div><div class="ps">${RTRI_ENTIDADES.length} entidades · cache local sincronizada com a API da Assembleia da República</div></div>
    <button class="btn" onclick="toast('Sincronização com o RTRI concluída (demonstração).','success')">${svg(I.refresh)} Sincronizar</button>
  </div>
  <div class="alert info"><span class="at">Degradação graciosa</span>O RTRI é a única dependência externa crítica. Se a API da Assembleia estiver indisponível, o ponto focal insere a entidade manualmente com flag de validação pendente — a operação nunca fica bloqueada por falha externa.</div>
  <div class="card">
    <table class="tbl"><thead><tr><th>N.º RTRI</th><th>Designação</th><th>Natureza</th><th>Estado</th></tr></thead><tbody>
    ${RTRI_ENTIDADES.map(e=>`<tr><td class="mono"><strong>${e.rtri_id}</strong></td><td>${esc(e.designacao)}</td><td>${esc(e.natureza)}</td><td><span class="rtri-pill">✓ Ativo</span></td></tr>`).join('')}
    </tbody></table>
  </div>`;
}

/* ---------- AUDITORIA QA (SGGOV) ---------- */
function viewAuditoria() {
  const auds = [...DB.auditorias].sort((a,b)=>(b.data||'').localeCompare(a.data||''));
  const media = auds.length?Math.round(auds.reduce((s,a)=>s+a.pontuacao,0)/auds.length):0;
  return `
  <div class="page-head">
    <div><div class="pt">Auditoria por amostra · Bloco G</div><div class="ps">Controlo de qualidade das FPL — pontuação 0–100 e pedidos de correção</div></div>
  </div>
  <div class="kpis">
    <div class="kpi"><div class="l">Auditorias</div><div class="v">${auds.length}</div></div>
    <div class="kpi"><div class="l">Pontuação média</div><div class="v" style="color:${media>=80?'var(--green)':'var(--warning)'}">${media}</div><div class="d">meta ≥ 80</div></div>
    <div class="kpi"><div class="l">Correções pendentes</div><div class="v" style="color:var(--warning)">${auds.filter(a=>a.pedido_correcao&&a.estado_correcao!=='CONCLUIDA').length}</div></div>
    <div class="kpi"><div class="l">FPL auditáveis</div><div class="v">${DB.fpls.filter(f=>f.m1).length}</div><div class="d">com M1 validado</div></div>
  </div>
  <div class="card">
    <div class="card-h"><div><h3>Auditorias realizadas</h3></div><button class="btn primary sm" onclick="modalNovaAuditoria()">${svg(I.plus)} Nova auditoria</button></div>
    <table class="tbl"><thead><tr><th>FPL</th><th>Auditor</th><th>Data</th><th>Pontuação</th><th>Estado</th></tr></thead><tbody>
    ${auds.map(a=>{const f=getFpl(a.fpl_id);return `
      <tr class="clickable" onclick="go('detalhe',{fplId:'${a.fpl_id}',tab:'G'})">
        <td><strong>${f?esc(f.numero):'—'}</strong> <span class="muted small">${f?esc(f.titulo_curto||''):''}</span></td>
        <td>${esc(a.auditor)}</td><td class="cel-num">${fmtD(a.data)}</td>
        <td><strong style="color:${a.pontuacao>=80?'var(--green)':'var(--warning)'}">${a.pontuacao}/100</strong></td>
        <td>${a.pedido_correcao&&a.estado_correcao!=='CONCLUIDA'?'<span class="badge revisao">Correção pedida</span>':'<span class="badge aprovado">Sem correções</span>'}</td>
      </tr>`;}).join('')}
    </tbody></table>
  </div>`;
}
window.modalNovaAuditoria = () => {
  const auditaveis = DB.fpls.filter(f=>f.m1);
  openModal(`<div class="modal-h"><h3>Nova auditoria de qualidade</h3><button class="x-btn" onclick="closeModal()">✕</button></div>
  <div class="modal-b">
    <div class="field"><label>FPL a auditar</label><select id="au-fpl">${auditaveis.map(f=>`<option value="${f.id}">${esc(f.numero)} — ${esc(f.titulo_curto||'')}</option>`).join('')}</select></div>
    <div class="field mt-16"><label>Pontuação de completude (0–100)</label><input type="number" id="au-pont" min="0" max="100" value="85"></div>
    <div class="field mt-16"><label>Observações</label><textarea id="au-obs" placeholder="Avaliação da completude e fundamentação..."></textarea></div>
    <div class="field mt-16"><label><input type="checkbox" id="au-corr"> Pedir correção ao ponto focal</label></div>
  </div>
  <div class="modal-f"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn primary" onclick="salvarAuditoria()">Registar auditoria</button></div>`);
};
window.salvarAuditoria = () => {
  const fpl_id = document.getElementById('au-fpl').value;
  const pont = parseInt(document.getElementById('au-pont').value,10)||0;
  const obs = document.getElementById('au-obs').value.trim();
  const corr = document.getElementById('au-corr').checked;
  const f = getFpl(fpl_id);
  DB.auditorias.unshift({id:uuid(),fpl_id,auditor:S.user.nome,data:nowISO(),pontuacao:pont,observacoes:obs,pedido_correcao:corr?1:0,estado_correcao:corr?'PENDENTE':'CONCLUIDA'});
  if (corr && f) { f.estado='EM_REVISAO_QA'; notificar(f.criado_por,'QA','Pedido de correção — '+f.numero,'A SGGOV pediu a correção da FPL.',f.id); }
  save(); closeModal(); toast('Auditoria registada.','success'); render();
};

/* ---------- NOVA FPL ---------- */
function viewNova() {
  return `
  <div class="page-head"><div><div class="pt">Nova FPL</div><div class="ps">Preencha o Bloco A (identificação) e o Bloco B (origem). Validar M0 inicia o ciclo de vida.</div></div></div>
  <form id="form-nova">
    <div class="bloco">
      <div class="bloco-h"><div class="tt"><span class="letra">A</span><div><h4>Bloco A · Identificação</h4></div></div></div>
      <div class="bloco-b"><div class="field-grid">
        <div class="field"><label>Tipo de diploma *</label><select name="tipo">${Object.entries(TIPOS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div>
        <div class="field"><label>Área governativa proponente</label><div class="v">${gab(S.user.gabinete).nome}</div></div>
        <div class="field full"><label>Título do diploma *</label><input type="text" name="titulo" required placeholder="Decreto-Lei que aprova..."></div>
        <div class="field full"><label>Título curto (para listagens)</label><input type="text" name="titulo_curto" placeholder="Ex.: Comunidades de energia renovável"></div>
      </div></div>
    </div>
    <div class="bloco">
      <div class="bloco-h"><div class="tt"><span class="letra">B</span><div><h4>Bloco B · Origem e motivação</h4></div></div></div>
      <div class="bloco-b"><div class="field-grid">
        <div class="field"><label>Tipo de origem *</label><select name="origem">${Object.entries(ORIGENS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div>
        <div class="field"><label>Referência da origem</label><input type="text" name="ref_origem" placeholder="Ex.: Diretiva (UE) 2024/884"></div>
        <div class="field full"><label>Síntese do problema e solução * <span class="help">(mínimo ${LIM.SINTESE_B} caracteres — exigido para validar M0)</span></label>
          <textarea name="sintese" rows="6" placeholder="Descreva o problema que o diploma visa resolver e a solução proposta..."></textarea>
          <div class="help" id="cont-sintese">0 caracteres</div>
        </div>
        <div class="field"><label>Avaliação prévia de impacto</label><select name="avaliacao_previa"><option value="">Não indicada</option><option value="1">Sim</option><option value="0">Não</option></select></div>
      </div></div>
    </div>
    <div class="flex gap-12 mt-16" style="justify-content:flex-end">
      <button type="button" class="btn" onclick="go('lista')">Cancelar</button>
      <button type="submit" class="btn primary">Criar FPL e tentar validar M0</button>
    </div>
  </form>`;
}
function bindNova() {
  const form = document.getElementById('form-nova');
  if (!form) return;
  const ta = form.querySelector('[name=sintese]');
  const cont = document.getElementById('cont-sintese');
  ta.addEventListener('input', ()=>{
    const n = ta.value.length;
    cont.textContent = `${n} caracteres ${n>=LIM.SINTESE_B?'✓':`(faltam ${LIM.SINTESE_B-n})`}`;
    cont.className = 'help '+(n>=LIM.SINTESE_B?'ok':'bad');
  });
  form.addEventListener('submit', e=>{
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form).entries());
    const sigla = gab(S.user.gabinete).sigla;
    const ano = 2026;
    const numero = `${ano}/${sigla}/${String(DB.seq++).padStart(4,'0')}`;
    const f = {
      id:uuid(), numero, tipo:d.tipo, gabinete:S.user.gabinete,
      titulo:d.titulo, titulo_curto:d.titulo_curto||'', estado:'CRIADO',
      origem:d.origem, ref_origem:d.ref_origem||'', sintese:d.sintese||'',
      avaliacao_previa:d.avaliacao_previa===''?null:parseInt(d.avaliacao_previa,10),
      criado_por:S.user.id, criado_em:nowISO(),
      m0:null,m1:null,m2:null,m3:null,m4:null,m5:null,ref_dr:null,
      bloco_c:[],bloco_d:[],comprovativos:[],
      versoes:[{n:1,ts:nowISO(),autor:S.user.nome,marco:null,desc:'FPL criada'}],
    };
    DB.fpls.unshift(f); save();
    toast('FPL '+numero+' criada.','success');
    // tentar M0
    const v = validarMarco(f,'M0');
    if (v.ok) { aplicarMarco(f,'M0'); }
    else { toast('M0 não validado: '+v.pend[0].d,'warning'); }
    go('detalhe',{fplId:f.id});
  });
}

/* ---------- DETALHE FPL ---------- */
/* ============ DETALHE — PAINEL + CRONOGRAMA ============
   Substitui a vista de tabs pelo painel do design handoff:
   header com toggle Detalhe/Cronograma, stepper M0-M5, e
   body em grelha de cards ou calendário mensal. */

// Mapeamento marco → card de destino para o stepper navegável.
// Novo desenho: M1 (pré-RSE) fecha o Bloco D antes da RSE; M2/M3 lidam com
// a consulta pública (Bloco E); M4/M5 emitem comprovativo.
const CARD_DO_MARCO_DEMO = {
  M0: 'card-a',
  M1: 'card-d',
  M2: 'card-e',
  M3: 'card-e',
  M4: 'card-cmp',
  M5: 'card-cmp',
};

// ─── Estado colapsado/expandido dos blocos no detalhe da FPL ─────────────
// Persistido por utilizador + FPL em localStorage, com chave separada do
// snapshot DB (LS_KEY) para evitar mistura de preocupações.
const BLOCOS_LETRAS = ['A','B','C','D','E','CMP','F','G'];
function blocosLSKey(uid, fid) { return `fpl-demo-blocos:${uid}:${fid}`; }
function defaultBlocosState(f) {
  const sintLen = f.sintese?.length || 0;
  const bCompleto = sintLen >= LIM.SINTESE_B && !!f.origem;
  const eAtual = f.estado === 'EM_CONSULTA_PUBLICA' || (!f.cl_ref && !f.cl_dispensada);
  const m1Pend = !f.m1;
  const m4Pend = !f.m4 && (f.estado === 'EM_CONSULTA_PUBLICA' || f.estado === 'POS_RSE');
  const fPend = m1Pend || m4Pend;
  const recent = S.recentlyValidated && S.recentlyValidated.fplId === f.id;
  // true = expandido, false = colapsado
  return {
    A: false,
    B: !bCompleto,
    C: false,
    D: true,
    E: eAtual,
    F: fPend,
    G: false,
    CMP: !!recent,
  };
}
function getBlocosState(f) {
  const uid = S.user?.id || 'anon';
  const key = blocosLSKey(uid, f.id);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const stored = JSON.parse(raw);
      // Merge com defaults para garantir que blocos novos têm fallback
      const def = defaultBlocosState(f);
      return { ...def, ...stored };
    }
  } catch {}
  return defaultBlocosState(f);
}
function setBlocosState(f, st) {
  const uid = S.user?.id || 'anon';
  try { localStorage.setItem(blocosLSKey(uid, f.id), JSON.stringify(st)); } catch {}
}
window._toggleBloco = (letra) => {
  const f = getFpl(S.fplId); if (!f) return;
  const st = getBlocosState(f);
  st[letra] = !st[letra];
  setBlocosState(f, st);
  const card = document.getElementById('card-' + letra.toLowerCase());
  if (!card) return;
  const expanded = st[letra];
  card.classList.toggle('collapsed', !expanded);
  const head = card.querySelector('.pc-card-head');
  if (head) head.setAttribute('aria-expanded', String(expanded));
};
window._toggleTodosBlocos = (expandir) => {
  const f = getFpl(S.fplId); if (!f) return;
  const st = {};
  BLOCOS_LETRAS.forEach(L => st[L] = !!expandir);
  setBlocosState(f, st);
  BLOCOS_LETRAS.forEach(L => {
    const card = document.getElementById('card-' + L.toLowerCase());
    if (!card) return;
    card.classList.toggle('collapsed', !expandir);
    const head = card.querySelector('.pc-card-head');
    if (head) head.setAttribute('aria-expanded', String(!!expandir));
  });
};
// Helper de renderização para o cabeçalho colapsável.
// Devolve os atributos a aplicar ao <div class="pc-card"> e o chevron.
function pcCardOpen(letra, extraClass = '') {
  const f = getFpl(S.fplId);
  const st = f ? getBlocosState(f) : defaultBlocosState({estado:''});
  const aberto = !!st[letra];
  const idLow = letra.toLowerCase();
  const cls = `pc-card${aberto ? '' : ' collapsed'}${extraClass ? ' ' + extraClass : ''}`;
  return {
    cardAttrs: `class="${cls}" id="card-${idLow}"`,
    headAttrs: `role="button" tabindex="0" aria-expanded="${aberto}" aria-controls="card-${idLow}-body" data-bloco="${letra}"`,
    bodyId: `card-${idLow}-body`,
    chev: `<span class="pc-chev" aria-hidden="true">▾</span>`,
  };
}

function viewDetalhe() {
  const f = getFpl(S.fplId);
  if (!f) return '<div class="card-empty" style="padding:32px">FPL não encontrada.</div>';
  const vista = (sessionStorage.getItem('fpl.detailView.'+f.id) || 'detalhe');

  return painelHeader(f, vista) + (vista === 'cronograma' ? painelCronograma(f) : painelDetalhe(f));
}

function bindDetalhe() {
  // Toggle Detalhe/Cronograma (sincroniza com hash)
  document.querySelectorAll('.painel-toggle [data-vista]').forEach(b => {
    b.addEventListener('click', () => {
      const v = b.dataset.vista;
      sessionStorage.setItem('fpl.detailView.'+S.fplId, v);
      go('detalhe', { fplId: S.fplId, sub: v });
    });
  });
  // Stepper navegável: scroll-to-card com highlight
  document.querySelectorAll('.painel-step[data-card-target]').forEach(step => {
    const target = step.dataset.cardTarget;
    if (!target) return;
    const ir = () => {
      const el = document.getElementById(target);
      if (!el) return;
      // Se o card de destino estiver colapsado, abre-o primeiro para o utilizador ver o conteúdo
      if (el.classList.contains('collapsed')) {
        const letra = (target.replace('card-','').toUpperCase()) || '';
        if (letra && BLOCOS_LETRAS.includes(letra)) _toggleBloco(letra);
      }
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.remove('highlight');
      void el.offsetWidth;
      el.classList.add('highlight');
      setTimeout(() => el.classList.remove('highlight'), 1300);
    };
    step.addEventListener('click', (e) => {
      if (e.target.closest('.cta')) return; // não interfere com "Validar"
      ir();
    });
    step.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ir(); }
    });
  });
  // Cronograma — navegação mensal
  document.getElementById('cronoPrev')?.addEventListener('click', () => { S.cronoMesOffset = (S.cronoMesOffset||0) - 1; render(); });
  document.getElementById('cronoNext')?.addEventListener('click', () => { S.cronoMesOffset = (S.cronoMesOffset||0) + 1; render(); });
  document.getElementById('cronoHoje')?.addEventListener('click', () => { S.cronoMesOffset = 0; render(); });

  // Blocos colapsáveis — clique no cabeçalho alterna .collapsed; suporte Enter/Space
  document.querySelectorAll('.painel-body .pc-card-head[data-bloco]').forEach(head => {
    const letra = head.dataset.bloco;
    head.addEventListener('click', (e) => {
      // Cliques em botões internos (Editar, +, +Adicionar, more, etc.) não toggleam
      if (e.target.closest('button, a, .pc-mini.clickable')) return;
      _toggleBloco(letra);
    });
    head.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target === head) {
        e.preventDefault();
        _toggleBloco(letra);
      }
    });
  });
}

function bindLista() {
  let timer;
  const inp = document.getElementById('demoListaQ');
  inp?.addEventListener('input', (e) => {
    S.listaQ = e.target.value;
    clearTimeout(timer);
    timer = setTimeout(() => render(), 200);
  });
  document.querySelectorAll('.tbl-sortable th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (S.listaSort.col === col) {
        S.listaSort.dir = S.listaSort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        S.listaSort = { col, dir: 'desc' };
      }
      render();
    });
  });
}
window._demoLimparQ = () => { S.listaQ = ''; render(); };

// Atalhos globais [ / ] na demo para navegar o cronograma
document.addEventListener('keydown', (e) => {
  if (!S.user) return;
  const t = e.target;
  if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
  if (e.key === '[' && S.view === 'detalhe') { S.cronoMesOffset = (S.cronoMesOffset||0) - 1; render(); }
  else if (e.key === ']' && S.view === 'detalhe') { S.cronoMesOffset = (S.cronoMesOffset||0) + 1; render(); }
});

function painelHeader(f, vista) {
  const disp = !!f.cl_dispensada;
  const marcos = [
    {id:'M0',lbl:'Abertura',                                       data:f.m0, bloq:true },
    {id:'M1',lbl:'Pré-RSE',                                        data:f.m1, bloq:true },
    {id:'M2',lbl: disp ? 'Pós-RSE (CP dispensada)' : 'Pós-RSE · Abre CP', data:f.m2, bloq:false},
    {id:'M3',lbl: disp ? 'Encerramento CP (n/a)' : 'Encerramento CP',     data:f.m3, bloq:false, skip:disp},
    {id:'M4',lbl:'Pré-CM',                                         data:f.m4, bloq:true },
    {id:'M5',lbl:'Publicação',                                     data:f.m5, bloq:true },
  ];
  // Se CP dispensada, M3 não é "current" — passa para a próxima etapa
  let curIdx = marcos.findIndex(m=>!m.data && !m.skip);
  marcos.forEach((m,i)=>{
    if (m.skip) m.estado = 'skip';
    else m.estado = m.data ? 'done' : (i===curIdx?'current':'todo');
  });

  const est = ESTADOS[f.estado] || {l:f.estado,c:'criado'};
  const nInter = (f.bloco_d||[]).length;
  const nCmp = (f.comprovativos||[]).length;
  const nVer = (f.versoes||[]).length;
  const cmAprov = !isPublico() && scopeOk(f) && proxMarco(f)==='APROVAR';
  const pm = proxMarco(f);

  return `
  <div class="painel-head">
    <div class="painel-bcrumb">
      <button onclick="go('lista')">FPL</button> / ${esc(f.numero)}
    </div>
    <div class="painel-title-row">
      <h1 class="painel-title">${esc(f.titulo)}</h1>
      <span class="painel-estado s-${esc(est.c)}">● ${esc(est.l)}</span>
    </div>
    <div class="painel-meta">
      <span class="pill-tag">${esc(TIPOS[f.tipo]||f.tipo)}</span>
      <span class="pill-tag">${esc(gab(f.gabinete).sigla)}</span>
      <span>Versão v${nVer} · ${nVer} ${nVer===1?'versão':'versões'}</span>
      <span class="sep">·</span>
      <span>Aberto ${fmtD(f.m0||f.criado_em)}</span>
      <span class="sep">·</span>
      <span>${nInter} ${nInter===1?'interação':'interações'}</span>
      <span class="sep">·</span>
      <span>${nCmp} ${nCmp===1?'comprovativo':'comprovativos'}</span>
      ${cmAprov?`<button class="btn sm primary" onclick="aprovarCM('${f.id}')" style="margin-left:8px">Marcar aprovado em CM</button>`:''}
      ${isSggov()?`<button class="btn sm" onclick="modalNovaAuditoria()" style="margin-left:8px">${svg(I.shield)} Auditar</button>`:''}
      ${f.estado==='PUBLICADO'?`<button class="btn sm" onclick="S.user=PERFIS.find(p=>p.id==='u-cidadao');go('portal-fpl',{fplId:'${f.id}'})" style="margin-left:8px">${svg(I.globe)} Ver no Portal</button>`:''}

      <div class="painel-toggle" role="tablist" aria-label="Vista da FPL">
        <button data-vista="detalhe"    role="tab" aria-selected="${vista==='detalhe'}">${svg(I.list)} Detalhe</button>
        <button data-vista="cronograma" role="tab" aria-selected="${vista==='cronograma'}">${svg(I.bar)} Cronograma</button>
      </div>
      ${vista==='detalhe' ? `<span class="painel-blk-actions" role="group" aria-label="Estado dos blocos">
        <button class="btn sm" onclick="_toggleTodosBlocos(true)" title="Expandir todos os blocos">Expandir todos</button>
        <button class="btn sm" onclick="_toggleTodosBlocos(false)" title="Colapsar todos os blocos">Colapsar todos</button>
      </span>` : ''}
    </div>
    <div class="painel-stepper">
      ${marcos.map(m => `
        <div class="painel-step ${m.estado}" data-card-target="${CARD_DO_MARCO_DEMO[m.id]||''}" role="button" tabindex="0" aria-label="${m.id} ${m.lbl} — ir para a secção">
          <div class="dot">${m.estado==='done'?'✓':m.estado==='skip'?'—':m.id.replace('M','')}</div>
          <div>
            <div class="lbl">${m.id} · ${m.lbl}${m.bloq?'<span class="bloq" aria-hidden="true">bloq.</span>':''}</div>
            <div class="sub">${m.estado==='skip'?'Não aplicável':(m.data?fmtD(m.data):(m.estado==='current'?'a validar agora':'—'))}</div>
            ${m.estado==='current' && !isPublico() && scopeOk(f) && pm && pm!=='APROVAR' ? `<button class="cta" onclick="event.stopPropagation();modalValidarMarco('${f.id}','${m.id}')">Validar ${m.id}</button>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  </div>`;
}

function painelDetalhe(f) {
  return `<div class="painel-body">
    ${pcA(f)}
    ${pcB(f)}
    ${pcD(f)}
    ${pcC(f)}
    ${pcE(f)}
    ${pcCMP(f)}
    ${pcF(f)}
    ${(DB.auditorias.filter(a=>a.fpl_id===f.id).length>0 || isSggov())?pcG(f):''}
  </div>`;
}

function pcA(f) {
  const o = pcCardOpen('A');
  return `<div ${o.cardAttrs}>
    <div class="pc-card-head" ${o.headAttrs}>
      <div class="pc-letter">A</div>
      <div><div class="ttl">Identificação</div><div class="sub">Bloco A</div></div>
      <span class="ok">✓ completo</span>
      ${o.chev}
    </div>
    <div class="pc-card-body" id="${o.bodyId}">
      <div class="pc-kv">
        <div class="k">Tipo</div><div class="v">${esc(TIPOS[f.tipo]||f.tipo)}</div>
        <div class="k">Processo</div><div class="v mono">${esc(f.numero)}</div>
        <div class="k">Gabinete</div><div class="v">${esc(gab(f.gabinete).nome)}</div>
        <div class="k">Criação</div><div class="v">${fmtDH(f.criado_em)}</div>
      </div>
    </div>
  </div>`;
}

function pcB(f) {
  const sintLen = f.sintese?.length || 0;
  const completo = sintLen >= LIM.SINTESE_B && !!f.origem;
  const ed = !isPublico() && scopeOk(f);
  const o = pcCardOpen('B');
  return `<div ${o.cardAttrs}>
    <div class="pc-card-head" ${o.headAttrs}>
      <div class="pc-letter">B</div>
      <div><div class="ttl">Origem e motivação</div><div class="sub">Bloco B</div></div>
      ${completo?'<span class="ok">✓ completo</span>':`<span class="warn">⚠ ${sintLen<LIM.SINTESE_B?'síntese curta':'origem em falta'}</span>`}
      ${ed?`<button class="more" onclick="event.stopPropagation();modalEditarB('${f.id}')">Editar</button>`:''}
      ${o.chev}
    </div>
    <div class="pc-card-body" id="${o.bodyId}">
      <div class="pc-kv">
        <div class="k">Origem</div><div class="v ${!f.origem?'empty':''}">${ORIGENS[f.origem]||'Por preencher'}</div>
        <div class="k">Referência</div><div class="v ${!f.ref_origem?'empty':''}">${esc(f.ref_origem)||'Não aplicável'}</div>
        <div class="k">Aval. impacto</div><div class="v">${f.avaliacao_previa===1?'✓ Sim':f.avaliacao_previa===0?'Não':'<span class="v empty">Não indicada</span>'}</div>
        <div class="k">Síntese</div><div class="v ${!f.sintese?'empty':''}" style="font-size:11.5px;line-height:1.5">${esc((f.sintese||'').slice(0,240))||'Por preencher (mínimo '+LIM.SINTESE_B+' caracteres)'}${sintLen>240?'…':''}</div>
      </div>
    </div>
  </div>`;
}

function pcD(f) {
  const ed = !isPublico() && scopeOk(f);
  const entradas = f.bloco_d || [];
  const total = entradas.length;
  const c = entradas.reduce((a,e)=>{
    if (e.decisao==='INCORPORADA') a.inc++;
    else if (e.decisao==='PARCIALMENTE_INCORPORADA') a.par++;
    else if (e.decisao==='NAO_INCORPORADA') a.nao++;
    else if (e.decisao==='SEM_OBJETO') a.sem++;
    else a.pend++;
    return a;
  }, {inc:0,par:0,nao:0,sem:0,pend:0});
  const visiveis = entradas.slice(0,5);
  const restantes = Math.max(0, total - visiveis.length);

  const o = pcCardOpen('D', 'wide');
  return `<div ${o.cardAttrs}>
    <div class="pc-card-head" ${o.headAttrs}>
      <div class="pc-letter d">D</div>
      <div>
        <div class="ttl">Interações externas — núcleo da pegada</div>
        <div class="sub">Bloco D · Lei n.º 5-A/2026 art.º 4.º</div>
      </div>
      ${c.pend>0?`<span class="warn">⚠ ${c.pend} decisão pendente${c.pend>1?'s':''}</span>`:''}
      <span class="count">${total} entrada${total===1?'':'s'}</span>
      ${ed?`<button class="more" onclick="event.stopPropagation();modalNovaD('${f.id}')" style="margin-left:8px">+ Adicionar</button>`:''}
      ${o.chev}
    </div>
    <div class="pc-card-body" id="${o.bodyId}">
      ${total>0?`
        <div class="pc-bar">
          ${c.inc>0?`<div style="background:var(--p-success);width:${(c.inc/total)*100}%"></div>`:''}
          ${c.par>0?`<div style="background:var(--p-gold);width:${(c.par/total)*100}%"></div>`:''}
          ${c.nao>0?`<div style="background:var(--p-danger);width:${(c.nao/total)*100}%"></div>`:''}
        </div>
        <div class="pc-bar-legend">
          <span><strong style="color:var(--p-success)">${c.inc}</strong> incorporadas</span>
          <span><strong style="color:var(--p-gold)">${c.par}</strong> parciais</span>
          <span><strong style="color:var(--p-danger)">${c.nao}</strong> não incorporada${c.nao===1?'':'s'}</span>
          ${c.sem>0?`<span><strong>${c.sem}</strong> sem objeto</span>`:''}
          ${c.pend>0?`<span style="margin-left:auto"><strong>${c.pend}</strong> pendente${c.pend===1?'':'s'}</span>`:''}
        </div>
        ${visiveis.map(e=>`
          <div class="pc-mini ${ed?'clickable':''}" ${ed?`onclick="modalEditarD('${f.id}','${e.id}')" role="button" tabindex="0" title="Editar entrada" style="cursor:pointer"`:''}>
            <div class="pc-mini-date">${fmtD(e.data)}</div>
            <div>
              <div class="pc-mini-ent">${esc(e.entidade)}</div>
              <div class="pc-mini-sub">${esc(FORMAS[e.forma]||e.forma||'')} · ${e.rtri_id?esc(e.rtri_id):esc(NATUREZAS[e.natureza]||'—')}</div>
            </div>
            <div>
              ${e.decisao
                ? `<span class="pc-dec ${esc(e.decisao)}">${esc(DECISOES[e.decisao])}</span>`
                : `<span class="pc-dec PENDENTE">⚠ Pendente</span>`}
            </div>
          </div>
        `).join('')}
        ${restantes>0?`<button class="pc-more" onclick="modalListaD('${f.id}')">Ver as ${restantes} restantes →</button>`:''}
      `:'<div class="pc-empty">Sem interações externas registadas</div>'}
    </div>
  </div>`;
}

function pcC(f) {
  const ed = !isPublico() && scopeOk(f);
  const lista = f.bloco_c || [];
  const o = pcCardOpen('C');
  return `<div ${o.cardAttrs}>
    <div class="pc-card-head" ${o.headAttrs}>
      <div class="pc-letter">C</div>
      <div><div class="ttl">Contributos internos</div><div class="sub">Bloco C · pareceres formais</div></div>
      <span class="count">${lista.length}</span>
      ${ed?`<button class="more" onclick="event.stopPropagation();modalNovaC('${f.id}')" style="margin-left:8px">+</button>`:''}
      ${o.chev}
    </div>
    <div class="pc-card-body" id="${o.bodyId}">
      ${lista.length===0
        ? '<div class="pc-empty">Sem contributos registados</div>'
        : lista.slice(0,4).map(e=>`
          <div class="pc-mini ${ed?'clickable':''}" ${ed?`onclick="modalEditarC('${f.id}','${e.id}')" role="button" tabindex="0" title="Editar entrada" style="cursor:pointer"`:''}>
            <div class="pc-mini-date">${fmtD(e.data)}</div>
            <div>
              <div class="pc-mini-ent">${esc(e.entidade)}</div>
              <div class="pc-mini-sub">${esc(FORMAS_C[e.forma]||e.forma)}</div>
            </div>
          </div>
        `).join('')}
    </div>
  </div>`;
}

function pcE(f) {
  const ed = !isPublico() && scopeOk(f);
  const tem = !!f.cl_ref;
  const disp = !!f.cl_dispensada;
  const o = pcCardOpen('E');
  return `<div ${o.cardAttrs}>
    <div class="pc-card-head" ${o.headAttrs}>
      <div class="pc-letter">E</div>
      <div><div class="ttl">Consulta pública</div><div class="sub">Bloco E · ConsultaLEX</div></div>
      ${disp ? '<span class="warn cp-dispensada">CP dispensada</span>' : (tem && f.cl_fim ? '<span class="ok">✓ encerrada</span>' : tem ? '<span class="warn">em curso</span>' : '')}
      ${ed?`<button class="more" onclick="event.stopPropagation();modalEditarE('${f.id}')" style="margin-left:8px">Editar</button>`:''}
      ${o.chev}
    </div>
    <div class="pc-card-body" id="${o.bodyId}">
      ${disp ? `
        <div class="pc-kv">
          <div class="k">Estado</div><div class="v"><strong>Dispensada</strong></div>
          <div class="k">Justificação</div><div class="v" style="font-size:11.5px;line-height:1.5">${esc((f.cl_dispensada_justif||'').slice(0,260))}${(f.cl_dispensada_justif||'').length>260?'…':''}</div>
        </div>
      ` : tem?`
        <div class="pc-kv">
          <div class="k">Referência</div><div class="v mono">${esc(f.cl_ref)}</div>
          <div class="k">Período</div><div class="v">${fmtD(f.cl_inicio)} → ${fmtD(f.cl_fim)||'—'}</div>
          <div class="k">Contributos</div><div class="v"><strong>${f.cl_n||0}</strong> recebido${(f.cl_n||0)===1?'':'s'}</div>
        </div>
      `:'<div class="pc-empty">Sem consulta pública registada</div>'}
    </div>
  </div>`;
}

function pcCMP(f) {
  const cmps = f.comprovativos || [];
  const marcos = ['M0','M1','M4','M5'];
  const pendentes = marcos.filter(m=>!cmps.find(c=>c.marco===m));
  const o = pcCardOpen('CMP');
  return `<div ${o.cardAttrs}>
    <div class="pc-card-head" ${o.headAttrs}>
      <div class="pc-letter cmp">⚿</div>
      <div><div class="ttl">Comprovativos</div><div class="sub">JWS Ed25519 · SmartLegis</div></div>
      <span class="count">${cmps.length} / 4</span>
      ${o.chev}
    </div>
    <div class="pc-card-body" id="${o.bodyId}">
      ${cmps.length>0 ? cmps.slice(0,2).map(c=>`
        <div class="pc-mini">
          <div class="pc-mini-date">${fmtD(c.emitido_em)}</div>
          <div>
            <div class="pc-mini-ent">${esc(c.marco)} ✓</div>
            <div class="pc-mini-sub">${esc(c.estado||'VALIDO')}</div>
          </div>
          <button class="pc-dec INCORPORADA" onclick="modalVerComprovativo('${f.id}','${esc(c.jti)}')" style="cursor:pointer;border:none">VER</button>
        </div>
        <div class="pc-sig" title="${esc(c.jti)}">jti: ${esc(c.jti)} · EdDSA<br>${esc((c.jws||'').slice(0,80))}…</div>
      `).join('') : ''}
      ${pendentes.length>0?`<div style="font-size:11.5px;color:var(--p-text-mute);margin-top:8px"><strong>${pendentes.length} pendente${pendentes.length===1?'':'s'}:</strong> ${pendentes.join(', ')}</div>`:''}
    </div>
  </div>`;
}

function pcF(f) {
  const m1 = f.m1 ? '✓ M1 assinada' : 'M1 pendente';
  const m4 = f.m4 ? '✓ M4 assinada' : 'M4 pendente';
  const ok = f.m1 && f.m4;
  const o = pcCardOpen('F');
  return `<div ${o.cardAttrs}>
    <div class="pc-card-head" ${o.headAttrs}>
      <div class="pc-letter f">F</div>
      <div><div class="ttl">Declaração</div><div class="sub">Bloco F · ponto focal</div></div>
      ${ok?'<span class="ok">✓ completas</span>':`<span class="warn">${esc(!f.m1?m1:m4)}</span>`}
      ${o.chev}
    </div>
    <div class="pc-card-body" id="${o.bodyId}">
      <div class="pc-quote">"Confirmo que a presente FPL reflete todas as interações ocorridas no perímetro do diploma e que os campos obrigatórios estão integralmente preenchidos."</div>
      <div style="font-size:11px;color:var(--p-text-mute);margin-top:10px">${m1} · ${m4}</div>
    </div>
  </div>`;
}

function pcG(f) {
  const lista = DB.auditorias.filter(a=>a.fpl_id===f.id);
  const o = pcCardOpen('G');
  return `<div ${o.cardAttrs}>
    <div class="pc-card-head" ${o.headAttrs}>
      <div class="pc-letter h">G</div>
      <div><div class="ttl">Auditoria QA</div><div class="sub">SGGOV · pontuação ${lista[0]?.pontuacao||'—'}/100</div></div>
      <span class="count">${lista.length}</span>
      ${isSggov()?`<button class="more" onclick="event.stopPropagation();modalNovaAuditoria()" style="margin-left:8px">+</button>`:''}
      ${o.chev}
    </div>
    <div class="pc-card-body" id="${o.bodyId}">
      ${lista.length===0
        ? '<div class="pc-empty">Sem auditorias registadas</div>'
        : lista.slice(0,2).map(a=>`
          <div class="pc-mini">
            <div class="pc-mini-date">${fmtD(a.data)}</div>
            <div>
              <div class="pc-mini-ent">${esc(a.auditor)}</div>
              <div class="pc-mini-sub">${a.pedido_correcao?`pedido de correção · ${esc(a.estado_correcao||'PENDENTE')}`:'sem correções'}</div>
            </div>
            <div class="pc-dec ${a.pedido_correcao && a.estado_correcao!=='CONCLUIDA'?'PARCIALMENTE_INCORPORADA':'INCORPORADA'}">${a.pontuacao}</div>
          </div>
        `).join('')}
    </div>
  </div>`;
}

window.modalListaD = (id) => {
  const f = getFpl(id); if (!f) return;
  const todas = f.bloco_d || [];
  const ed = !isPublico() && scopeOk(f);
  openModal(`
    <div class="modal-h"><h3>Bloco D · Interações externas (${todas.length})</h3><button class="x-btn" onclick="closeModal()">✕</button></div>
    <div class="modal-b" style="max-height:65vh;overflow-y:auto">
      ${ed?'<div class="alert info" style="margin-bottom:12px">Clique numa linha para editar ou remover.</div>':''}
      ${todas.map(e=>`
        <div class="pc-mini ${ed?'clickable':''}" ${ed?`onclick="closeModal();modalEditarD('${f.id}','${e.id}')" role="button" tabindex="0" title="Editar entrada" style="padding:10px 0;cursor:pointer"`:'style="padding:10px 0"'}>
          <div class="pc-mini-date">${fmtD(e.data)}</div>
          <div>
            <div class="pc-mini-ent">${esc(e.entidade)}</div>
            <div class="pc-mini-sub">${esc(FORMAS[e.forma]||e.forma||'')} · ${e.rtri_id?esc(e.rtri_id):esc(NATUREZAS[e.natureza]||'—')}</div>
            <div class="pc-mini-sub" style="margin-top:4px">${esc((e.objeto||'').slice(0,200))}</div>
          </div>
          <div>${e.decisao?`<span class="pc-dec ${esc(e.decisao)}">${esc(DECISOES[e.decisao])}</span>`:`<span class="pc-dec PENDENTE">⚠ Pendente</span>`}</div>
        </div>
      `).join('')}
    </div>
    <div class="modal-f"><button class="btn primary" onclick="closeModal()">Fechar</button></div>
  `, true);
};

/* ── Cronograma — calendário mensal + lateral de prazos ── */
function painelCronograma(f) {
  const hoje = new Date();
  const dataAlvo = new Date(hoje.getFullYear(), hoje.getMonth() + (S.cronoMesOffset || 0), 1);
  const ano = dataAlvo.getFullYear();
  const mes = dataAlvo.getMonth();
  const grid = pcGerarGridMes(ano, mes);
  const eventos = pcCompilarEventos(f);
  const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const proximos = pcListarProximos(eventos);
  const isoHoje = pcIsoHoje();

  return `<div class="painel-crono">
    <div class="crono-cal">
      <div class="crono-toolbar">
        <div class="crono-nav">
          <button id="cronoPrev" aria-label="Mês anterior" title="Mês anterior · atalho [">‹</button>
          <button id="cronoHoje" aria-label="Hoje" title="Voltar a hoje" style="width:auto;padding:0 10px;font-size:11px;text-transform:uppercase;letter-spacing:.5px;font-weight:700">Hoje</button>
          <button id="cronoNext" aria-label="Mês seguinte" title="Mês seguinte · atalho ]">›</button>
        </div>
        <div class="crono-title">${meses[mes]} ${ano}</div>
        <div class="crono-legend">
          <span><i style="background:#0a3161"></i>Marcos</span>
          <span><i style="background:#9aa5b6"></i>Interações</span>
          <span><i style="background:#c8102e"></i>RSE / CM</span>
          <span><i style="background:#1a7f3c"></i>Publicação</span>
        </div>
      </div>
      <div class="crono-weekhead">
        ${['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(d=>`<div class="cell">${d}</div>`).join('')}
      </div>
      <div class="crono-grid">
        ${grid.map(d => {
          const evs = eventos.get(d.iso) || [];
          const isToday = d.iso === isoHoje;
          return `<div class="crono-cell ${isToday?'today':''} ${d.dim?'dim':''}">
            <div class="num">${d.dia===1?`${d.dia} ${meses[d.mes].slice(0,3)}`:d.dia}</div>
            ${evs.map(e=>`<button class="crono-ev ${esc(e.k)}" ${e.marco?`onclick="modalValidarMarco('${f.id}','${e.marco}')"`:''} title="${esc(e.lbl)}">${esc(e.lbl)}</button>`).join('')}
          </div>`;
        }).join('')}
      </div>
    </div>
    <aside class="crono-side">
      <div class="crono-side-hdr">Próximos prazos</div>
      ${proximos.length===0
        ? '<div class="pc-empty">Sem prazos próximos.</div>'
        : proximos.map(p=>`
          <div class="crono-up-row">
            <div class="crono-up-date ${p.cor}">
              <div class="month">${p.mes}</div>
              <div class="day">${p.dia}</div>
            </div>
            <div>
              <div class="crono-up-title">${esc(p.titulo)}</div>
              <div class="crono-up-sub">${esc(p.sub)}</div>
              <div style="margin-top:6px">
                <span class="crono-up-tag ${esc(p.tag)}">${esc(p.tag)}</span>
                <span style="font-size:11px;color:var(--p-text-mute)">${esc(p.relativo)}</span>
              </div>
            </div>
          </div>
        `).join('')}
      <div class="crono-side-hdr" style="margin-top:24px">SLA · médias 2026</div>
      <div style="font-size:12px;color:var(--p-text-mute);line-height:1.6">
        M0→M1 mediano: <strong style="color:var(--p-text)">42 dias</strong><br>
        M1→M5 mediano: <strong style="color:var(--p-text)">64 dias</strong><br>
        Esta FPL · M0→hoje: <strong style="color:var(--p-text)">${f.m0?pcDiasDesde(f.m0):'—'} dias</strong>
      </div>
    </aside>
  </div>`;
}

function pcIsoHoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function pcDiasDesde(iso) {
  if (!iso) return '—';
  return Math.max(0, Math.floor((Date.now()-new Date(iso).getTime())/86400000));
}
function pcGerarGridMes(ano, mes) {
  const primeiro = new Date(ano, mes, 1);
  const isoFirst = (primeiro.getDay()+6)%7;
  const inicio = new Date(ano, mes, 1-isoFirst);
  const out = [];
  for (let i=0;i<42;i++) {
    const d = new Date(inicio);
    d.setDate(inicio.getDate()+i);
    out.push({
      dia:d.getDate(), mes:d.getMonth(), ano:d.getFullYear(),
      iso:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
      dim:d.getMonth()!==mes,
    });
  }
  return out;
}
function pcCompilarEventos(f) {
  const m = new Map();
  const add = (iso, evt) => {
    if (!iso) return;
    const k = iso.slice(0,10);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(evt);
  };
  ['M0','M1','M2','M3','M4','M5'].forEach(M => {
    const dt = f[M.toLowerCase()];
    if (dt) add(dt, {k:M, lbl:`${M}${MARCOS_BLOQ.includes(M)?' ⚿':''} validado`, marco:M});
  });
  (f.bloco_d||[]).forEach(e => {
    add(e.data, {k:'INTER', lbl:(e.entidade||'').slice(0,22)+(e.entidade?.length>22?'…':'')});
  });
  if (f.cl_inicio) add(f.cl_inicio, {k:'CP', lbl:'CP · início'});
  if (f.cl_fim)    add(f.cl_fim,    {k:'CP', lbl:'CP · fim'});
  if (f.data_publicacao) add(f.data_publicacao, {k:'DR', lbl:'DR publicado'});
  return m;
}
function pcListarProximos(eventos) {
  const hoje = pcIsoHoje();
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const datas = [...eventos.keys()].filter(d => d >= hoje).sort();
  const out = [];
  for (const iso of datas.slice(0, 5)) {
    const d = new Date(iso);
    const dias = Math.round((d - new Date(hoje))/86400000);
    for (const e of eventos.get(iso)) {
      const cor = e.k==='M1'||e.k==='M4' ? 'gold'
                : e.k==='M5'||e.k==='DR' ? 'green'
                : e.k==='RSE'||e.k==='CM' ? 'red' : 'blue';
      out.push({
        cor,
        mes: dias===0 ? 'Hoje' : meses[d.getMonth()],
        dia: String(d.getDate()).padStart(2,'0'),
        titulo: e.lbl,
        sub: pcDescEvento(e),
        tag: e.k,
        relativo: dias===0?'hoje':dias===1?'amanhã':`em ${dias} dias`,
      });
      if (out.length >= 5) return out;
    }
  }
  return out;
}
function pcDescEvento(e) {
  switch (e.k) {
    case 'M0': return 'Validação bloqueante · abertura';
    case 'M1': return 'Validação bloqueante · pré-RSE';
    case 'M2': return 'Marco informativo · abertura da CP';
    case 'M3': return 'Marco informativo · encerramento da CP';
    case 'M4': return 'Validação bloqueante · pré-CM';
    case 'M5': return 'Validação bloqueante · publicação';
    case 'RSE': return 'Reunião de Secretários de Estado';
    case 'CM':  return 'Conselho de Ministros';
    case 'DR':  return 'Publicação em Diário da República';
    case 'CP':  return 'Período de consulta pública';
    case 'INTER': return 'Interação externa registada';
    default: return '';
  }
}

/* ----- BLOCOS ----- */
function blocoWrap(letra,titulo,sub,corpo,btn,cor) {
  return `<div class="bloco">
    <div class="bloco-h"><div class="tt"><span class="letra" ${cor?`style="background:${cor}"`:''}>${letra}</span><div><h4>${titulo}</h4>${sub?`<div class="sub">${sub}</div>`:''}</div></div>${btn||''}</div>
    <div class="bloco-b">${corpo}</div>
  </div>`;
}
function blocoA(f) {
  return blocoWrap('A','Identificação do projeto','Preenchimento maioritariamente automático',`
    <div class="field-grid">
      <div class="field"><label>Tipo de diploma</label><div class="v">${TIPOS[f.tipo]}</div></div>
      <div class="field"><label>N.º interno de processo</label><div class="v mono">${esc(f.numero)}</div></div>
      <div class="field full"><label>Título</label><div class="v">${esc(f.titulo)}</div></div>
      <div class="field"><label>Área governativa proponente</label><div class="v">${esc(gab(f.gabinete).nome)}</div></div>
      <div class="field"><label>Estado atual</label><div class="v">${badge(f.estado)}</div></div>
      <div class="field"><label>Data de criação</label><div class="v">${fmtDH(f.criado_em)}</div></div>
    </div>`);
}
function blocoB(f) {
  const ed = !isPublico() && scopeOk(f);
  return blocoWrap('B','Origem e motivação','Obrigatório à abertura (M0)',`
    <div class="field-grid">
      <div class="field"><label>Tipo de origem</label><div class="v ${!f.origem?'empty':''}">${ORIGENS[f.origem]||'Por preencher'}</div></div>
      <div class="field"><label>Referência da origem</label><div class="v ${!f.ref_origem?'empty':''}">${esc(f.ref_origem)||'Não aplicável'}</div></div>
      <div class="field full"><label>Síntese do problema e solução</label><div class="v ${!f.sintese?'empty':''}">${esc(f.sintese)||'Por preencher'}</div>
        ${f.sintese?`<div class="help ${f.sintese.length>=LIM.SINTESE_B?'ok':'bad'}">${f.sintese.length} caracteres ${f.sintese.length>=LIM.SINTESE_B?'✓':'— mínimo '+LIM.SINTESE_B}</div>`:''}</div>
      <div class="field"><label>Avaliação prévia de impacto</label><div class="v">${f.avaliacao_previa===1?'✓ Sim':f.avaliacao_previa===0?'Não':'<span class="empty">Não indicada</span>'}</div></div>
    </div>`, ed?`<button class="btn sm" onclick="modalEditarB('${f.id}')">Editar</button>`:'');
}
function blocoC(f) {
  const ed = !isPublico() && scopeOk(f);
  const lista = f.bloco_c||[];
  const corpo = lista.length?lista.map((e,i)=>`
    <div class="entrada" id="ec${i}">
      <div class="entrada-h" onclick="document.getElementById('ec${i}').classList.toggle('open')">
        <div class="info"><span class="e">${esc(e.entidade)}</span><span class="tag">${FORMAS_C[e.forma]||e.forma}</span></div>
        <span class="data">${fmtD(e.data)}${ed?` <button class="btn-icon" aria-label="Editar contributo" title="Editar" onclick="event.stopPropagation();modalEditarC('${f.id}','${e.id}')">${svg(I.edit)}</button>`:''}</span>
      </div>
      <div class="entrada-b">
        <div class="row"><span class="l">Objeto</span><span>${esc(e.objeto)}</span></div>
        <div class="row"><span class="l">Síntese da posição</span><span>${esc(e.sintese)}</span></div>
      </div>
    </div>`).join(''):'<div class="card-empty">Sem contributos internos registados</div>';
  return blocoWrap('C','Contributos internos ao Governo','Pareceres e contributos de áreas governativas e da administração',corpo,
    ed?`<button class="btn primary sm" onclick="modalNovaC('${f.id}')">${svg(I.plus)} Adicionar</button>`:'');
}
function blocoD(f) {
  const ed = !isPublico() && scopeOk(f);
  const lista = f.bloco_d||[];
  const corpo = lista.length?lista.map((e,i)=>`
    <div class="entrada" id="ed${i}">
      <div class="entrada-h" onclick="document.getElementById('ed${i}').classList.toggle('open')">
        <div class="info">
          <span class="e">${esc(e.entidade)}</span>
          <span class="tag">${FORMAS[e.forma]||e.forma}</span>
          ${e.rtri_id?`<span class="rtri-pill">✓ ${esc(e.rtri_id)}</span>`:`<span class="rtri-pill na">${esc(NATUREZAS[e.natureza]||e.natureza)}</span>`}
          ${e.decisao?`<span class="tag" style="background:rgba(15,120,88,.1);color:var(--green);border-color:rgba(15,120,88,.3)">→ ${DECISOES[e.decisao]}</span>`:'<span class="tag" style="background:rgba(163,101,7,.12);color:var(--warning);border-color:rgba(163,101,7,.3)">⚠ decisão pendente</span>'}
        </div>
        <span class="data">${fmtD(e.data)}${ed?` <button class="btn-icon" aria-label="Editar interação" title="Editar" onclick="event.stopPropagation();modalEditarD('${f.id}','${e.id}')">${svg(I.edit)}</button>`:''}</span>
      </div>
      <div class="entrada-b">
        <div class="row"><span class="l">Forma</span><span>${FORMAS[e.forma]||e.forma}</span></div>
        <div class="row"><span class="l">Natureza jurídica</span><span>${NATUREZAS[e.natureza]||e.natureza}</span></div>
        <div class="row"><span class="l">N.º RTRI</span><span>${e.rtri_id?`<span class="mono">${esc(e.rtri_id)}</span> <span class="rtri-pill">✓ validado contra a API da AR</span>`:'<em class="muted">Não aplicável</em>'}</span></div>
        <div class="row"><span class="l">Pelo Governo</span><span>${esc(e.gov)||'—'}</span></div>
        <div class="row"><span class="l">Pela entidade</span><span>${esc(e.interlocutor)||'<em class="muted">Não identificados</em>'}</span></div>
        <div class="row"><span class="l">Objeto</span><span>${esc(e.objeto)}</span></div>
        <div class="row"><span class="l">Síntese da posição</span><span>${esc(e.sintese)}</span></div>
        ${e.decisao?`<div class="divider"></div>
          <div class="row"><span class="l">Decisão de incorporação</span><span><strong>${DECISOES[e.decisao]}</strong></span></div>
          <div class="row"><span class="l">Justificação</span><span>${esc(e.justificacao)}</span></div>`
        :`<div class="alert warning mt-8" style="margin-bottom:0"><span class="at">Decisão pendente</span>Necessário preencher a decisão de incorporação e a justificação antes de validar M1.${ed?` <button class="btn sm" style="margin-top:6px" onclick="modalDecisaoD('${f.id}','${e.id}')">Preencher decisão</button>`:''}</div>`}
      </div>
    </div>`).join(''):'<div class="card-empty">Sem interações externas registadas</div>';
  return blocoWrap('D','Interações externas — núcleo da pegada','Interações com representantes de interesses (Lei n.º 5-A/2026)',corpo,
    ed?`<button class="btn primary sm" onclick="modalNovaD('${f.id}')">${svg(I.plus)} Adicionar interação</button>`:'','var(--red)');
}
function blocoE(f) {
  const ed = !isPublico() && scopeOk(f);
  if (f.cl_dispensada) {
    return blocoWrap('E','Resultado da consulta pública','CP dispensada — fundamentação registada',`
      <div class="alert warning" style="margin-bottom:14px"><span class="at">CP dispensada</span>A consulta pública não foi realizada. A justificação seguinte foi registada no Bloco E e fica vinculada ao comprovativo de M2.</div>
      <div class="field-grid">
        <div class="field full"><label>Justificação da dispensa <span class="help">(mínimo ${LIM.JUSTIF_CP} caracteres)</span></label><div class="v">${esc(f.cl_dispensada_justif)||'Por preencher'}</div>
          ${f.cl_dispensada_justif?`<div class="help ${f.cl_dispensada_justif.length>=LIM.JUSTIF_CP?'ok':'bad'}">${f.cl_dispensada_justif.length} caracteres ${f.cl_dispensada_justif.length>=LIM.JUSTIF_CP?'✓':'— mínimo '+LIM.JUSTIF_CP}</div>`:''}
        </div>
      </div>`, ed?`<button class="btn sm" onclick="modalEditarE('${f.id}')">Editar</button>`:'');
  }
  return blocoWrap('E','Resultado da consulta pública','Importado do Consulta.Lex',`
    <div class="field-grid">
      <div class="field"><label>Referência Consulta.Lex</label><div class="v ${!f.cl_ref?'empty':''}">${esc(f.cl_ref)||'Sem consulta pública'}</div></div>
      <div class="field"><label>Período</label><div class="v">${f.cl_inicio?fmtD(f.cl_inicio)+' a '+fmtD(f.cl_fim):'<span class="empty">—</span>'}</div></div>
      <div class="field"><label>N.º de contributos</label><div class="v">${f.cl_n??'<span class="empty">—</span>'}</div></div>
      <div class="field full"><label>Síntese das principais posições <span class="help">(mínimo ${LIM.SINTESE_E} caracteres)</span></label><div class="v ${!f.cl_sintese?'empty':''}">${esc(f.cl_sintese)||'Por preencher'}</div></div>
      <div class="field full"><label>Decisão sobre incorporação <span class="help">(mínimo ${LIM.DECISAO_E} caracteres)</span></label><div class="v ${!f.cl_decisao?'empty':''}">${esc(f.cl_decisao)||'Por preencher'}</div></div>
    </div>`, ed?`<button class="btn sm" onclick="modalEditarE('${f.id}')">Editar</button>`:'');
}
function blocoF(f) {
  return blocoWrap('F','Declaração do ponto focal','Validação obrigatória nos marcos M1 e M4',`
    <div class="declaracao">"Confirmo que a presente FPL reflete todas as interações ocorridas no perímetro do diploma e que os campos obrigatórios estão integralmente preenchidos."</div>
    <div class="field-grid">
      <div class="field"><label>Declaração M1 (Pré-RSE)</label><div class="v">${f.m1?`✓ Assinada em ${fmtDH(f.m1)}`:'<span class="empty">Pendente</span>'}</div></div>
      <div class="field"><label>Declaração M4 (Pré-CM)</label><div class="v">${f.m4?`✓ Assinada em ${fmtDH(f.m4)}`:'<span class="empty">Pendente</span>'}</div></div>
    </div>
    <div class="alert info mt-16" style="margin-bottom:0"><span class="at">Lembrete legal</span>A submissão de declaração comprovadamente falsa é sujeita ao regime previsto na RCM.</div>`);
}
function blocoCMP(f) {
  const cmps = f.comprovativos||[];
  const marcos = ['M0','M1','M4','M5'];
  const corpo = `
    <div class="alert info"><span class="at">Acoplamento ao SmartLegis</span>Cada marco bloqueante emite um JWS Ed25519 assinado. O ponto focal copia-o para o SmartLegis, que o verifica offline com a chave pública partilhada e bloqueia a tramitação se a verificação falhar.</div>
    ${marcos.map(m=>{
      const c = cmps.find(x=>x.marco===m);
      return `<div class="cmp-row">
        <span class="cmp-mark ${c?'':'pend'}">${m}</span>
        <div style="flex:1">
          <strong>${({M0:'Abertura',M1:'Pré-RSE',M4:'Pré-CM',M5:'Publicação'})[m]}</strong>
          <div class="cmp-jti">${c?esc(c.jti)+' · emitido '+fmtD(c.emitido_em):'Será emitido ao validar '+m}</div>
        </div>
        ${c?`<button class="btn sm" onclick="modalVerComprovativo('${f.id}','${c.jti}')">Ver</button><span class="cmp-badge ${c.estado==='VERIFICADO'?'verif':'valido'}">${c.estado==='VERIFICADO'?'Verificado':'Válido'}</span>`:'<span class="cmp-badge pend">Pendente</span>'}
      </div>`;
    }).join('')}`;
  return blocoWrap('⚿','Comprovativos criptográficos','JWS Ed25519 · verificáveis offline pelo SmartLegis',corpo,'','var(--accent)');
}
function blocoG(f) {
  const auds = DB.auditorias.filter(a=>a.fpl_id===f.id);
  if (!isSggov() && !scopeOk(f)) return blocoWrap('G','Auditoria SGGOV','Bloco interno','<div class="card-empty">Visível apenas para a equipa de QA da SGGOV e para o gabinete proponente.</div>','','var(--ink-4)');
  const corpo = auds.length?auds.map(a=>`
    <div style="padding:14px;border:1px solid var(--line);border-radius:var(--r);margin-bottom:10px">
      <div class="flex ac gap-12 mb-8"><strong style="font-size:1.3rem;color:${a.pontuacao>=80?'var(--green)':'var(--warning)'}">${a.pontuacao}/100</strong>
      <span class="muted small">${esc(a.auditor)} · ${fmtD(a.data)}</span>
      ${a.pedido_correcao?`<span class="badge revisao">${a.estado_correcao==='CONCLUIDA'?'Correção concluída':'Correção pedida'}</span>`:'<span class="badge aprovado">Sem correções</span>'}</div>
      <div class="small">${esc(a.observacoes)||'<em class="muted">Sem observações</em>'}</div>
    </div>`).join(''):'<div class="card-empty">Sem auditorias registadas para esta FPL</div>';
  return blocoWrap('G','Auditoria SGGOV (Bloco G)','Controlo de qualidade por amostra',corpo,
    isSggov()?`<button class="btn primary sm" onclick="modalNovaAuditoria()">${svg(I.plus)} Nova auditoria</button>`:'','var(--ink-4)');
}
function blocoH(f) {
  const v = [...(f.versoes||[])].sort((a,b)=>b.n-a.n);
  const corpo = v.length?`<div class="timeline">${v.map(x=>`
    <div class="tl-item ${x.marco?'marco':''}">
      <div class="ts">${fmtDH(x.ts)} · v${x.n}</div>
      <div class="desc">${x.marco?`<b>${x.marco}</b> · `:''}${esc(x.desc)}</div>
      <div class="who">por ${esc(x.autor)}</div>
    </div>`).join('')}</div>`:'<div class="card-empty">Sem histórico</div>';
  return blocoWrap('H','Histórico de versões e auditoria','Eventos imutáveis',corpo,'','#5e6573');
}

/* ----- AÇÕES DE WORKFLOW ----- */
function novaVersao(f, marco, desc) {
  const n = (f.versoes||[]).reduce((m,v)=>Math.max(m,v.n),0)+1;
  f.versoes.push({n,ts:nowISO(),autor:S.user.nome,marco:marco||null,desc});
}
function aplicarMarco(f, marco) {
  const t = TRANS[marco];
  f[marco.toLowerCase()] = nowISO();
  if (['M0','M1','M4'].includes(marco)) f[marco.toLowerCase()+'_por'] = S.user.id;
  if (['M1','M4'].includes(marco)) f[marco.toLowerCase()+'_decl'] = 1;
  // M2 e M3 são informativos: M2 muda EM_RSE → EM_CONSULTA_PUBLICA (ou POS_RSE
  // se CP dispensada); M3 mantém o estado EM_CONSULTA_PUBLICA até M4.
  const transicionaEstado = marco !== 'M3';
  let destino = t.to;
  if (marco === 'M2' && f.cl_dispensada) destino = 'POS_RSE';
  if (transicionaEstado) f.estado = destino;
  if (marco==='M5') { f.data_publicacao = nowISO(); }
  let cmp = null;
  if (MARCOS_BLOQ.includes(marco)) {
    cmp = emitirComprovativo(f, marco, S.user);
    f.comprovativos.push({jti:cmp.jti,marco,emitido_em:cmp.emitido_em,estado:'VALIDO',jws:cmp.jws});
    // Sinaliza que esta FPL acabou de receber um comprovativo, para abrir o bloco "Comprovativos" no detalhe
    S.recentlyValidated = { fplId: f.id, ts: Date.now() };
  }
  novaVersao(f, marco, `${marco} validado${cmp?' · comprovativo emitido':''}${transicionaEstado?' · estado → '+ESTADOS[destino].l:''}`);
  // notificações
  if (marco==='M1') notificar(f.criado_por,'M1',`FPL ${f.numero} — M1 validado`,'Comprovativo emitido. Aguarda agendamento em RSE.',f.id);
  if (marco==='M4') notificar(f.criado_por,'M4',`FPL ${f.numero} — M4 validado`,'Comprovativo de M4 emitido. Submetida para Conselho de Ministros.',f.id);
  save();
  return cmp;
}
window.aprovarCM = (id) => {
  const f = getFpl(id);
  openModal(`<div class="modal-h"><h3>Marcar como aprovado em Conselho de Ministros</h3><button class="x-btn" onclick="closeModal()">✕</button></div>
  <div class="modal-b">
    <div class="alert info">Na plataforma real, a aprovação em CM é registada pelo GSEPCM. Aqui simula-se esse passo para poder seguir até à publicação (M5).</div>
    <div class="field"><label>Referência do Diário da República</label><input type="text" id="ap-dr" value="DR n.º __/2026, Série I, de __-__-2026"></div>
  </div>
  <div class="modal-f"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn accent" onclick="confirmarAprovarCM('${id}')">Confirmar aprovação</button></div>`);
};
window.confirmarAprovarCM = (id) => {
  const f = getFpl(id);
  f.estado = 'APROVADO';
  f.ref_dr = document.getElementById('ap-dr').value.trim();
  novaVersao(f,null,'Aprovado em Conselho de Ministros · referência DR registada');
  save(); closeModal(); toast('FPL aprovada em CM. Pode agora validar M5.','success'); render();
};

/* ----- MODAL: validar marco ----- */
window.modalValidarMarco = (id, marco) => {
  const f = getFpl(id);
  const v = validarMarco(f, marco);
  const bloq = MARCOS_BLOQ.includes(marco);
  const precisaDecl = ['M1','M4'].includes(marco);
  const lbl = {M0:'Abertura',M1:'submissão para Reunião de Secretários de Estado',M2: (f.cl_dispensada ? 'pós-RSE · CP dispensada' : 'pós-RSE · abertura da consulta pública'),M3:'encerramento da consulta pública',M4:'submissão para Conselho de Ministros',M5:'publicação'}[marco];
  openModal(`
    <div class="modal-h"><h3>Validar Marco ${marco} — ${lbl}</h3><button class="x-btn" onclick="closeModal()">✕</button></div>
    <div class="modal-b">
      ${v.ok?`<div class="alert success"><span class="at">Verificações automáticas cumpridas</span>${precisaDecl?'Falta a sua assinatura da declaração de completude (Bloco F).':'A FPL cumpre todos os requisitos para este marco.'}${bloq?' Ao validar, o sistema emite o comprovativo criptográfico.':''}</div>`
      :`<div class="alert danger"><span class="at">Não é possível validar ${marco} — ${v.pend.length} pendência(s)</span>O sistema impede a validação até resolver as falhas abaixo.${bloq?' Sem validação não há comprovativo — e sem comprovativo o SmartLegis bloqueia a tramitação.':''}</div>`}
      <ul class="checklist">
        ${v.ok?'<li class="ok"><div>Todos os requisitos do marco estão cumpridos</div></li>'
        :v.pend.map(p=>`<li class="bad"><div>${esc(p.d)}</div></li>`).join('')}
      </ul>
      ${precisaDecl?`<div class="declaracao">"Confirmo que a presente FPL reflete todas as interações ocorridas no perímetro do diploma e que os campos obrigatórios estão integralmente preenchidos."</div>`:''}
    </div>
    <div class="modal-f">
      <button class="btn" onclick="closeModal()">${v.ok?'Cancelar':'Voltar e corrigir'}</button>
      ${v.ok?`<button class="btn ${bloq?'primary':'success'}" onclick="confirmarMarco('${id}','${marco}')">${precisaDecl?'Assinar e validar '+marco:'Validar '+marco}</button>`
      :`<button class="btn primary" disabled>${precisaDecl?'Assinar e validar '+marco:'Validar '+marco}</button>`}
    </div>`);
};
window.confirmarMarco = (id, marco) => {
  const f = getFpl(id);
  const v = validarMarco(f, marco);
  if (!v.ok) { toast('Validação falhou.','error'); return; }
  const cmp = aplicarMarco(f, marco);
  if (cmp) { modalVerComprovativoObj(f, cmp, true); }
  else { closeModal(); toast(marco+' validado.','success'); }
  render();
};

/* ----- MODAL: ver comprovativo ----- */
function modalVerComprovativoObj(f, cmp, recemEmitido) {
  const jws = cmp.jws || (b64u({alg:'EdDSA',typ:'fpl-comprovativo+jws',kid:'fpl-2026-01'})+'.'+b64u({iss:'fpl.gov.pt',sub:f.numero,marco:cmp.marco,jti:cmp.jti})+'.'+'k7Qx9aF2bLnQmR4vP8wZ3yT6sN1uH0eK5cB7dG2fXa9JpYrW3M8tL4QvciZoExS');
  const [h,p,s] = jws.split('.');
  openModal(`
    <div class="modal-h"><h3>${recemEmitido?cmp.marco+' validado — comprovativo emitido':'Comprovativo criptográfico · '+cmp.marco}</h3><button class="x-btn" onclick="closeModal()">✕</button></div>
    <div class="modal-b">
      ${recemEmitido?`<div class="alert success"><span class="at">Marco ${cmp.marco} validado</span>O sistema gerou o comprovativo abaixo. Copie-o e cole-o no campo correspondente do SmartLegis.</div>`:''}
      <div class="cmp-code"><span class="h">${h}</span>.<span class="p">${p}</span>.<span class="s">${s}</span></div>
      <div class="cmp-meta"><span><b>Algoritmo</b> EdDSA (Ed25519)</span><span><b>Emissor</b> fpl.gov.pt</span><span><b>Marco</b> ${cmp.marco}</span><span><b>jti</b> ${esc(cmp.jti)}</span><span><b>kid</b> fpl-2026-01</span></div>
      <div class="cmp-flow">
        <div class="node"><div class="ic">${svg(I.doc)}</div><div class="t">FPL</div><div class="d">Emite o JWS assinado</div></div>
        <div class="arrow">copia ▶</div>
        <div class="node"><div class="ic">${svg(I.user)}</div><div class="t">Ponto focal</div><div class="d">Cola no SmartLegis</div></div>
        <div class="arrow">cola ▶</div>
        <div class="node sl"><div class="ic">${svg(I.shield)}</div><div class="t">SmartLegis</div><div class="d">Verifica offline com a chave pública</div></div>
      </div>
      <div class="alert info" style="margin-bottom:0"><span class="at">Verificação offline, sem chamada de rede</span>O SmartLegis valida a assinatura com a chave pública partilhada. Não há integração síncrona entre os sistemas — o handoff é máquina-a-máquina. Sem comprovativo válido, a tramitação fica bloqueada.</div>
    </div>
    <div class="modal-f">
      <button class="btn" onclick="closeModal()">Fechar</button>
      <button class="btn primary" onclick="copiarTexto('${jws}')">Copiar comprovativo</button>
    </div>`, true);
}
window.modalVerComprovativo = (id, jti) => {
  const f = getFpl(id);
  const cmp = (f.comprovativos||[]).find(c=>c.jti===jti);
  if (cmp) modalVerComprovativoObj(f, cmp, false);
};
window.modalFluxoComprovativo = () => {
  modalVerComprovativoObj({numero:'2026/MAEN/0042'}, {marco:'M1',jti:'cmp_M1-9fK2bL7xQw4p'}, false);
};
window.copiarTexto = (t) => {
  try { navigator.clipboard.writeText(t); toast('Comprovativo copiado para a área de transferência.','success'); } catch { toast('Selecione e copie manualmente.','warning'); }
  closeModal();
};

/* ----- MODAIS: editar blocos ----- */
window.modalEditarB = (id) => {
  const f = getFpl(id);
  openModal(`<div class="modal-h"><h3>Editar Bloco B — Origem e motivação</h3><button class="x-btn" onclick="closeModal()">✕</button></div>
  <div class="modal-b"><div class="field-grid">
    <div class="field"><label>Tipo de origem</label><select id="b-origem">${Object.entries(ORIGENS).map(([k,v])=>`<option value="${k}" ${f.origem===k?'selected':''}>${v}</option>`).join('')}</select></div>
    <div class="field"><label>Referência da origem</label><input type="text" id="b-ref" value="${esc(f.ref_origem||'')}"></div>
    <div class="field full"><label>Síntese do problema * <span class="help">(mín. ${LIM.SINTESE_B} caracteres)</span></label><textarea id="b-sintese" rows="6">${esc(f.sintese||'')}</textarea><div class="help" id="b-cont"></div></div>
    <div class="field"><label>Avaliação prévia</label><select id="b-aval"><option value="">—</option><option value="1" ${f.avaliacao_previa===1?'selected':''}>Sim</option><option value="0" ${f.avaliacao_previa===0?'selected':''}>Não</option></select></div>
  </div></div>
  <div class="modal-f"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn primary" onclick="salvarB('${id}')">Guardar</button></div>`);
  const ta = document.getElementById('b-sintese'), c = document.getElementById('b-cont');
  const upd = ()=>{const n=ta.value.length;c.textContent=`${n} caracteres ${n>=LIM.SINTESE_B?'✓':'(mín. '+LIM.SINTESE_B+')'}`;c.className='help '+(n>=LIM.SINTESE_B?'ok':'bad');};
  ta.addEventListener('input',upd); upd();
};
window.salvarB = (id) => {
  const f = getFpl(id);
  f.origem = document.getElementById('b-origem').value;
  f.ref_origem = document.getElementById('b-ref').value.trim();
  f.sintese = document.getElementById('b-sintese').value.trim();
  const av = document.getElementById('b-aval').value;
  f.avaliacao_previa = av===''?null:parseInt(av,10);
  novaVersao(f,null,'Bloco B atualizado'); save(); closeModal(); toast('Bloco B atualizado.','success'); render();
};
window.modalEditarE = (id) => {
  const f = getFpl(id);
  const disp = !!f.cl_dispensada;
  openModal(`<div class="modal-h"><h3>Editar Bloco E — Consulta pública</h3><button class="x-btn" onclick="closeModal()">✕</button></div>
  <div class="modal-b">
    <div class="field" style="margin-bottom:14px">
      <label style="font-weight:600">Estado da consulta pública</label>
      <div class="flex gap-12" style="margin-top:6px">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="radio" name="e-modo" value="realizada" ${!disp?'checked':''}> Realizada</label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="radio" name="e-modo" value="dispensada" ${disp?'checked':''}> Dispensada</label>
      </div>
    </div>
    <div id="e-bloco-realizada" style="${disp?'display:none':''}">
      <div class="field-grid">
        <div class="field"><label>Referência Consulta.Lex</label><input type="text" id="e-ref" value="${esc(f.cl_ref||'')}" placeholder="CL-2026-..."></div>
        <div class="field"><label>N.º de contributos</label><input type="number" id="e-n" value="${f.cl_n??''}"></div>
        <div class="field"><label>Início</label><input type="date" id="e-ini" value="${(f.cl_inicio||'').slice(0,10)}"></div>
        <div class="field"><label>Fim</label><input type="date" id="e-fim" value="${(f.cl_fim||'').slice(0,10)}"></div>
        <div class="field full"><label>Síntese das posições <span class="help">(mín. ${LIM.SINTESE_E} caracteres)</span></label><textarea id="e-sintese" rows="5">${esc(f.cl_sintese||'')}</textarea></div>
        <div class="field full"><label>Decisão sobre incorporação <span class="help">(mín. ${LIM.DECISAO_E} caracteres)</span></label><textarea id="e-decisao" rows="4">${esc(f.cl_decisao||'')}</textarea></div>
      </div>
    </div>
    <div id="e-bloco-dispensada" style="${disp?'':'display:none'}">
      <div class="alert warning" style="margin-bottom:12px"><span class="at">CP dispensada</span>A consulta pública é, em regra, obrigatória. A dispensa deve ser fundamentada (mín. ${LIM.JUSTIF_CP} caracteres) e fica registada no comprovativo de M2.</div>
      <div class="field full"><label>Justificação para dispensar a consulta pública * <span class="help">(mín. ${LIM.JUSTIF_CP} caracteres)</span></label>
        <textarea id="e-disp-just" rows="6" placeholder="Fundamento legal e/ou material da dispensa (ex.: urgência reconhecida, transposição com margem normativa nula, autorização legislativa)...">${esc(f.cl_dispensada_justif||'')}</textarea>
        <div class="help" id="e-disp-cont">0 caracteres</div>
      </div>
    </div>
  </div>
  <div class="modal-f"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn primary" onclick="salvarE('${id}')">Guardar</button></div>`);
  const radios = document.querySelectorAll('input[name=e-modo]');
  const blocoR = document.getElementById('e-bloco-realizada');
  const blocoD = document.getElementById('e-bloco-dispensada');
  radios.forEach(r => r.addEventListener('change', () => {
    const v = document.querySelector('input[name=e-modo]:checked').value;
    blocoR.style.display = v==='realizada' ? '' : 'none';
    blocoD.style.display = v==='dispensada' ? '' : 'none';
  }));
  const ta = document.getElementById('e-disp-just');
  const cont = document.getElementById('e-disp-cont');
  const upd = () => { const n = ta.value.length; cont.textContent = `${n} caracteres ${n>=LIM.JUSTIF_CP?'✓':'(mín. '+LIM.JUSTIF_CP+')'}`; cont.className = 'help '+(n>=LIM.JUSTIF_CP?'ok':'bad'); };
  ta.addEventListener('input', upd); upd();
};
window.salvarE = (id) => {
  const f = getFpl(id);
  const modo = document.querySelector('input[name=e-modo]:checked').value;
  if (modo === 'dispensada') {
    const just = document.getElementById('e-disp-just').value.trim();
    if (just.length < LIM.JUSTIF_CP) { toast(`Justificação da dispensa: mínimo ${LIM.JUSTIF_CP} caracteres (atual ${just.length}).`,'error'); return; }
    f.cl_dispensada = true;
    f.cl_dispensada_justif = just;
    // Limpar campos da CP realizada (preserva os valores, mas marca dispensa)
    novaVersao(f,null,'Bloco E: CP marcada como dispensada · justificação registada');
  } else {
    f.cl_dispensada = false;
    f.cl_dispensada_justif = '';
    f.cl_ref = document.getElementById('e-ref').value.trim();
    const n = document.getElementById('e-n').value; f.cl_n = n===''?null:parseInt(n,10);
    f.cl_inicio = document.getElementById('e-ini').value||null;
    f.cl_fim = document.getElementById('e-fim').value||null;
    f.cl_sintese = document.getElementById('e-sintese').value.trim();
    f.cl_decisao = document.getElementById('e-decisao').value.trim();
    novaVersao(f,null,'Bloco E atualizado');
  }
  save(); closeModal(); toast('Bloco E atualizado.','success'); render();
};
window.modalNovaC = (id) => {
  openModal(`<div class="modal-h"><h3>Nova entrada · Bloco C (contributo interno)</h3><button class="x-btn" onclick="closeModal()">✕</button></div>
  <div class="modal-b"><div class="field-grid">
    <div class="field"><label>Data *</label><input type="date" id="c-data" value="${new Date().toISOString().slice(0,10)}"></div>
    <div class="field"><label>Forma *</label><select id="c-forma">${Object.entries(FORMAS_C).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div>
    <div class="field full"><label>Entidade contactada *</label><input type="text" id="c-ent" placeholder="Ex.: Direção-Geral..."></div>
    <div class="field full"><label>Objeto *</label><input type="text" id="c-obj"></div>
    <div class="field full"><label>Síntese da posição *</label><textarea id="c-sin" rows="4"></textarea></div>
  </div></div>
  <div class="modal-f"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn primary" onclick="salvarC('${id}')">Adicionar</button></div>`);
};
window.salvarC = (id) => {
  const f = getFpl(id);
  const ent = document.getElementById('c-ent').value.trim();
  const obj = document.getElementById('c-obj').value.trim();
  const sin = document.getElementById('c-sin').value.trim();
  if (!ent||!obj||!sin) { toast('Preencha todos os campos obrigatórios.','error'); return; }
  f.bloco_c.push({id:uuid(),data:document.getElementById('c-data').value,forma:document.getElementById('c-forma').value,entidade:ent,cargo:'',objeto:obj,sintese:sin});
  novaVersao(f,null,'Bloco C: adicionada entrada ('+ent+')'); save(); closeModal(); toast('Contributo interno adicionado.','success'); render();
};
window.modalNovaD = (id) => {
  openModal(`<div class="modal-h"><h3>Nova interação externa · Bloco D</h3><button class="x-btn" onclick="closeModal()">✕</button></div>
  <div class="modal-b">
    <div class="alert info" style="margin-bottom:14px">Esta entrada documenta uma interação com um representante de interesses, na aceção da Lei n.º 5-A/2026.</div>
    <div class="field-grid">
      <div class="field"><label>Data *</label><input type="date" id="d-data" value="${new Date().toISOString().slice(0,10)}"></div>
      <div class="field"><label>Forma *</label><select id="d-forma">${Object.entries(FORMAS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div>
      <div class="field full"><label>Pesquisar entidade no RTRI</label>
        <div class="rtri-search"><input type="text" id="d-rtri-q" placeholder="Comece a escrever (ex.: APREN, EDP, CGTP)..." autocomplete="off"><div class="rtri-results" id="d-rtri-res"></div></div>
        <div class="help">Selecione da lista para preencher automaticamente. Para entidades sem RTRI, preencha manualmente.</div>
      </div>
      <div class="field full"><label>Entidade interlocutora *</label><input type="text" id="d-ent"></div>
      <div class="field"><label>N.º RTRI</label><input type="text" id="d-rtri"></div>
      <div class="field"><label>Natureza jurídica *</label><select id="d-nat">${Object.entries(NATUREZAS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div>
      <div class="field full"><label>Pessoas pelo Governo</label><input type="text" id="d-gov" placeholder="Ex.: SE Ambiente; Adjunta SE"></div>
      <div class="field full"><label>Pessoas pela entidade</label><input type="text" id="d-int"></div>
      <div class="field full"><label>Objeto / matéria * <span class="help">(mín. ${LIM.OBJETO_D} caracteres)</span></label><textarea id="d-obj" rows="2"></textarea></div>
      <div class="field full"><label>Síntese da posição * <span class="help">(mín. ${LIM.SINTESE_D} caracteres)</span></label><textarea id="d-sin" rows="4"></textarea></div>
    </div>
    <div class="alert warning mt-16" style="margin-bottom:0"><span class="at">Decisão de incorporação</span>Pode preencher mais tarde, mas é obrigatória antes de validar M1.</div>
  </div>
  <div class="modal-f"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn primary" onclick="salvarD('${id}')">Adicionar interação</button></div>`);
  const q = document.getElementById('d-rtri-q'), res = document.getElementById('d-rtri-res');
  q.addEventListener('input', ()=>{
    const v = q.value.trim().toLowerCase();
    if (v.length<2) { res.classList.remove('open'); return; }
    const hits = RTRI_ENTIDADES.filter(e=>e.designacao.toLowerCase().includes(v)||e.rtri_id.toLowerCase().includes(v)).slice(0,6);
    res.innerHTML = hits.length?hits.map(e=>`<div class="rtri-res" onclick="selRtri('${e.rtri_id}','${esc(e.designacao).replace(/'/g,'&#39;')}')"><div class="rn">${esc(e.designacao)}</div><div class="rd">${e.rtri_id} · ${esc(e.natureza)} · <span style="color:var(--green)">✓ ativo</span></div></div>`).join('')
      :'<div class="rtri-res" style="cursor:default"><div class="rd">Sem resultados — preencha manualmente abaixo</div></div>';
    res.classList.add('open');
  });
  document.addEventListener('click', e=>{ if(!e.target.closest('.rtri-search')) res.classList.remove('open'); });
};
window.selRtri = (rtri, nome) => {
  document.getElementById('d-ent').value = nome;
  document.getElementById('d-rtri').value = rtri;
  document.getElementById('d-nat').value = 'RTRI_INSCRITO';
  document.getElementById('d-rtri-q').value = nome;
  document.getElementById('d-rtri-res').classList.remove('open');
};
window.salvarD = (id) => {
  const f = getFpl(id);
  const g = i => document.getElementById(i).value.trim();
  const ent=g('d-ent'), obj=g('d-obj'), sin=g('d-sin'), nat=g('d-nat'), rtri=g('d-rtri');
  const errs = [];
  if (!ent) errs.push('entidade');
  if (obj.length<LIM.OBJETO_D) errs.push(`objeto (mín. ${LIM.OBJETO_D})`);
  if (sin.length<LIM.SINTESE_D) errs.push(`síntese (mín. ${LIM.SINTESE_D})`);
  if (nat==='RTRI_INSCRITO' && !rtri) errs.push('n.º RTRI obrigatório para entidade inscrita');
  if (errs.length) { toast('Corrija: '+errs.join(', '),'error'); return; }
  f.bloco_d.push({id:uuid(),data:g('d-data'),forma:g('d-forma'),entidade:ent,rtri_id:rtri,natureza:nat,gov:g('d-gov'),interlocutor:g('d-int'),objeto:obj,sintese:sin,decisao:'',justificacao:''});
  novaVersao(f,null,'Bloco D: adicionada interação ('+ent+')'); save(); closeModal(); toast('Interação adicionada ao Bloco D.','success'); render();
};
/* ----- MODAIS: editar / remover entrada do Bloco D ----- */
window.modalEditarD = (fid, eid) => {
  const f = getFpl(fid); if (!f) return;
  const e = (f.bloco_d||[]).find(x=>x.id===eid); if (!e) return;
  const ed = !isPublico() && scopeOk(f);
  if (!ed) return;
  openModal(`<div class="modal-h"><h3>Editar interação · Bloco D</h3><button class="x-btn" onclick="closeModal()">✕</button></div>
  <div class="modal-b">
    <div class="alert info" style="margin-bottom:14px">Edite os campos da interação. Os marcos já validados não são afetados; o histórico é atualizado.</div>
    <div class="field-grid">
      <div class="field"><label>Data *</label><input type="date" id="d-data" value="${esc((e.data||'').slice(0,10))}"></div>
      <div class="field"><label>Forma *</label><select id="d-forma">${Object.entries(FORMAS).map(([k,v])=>`<option value="${k}" ${e.forma===k?'selected':''}>${v}</option>`).join('')}</select></div>
      <div class="field full"><label>Entidade interlocutora *</label><input type="text" id="d-ent" value="${esc(e.entidade||'')}"></div>
      <div class="field"><label>N.º RTRI</label><input type="text" id="d-rtri" value="${esc(e.rtri_id||'')}"></div>
      <div class="field"><label>Natureza jurídica *</label><select id="d-nat">${Object.entries(NATUREZAS).map(([k,v])=>`<option value="${k}" ${e.natureza===k?'selected':''}>${v}</option>`).join('')}</select></div>
      <div class="field full"><label>Pessoas pelo Governo</label><input type="text" id="d-gov" value="${esc(e.gov||'')}"></div>
      <div class="field full"><label>Pessoas pela entidade</label><input type="text" id="d-int" value="${esc(e.interlocutor||'')}"></div>
      <div class="field full"><label>Objeto / matéria * <span class="help">(mín. ${LIM.OBJETO_D} caracteres)</span></label><textarea id="d-obj" rows="2">${esc(e.objeto||'')}</textarea></div>
      <div class="field full"><label>Síntese da posição * <span class="help">(mín. ${LIM.SINTESE_D} caracteres)</span></label><textarea id="d-sin" rows="4">${esc(e.sintese||'')}</textarea></div>
      <div class="field"><label>Decisão de incorporação</label><select id="d-dec"><option value="">— Pendente —</option>${Object.entries(DECISOES).map(([k,v])=>`<option value="${k}" ${e.decisao===k?'selected':''}>${v}</option>`).join('')}</select></div>
      <div class="field full"><label>Justificação da decisão <span class="help">(mín. ${LIM.JUSTIF_D} caracteres se decisão preenchida)</span></label><textarea id="d-just" rows="4">${esc(e.justificacao||'')}</textarea></div>
    </div>
  </div>
  <div class="modal-f">
    <button class="btn danger" onclick="removerD('${fid}','${eid}')" style="margin-right:auto">Remover</button>
    <button class="btn" onclick="closeModal()">Cancelar</button>
    <button class="btn primary" onclick="atualizarD('${fid}','${eid}')">Guardar</button>
  </div>`, true);
};
window.atualizarD = (fid, eid) => {
  const f = getFpl(fid); const e = f.bloco_d.find(x=>x.id===eid); if (!e) return;
  const g = i => document.getElementById(i).value.trim();
  const ent=g('d-ent'), obj=g('d-obj'), sin=g('d-sin'), nat=g('d-nat'), rtri=g('d-rtri'), dec=g('d-dec'), just=g('d-just');
  const errs = [];
  if (!ent) errs.push('entidade');
  if (obj.length<LIM.OBJETO_D) errs.push(`objeto (mín. ${LIM.OBJETO_D})`);
  if (sin.length<LIM.SINTESE_D) errs.push(`síntese (mín. ${LIM.SINTESE_D})`);
  if (nat==='RTRI_INSCRITO' && !rtri) errs.push('n.º RTRI obrigatório para entidade inscrita');
  if (dec && just.length<LIM.JUSTIF_D) errs.push(`justificação (mín. ${LIM.JUSTIF_D}) se a decisão estiver preenchida`);
  if (errs.length) { toast('Corrija: '+errs.join(', '),'error'); return; }
  Object.assign(e, {
    data:g('d-data'), forma:g('d-forma'), entidade:ent, rtri_id:rtri, natureza:nat,
    gov:g('d-gov'), interlocutor:g('d-int'), objeto:obj, sintese:sin,
    decisao:dec, justificacao:just,
  });
  novaVersao(f,null,'Bloco D: entrada atualizada ('+ent+')');
  save(); closeModal(); toast('Entrada atualizada.','success'); render();
};
window.removerD = (fid, eid) => {
  const f = getFpl(fid); const e = (f.bloco_d||[]).find(x=>x.id===eid); if (!e) return;
  confirmAction({
    titulo:'Remover interação externa',
    mensagem:`Remover a interação com "${e.entidade}"? Esta ação não pode ser desfeita.`,
    btnLbl:'Remover',
    action: () => {
      f.bloco_d = f.bloco_d.filter(x=>x.id!==eid);
      novaVersao(f,null,'Bloco D: entrada removida ('+e.entidade+')');
      save(); toast('Entrada removida.','warning'); render();
    },
  });
};

/* ----- MODAIS: editar / remover entrada do Bloco C ----- */
window.modalEditarC = (fid, eid) => {
  const f = getFpl(fid); if (!f) return;
  const e = (f.bloco_c||[]).find(x=>x.id===eid); if (!e) return;
  const ed = !isPublico() && scopeOk(f);
  if (!ed) return;
  openModal(`<div class="modal-h"><h3>Editar contributo · Bloco C</h3><button class="x-btn" onclick="closeModal()">✕</button></div>
  <div class="modal-b"><div class="field-grid">
    <div class="field"><label>Data *</label><input type="date" id="c-data" value="${esc((e.data||'').slice(0,10))}"></div>
    <div class="field"><label>Forma *</label><select id="c-forma">${Object.entries(FORMAS_C).map(([k,v])=>`<option value="${k}" ${e.forma===k?'selected':''}>${v}</option>`).join('')}</select></div>
    <div class="field full"><label>Entidade contactada *</label><input type="text" id="c-ent" value="${esc(e.entidade||'')}"></div>
    <div class="field full"><label>Objeto *</label><input type="text" id="c-obj" value="${esc(e.objeto||'')}"></div>
    <div class="field full"><label>Síntese da posição *</label><textarea id="c-sin" rows="4">${esc(e.sintese||'')}</textarea></div>
  </div></div>
  <div class="modal-f">
    <button class="btn danger" onclick="removerC('${fid}','${eid}')" style="margin-right:auto">Remover</button>
    <button class="btn" onclick="closeModal()">Cancelar</button>
    <button class="btn primary" onclick="atualizarC('${fid}','${eid}')">Guardar</button>
  </div>`);
};
window.atualizarC = (fid, eid) => {
  const f = getFpl(fid); const e = f.bloco_c.find(x=>x.id===eid); if (!e) return;
  const g = i => document.getElementById(i).value.trim();
  const ent = g('c-ent'), obj = g('c-obj'), sin = g('c-sin');
  if (!ent || !obj || !sin) { toast('Preencha todos os campos obrigatórios.','error'); return; }
  Object.assign(e, {
    data:g('c-data'), forma:g('c-forma'), entidade:ent, objeto:obj, sintese:sin,
  });
  novaVersao(f,null,'Bloco C: entrada atualizada ('+ent+')');
  save(); closeModal(); toast('Contributo atualizado.','success'); render();
};
window.removerC = (fid, eid) => {
  const f = getFpl(fid); const e = (f.bloco_c||[]).find(x=>x.id===eid); if (!e) return;
  confirmAction({
    titulo:'Remover contributo interno',
    mensagem:`Remover o contributo de "${e.entidade}"? Esta ação não pode ser desfeita.`,
    btnLbl:'Remover',
    action: () => {
      f.bloco_c = f.bloco_c.filter(x=>x.id!==eid);
      novaVersao(f,null,'Bloco C: entrada removida ('+e.entidade+')');
      save(); toast('Entrada removida.','warning'); render();
    },
  });
};

window.modalDecisaoD = (fid, eid) => {
  const f = getFpl(fid); const e = f.bloco_d.find(x=>x.id===eid);
  openModal(`<div class="modal-h"><h3>Decisão de incorporação</h3><button class="x-btn" onclick="closeModal()">✕</button></div>
  <div class="modal-b">
    <div class="muted small mb-16">${esc(e.entidade)}</div>
    <div class="field"><label>Decisão *</label><select id="dd-dec"><option value="">—</option>${Object.entries(DECISOES).map(([k,v])=>`<option value="${k}" ${e.decisao===k?'selected':''}>${v}</option>`).join('')}</select></div>
    <div class="field mt-16"><label>Justificação sumária * <span class="help">(mín. ${LIM.JUSTIF_D} caracteres)</span></label><textarea id="dd-just" rows="5">${esc(e.justificacao||'')}</textarea></div>
  </div>
  <div class="modal-f"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn primary" onclick="salvarDecisaoD('${fid}','${eid}')">Guardar</button></div>`);
};
window.salvarDecisaoD = (fid, eid) => {
  const f = getFpl(fid); const e = f.bloco_d.find(x=>x.id===eid);
  const dec = document.getElementById('dd-dec').value;
  const just = document.getElementById('dd-just').value.trim();
  if (!dec) { toast('Selecione a decisão.','error'); return; }
  if (just.length<LIM.JUSTIF_D) { toast(`Justificação: mínimo ${LIM.JUSTIF_D} caracteres.`,'error'); return; }
  e.decisao = dec; e.justificacao = just;
  novaVersao(f,null,'Bloco D: decisão de incorporação preenchida ('+e.entidade+')');
  save(); closeModal(); toast('Decisão guardada.','success'); render();
};

/* ---------- PORTAL DO GOVERNO (público) ---------- */
function viewPortal() {
  const pub = DB.fpls.filter(f=>f.estado==='PUBLICADO').sort((a,b)=>(b.data_publicacao||'').localeCompare(a.data_publicacao||''));
  const totalInter = DB.fpls.reduce((s,f)=>s+(f.bloco_d||[]).length,0);
  return `
  <div class="page-head"><div><div class="pt">Pegada Legislativa · Portal do Governo</div>
  <div class="ps">Todas as Fichas de Pegada Legislativa publicadas, ao lado da Agenda Pública dos membros do Governo</div></div></div>
  <div class="card" style="background:linear-gradient(135deg,var(--gov) 0%,var(--gov-dark) 100%);color:#fff;border:none">
    <div class="card-b" style="padding:32px">
      <div class="eyebrow" style="color:var(--accent)">Transparência por construção</div>
      <h2 style="color:#fff;font-size:1.7rem;margin:10px 0">O que o Governo ouviu antes de cada diploma</h2>
      <p style="opacity:.9;max-width:62ch">Após a publicação no Diário da República, a ficha completa de cada diploma — com todas as interações com representantes de interesses e as decisões de incorporação — é exportada da Rede Informática do Governo para este portal. Sem login. Em formatos abertos.</p>
      <div class="flex gap-12 mt-16 wrap">
        <div><div style="font-family:var(--serif);font-size:1.9rem;font-weight:600;color:var(--accent)">${pub.length}</div><div style="font-size:.8rem;opacity:.85">FPL publicadas</div></div>
        <div style="margin-left:24px"><div style="font-family:var(--serif);font-size:1.9rem;font-weight:600;color:var(--accent)">${totalInter}</div><div style="font-size:.8rem;opacity:.85">interações documentadas</div></div>
      </div>
    </div>
  </div>
  <div class="card">
    <div class="card-h"><div><h3>Fichas publicadas</h3></div><button class="btn sm" onclick="go('portal-dataset')">${svg(I.download)} Dados abertos</button></div>
    ${pub.length?pub.map(f=>`
      <div style="padding:18px 18px;border-bottom:1px solid var(--line-2);cursor:pointer" onclick="go('portal-fpl',{fplId:'${f.id}'})">
        <div class="flex ac gap-8 wrap mb-8">${tag(f.tipo)} <span class="muted small">${gab(f.gabinete).sigla}</span> <span class="badge publicado">${esc(f.ref_dr||'Publicado')}</span></div>
        <div style="font-family:var(--serif);font-size:1.1rem;font-weight:600">${esc(f.titulo)}</div>
        <div class="muted small mt-8">${(f.bloco_d||[]).length} interações externas · ${f.cl_n||0} contributos da consulta pública · publicado ${fmtD(f.data_publicacao)}</div>
      </div>`).join(''):'<div class="card-empty">Ainda não há FPL publicadas.</div>'}
  </div>`;
}
function viewPortalFpl() {
  const f = getFpl(S.fplId);
  if (!f || f.estado!=='PUBLICADO') return '<div class="card-empty">Ficha não encontrada ou ainda não publicada.</div>';
  return `
  <div class="fpl-head">
    <div class="crumb"><button onclick="go('portal')">Portal do Governo</button> › ${esc(f.numero)}</div>
    <div class="flex ac gap-8 wrap">${tag(f.tipo)} <span class="badge publicado">${esc(f.ref_dr||'Publicado')}</span></div>
    <h2>${esc(f.titulo)}</h2>
    <div class="meta">
      <div class="mi"><span class="l">Área governativa</span><span class="v">${esc(gab(f.gabinete).nome)}</span></div>
      <div class="mi"><span class="l">Origem</span><span class="v">${ORIGENS[f.origem]||'—'}</span></div>
      <div class="mi"><span class="l">Publicado</span><span class="v">${fmtD(f.data_publicacao)}</span></div>
    </div>
  </div>
  <div class="alert info"><span class="at">Como esta ficha chegou aqui</span>A aplicação FPL, confinada à Rede Informática do Governo, exportou um pacote estruturado após o marco M5. Foi transferido para o Portal do Governo, onde fica acessível ao público ao lado da Agenda Pública dos membros do Governo.</div>
  ${blocoB(f)}
  ${blocoE(f)}
  <div class="bloco">
    <div class="bloco-h"><div class="tt"><span class="letra" style="background:var(--red)">D</span><div><h4>${(f.bloco_d||[]).length} interações com representantes de interesses</h4><div class="sub">Núcleo da pegada</div></div></div></div>
    <table class="tbl"><thead><tr><th>Data</th><th>Entidade</th><th>RTRI</th><th>Forma</th><th>Decisão</th></tr></thead><tbody>
    ${(f.bloco_d||[]).map(d=>`<tr><td class="cel-num">${fmtD(d.data)}</td><td><strong>${esc(d.entidade)}</strong></td><td class="cel-num">${esc(d.rtri_id)||'—'}</td><td>${FORMAS[d.forma]||d.forma}</td><td>${d.decisao?DECISOES[d.decisao]:'—'}</td></tr>`).join('')}
    </tbody></table>
  </div>`;
}
function viewPortalDataset() {
  const pub = DB.fpls.filter(f=>f.estado==='PUBLICADO');
  const dataset = pub.map(f=>({numero:f.numero,tipo:f.tipo,titulo:f.titulo,gabinete:gab(f.gabinete).sigla,publicado:fmtD(f.data_publicacao),ref_dr:f.ref_dr,interacoes:(f.bloco_d||[]).length}));
  return `
  <div class="page-head"><div><div class="pt">Dados abertos</div><div class="ps">Datasets agregados das FPL publicadas — formatos legíveis por máquina</div></div>
  <button class="btn" onclick="go('portal')">← Voltar ao portal</button></div>
  <div class="card">
    <div class="card-h"><h3>Dataset agregado (JSON)</h3><span class="muted small">${pub.length} registos · vocabulário compatível OCDE</span></div>
    <div class="card-b"><div class="cmp-code" style="max-height:340px;overflow:auto">${esc(JSON.stringify(dataset,null,2))}</div></div>
  </div>
  <div class="alert info" style="margin-bottom:0"><span class="at">Formatos disponíveis na plataforma real</span>JSON, CSV e JSON-LD com vocabulário OCDE para <em>legislative footprint</em>. Atualizados a cada publicação. Acessíveis sem autenticação.</div>`;
}

/* ============ INIT ============ */
load();
render();

