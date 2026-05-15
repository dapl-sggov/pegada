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
const MARCOS_BLOQ = ['M0','M3','M4','M5'];
const LIM = {SINTESE_B:200,SINTESE_E:300,DECISAO_E:200,OBJETO_D:50,SINTESE_D:100,JUSTIF_D:100};

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
  {id:'u-ana',   nome:'Ana Santos',    email:'ana.santos@ms.gov.pt',       papel:'PONTO_FOCAL',     gabinete:'ms',    cor:'#0f7858'},
  {id:'u-pedro', nome:'Pedro Lopes',   email:'pedro.lopes@mtsss.gov.pt',   papel:'PONTO_FOCAL',     gabinete:'mtsss', cor:'#7c2d3e'},
  {id:'u-sofia', nome:'Sofia Mendes',  email:'sofia.mendes@meci.gov.pt',   papel:'PONTO_FOCAL',     gabinete:'meci',  cor:'#5e3a8a'},
  {id:'u-luis',  nome:'Luís Tavares',  email:'luis.tavares@mef.gov.pt',    papel:'PONTO_FOCAL',     gabinete:'mef',   cor:'#1a4a3a'},
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
const LS_KEY = 'fpl-demo-v1';
let DB = null;

function seed() {
  const mk = (o) => Object.assign({bloco_c:[],bloco_d:[],versoes:[],comprovativos:[]},o);
  const fpls = [
    mk({
      id:'fpl-001', numero:'2026/MAEN/0042', tipo:'DL', gabinete:'maen',
      titulo:'Decreto-Lei que aprova o regime jurídico da produção descentralizada de energia a partir de fontes renováveis em comunidades de energia',
      titulo_curto:'Comunidades de energia renovável',
      estado:'EM_RSE', origem:'PROGRAMA_GOVERNO', ref_origem:'Programa do Governo, Eixo III, medida 4.2',
      sintese:'O presente diploma estabelece o quadro jurídico para a constituição e funcionamento de comunidades de energia renovável (CER), em conformidade com a Diretiva (UE) 2018/2001 (RED II), criando condições para a participação ativa de cidadãos, autarquias e PME na transição energética. Visa eliminar barreiras administrativas e tarifárias e estabelecer um modelo de partilha de energia produzida em autoconsumo coletivo.',
      avaliacao_previa:1, criado_por:'u-maria', criado_em:'2026-01-10T09:14:00Z',
      cl_ref:'CL-2026-031', cl_inicio:'2026-03-15', cl_fim:'2026-04-14', cl_n:67,
      cl_sintese:'Os 67 contributos manifestam apoio amplo ao regime, com observações focadas em três pontos: regulação tarifária da energia partilhada em autoconsumo coletivo; papel das autarquias na constituição de CER municipais; e tratamento fiscal dos excedentes vendidos à rede pelas pessoas singulares. Receberam-se ainda contributos sobre o regime de partilha de excedentes entre autoconsumidores não-membros de CER.',
      cl_decisao:'Acolheu-se parcialmente a observação sobre regulação tarifária com a reformulação do art. 14.º. Não se acolheu a proposta sobre autarquias por exceder o âmbito do diploma. A questão fiscal foi reencaminhada para o Ministério das Finanças em sede de OE.',
      m0:'2026-01-10T11:32:00Z',m0_por:'u-maria',m1:null,m2:'2026-04-22T11:42:00Z',
      m3:'2026-04-30T16:05:00Z',m3_por:'u-maria',m3_decl:1,m4:null,m5:null,ref_dr:null,
      rse_prevista:'2026-05-22',cm_prevista:'2026-06-05',dr_prevista:'2026-06-26',
      bloco_d:[
        {id:'d1',data:'2026-02-12',forma:'REUNIAO',entidade:'APREN — Associação Portuguesa de Energias Renováveis',rtri_id:'RTRI/2025/00142',natureza:'RTRI_INSCRITO',gov:'Secretária de Estado do Ambiente; Adjunta SE',interlocutor:'Presidente APREN; Director-geral',objeto:'Apresentação de proposta de regime para comunidades de energia renovável e simplificação do licenciamento.',sintese:'A APREN propôs um regime único para CER que abranja autoconsumo coletivo, partilha de energia entre membros e venda de excedentes em mercado, sem distinção entre origem solar ou eólica. Defendeu a simplificação do licenciamento até 1 MW de potência instalada.',decisao:'PARCIALMENTE_INCORPORADA',justificacao:'A proposta de regime único foi acolhida na arquitetura do diploma. Não se acolheu a simplificação até 1 MW por divergir das obrigações de comunicação à ERSE.'},
        {id:'d2',data:'2026-02-19',forma:'VIDEOCONFERENCIA',entidade:'EDP — Energias de Portugal, S.A.',rtri_id:'RTRI/2025/00088',natureza:'RTRI_INSCRITO',gov:'Secretária de Estado do Ambiente; Chefe de gabinete',interlocutor:'Director Regulação; Director Mercado',objeto:'Análise dos efeitos do diploma na operação da rede de distribuição de energia elétrica.',sintese:'A EDP manifestou preocupação com o aumento da complexidade da gestão de fluxos bidirecionais em zonas de elevada penetração solar, propondo um período transitório de 24 meses para adaptação dos sistemas de medição.',decisao:'NAO_INCORPORADA',justificacao:'O período transitório é incompatível com o calendário das metas PNEC 2030. A questão tarifária é da competência regulatória da ERSE e não cabe no presente diploma.'},
        {id:'d3',data:'2026-02-26',forma:'REUNIAO',entidade:'ZERO — Associação Sistema Terrestre Sustentável',rtri_id:'RTRI/2025/00214',natureza:'RTRI_INSCRITO',gov:'Secretária de Estado do Ambiente; Adjunta SE',interlocutor:'Coordenador de Energia; Investigadora',objeto:'Contributos sobre a participação de cidadãos com baixos rendimentos em comunidades de energia.',sintese:'A ZERO propôs um mecanismo de comparticipação para participação de cidadãos em situação de pobreza energética, com financiamento via Fundo Ambiental, e a obrigatoriedade de pelo menos 10% dos membros de CER municipais serem agregados elegíveis.',decisao:'INCORPORADA',justificacao:'O mecanismo de comparticipação foi acolhido no art. 17.º. A obrigatoriedade de 10% foi acolhida no art. 12.º/3 com modulação por dimensão da CER. A avaliação de impacto distributivo foi incluída no RIA.'},
        {id:'d4',data:'2026-03-05',forma:'AUDIENCIA',entidade:'Confederação Geral dos Trabalhadores Portugueses (CGTP)',rtri_id:'RTRI/2025/00027',natureza:'RTRI_INSCRITO',gov:'Secretária de Estado do Ambiente',interlocutor:'Coordenador',objeto:'Posição da CGTP sobre transição energética justa e proteção do emprego na cadeia de valor.',sintese:'A CGTP manifestou apoio ao princípio das comunidades de energia mas questionou a inexistência de cláusulas de proteção de emprego. Solicitou a inclusão de um mecanismo de diálogo social no Conselho Consultivo.',decisao:'PARCIALMENTE_INCORPORADA',justificacao:'A inclusão de representação sindical no Conselho Consultivo foi acolhida no art. 22.º. Não se acolheram cláusulas adicionais por divergir do escopo do diploma.'},
        {id:'d5',data:'2026-03-21',forma:'CORRESPONDENCIA',entidade:'Prof. António Sá da Costa (Universidade de Évora)',rtri_id:'',natureza:'ACADEMIA_PERITO',gov:'Adjunta SE',interlocutor:'',objeto:'Parecer técnico sobre o modelo de cálculo de coeficientes de partilha em autoconsumo coletivo.',sintese:'O parecer propõe um modelo de cálculo dinâmico baseado em consumo histórico ponderado, em alternativa ao modelo estático inicialmente proposto. Apresenta análise comparativa com os modelos italiano e alemão.',decisao:'INCORPORADA',justificacao:'O modelo dinâmico foi acolhido no anexo I, com simplificação de cálculo para CER até 50 membros conforme proposto pelo parecer.'},
        {id:'d6',data:'2026-04-02',forma:'REUNIAO',entidade:'Coopérnico — Cooperativa de Energias Renováveis',rtri_id:'RTRI/2025/00341',natureza:'RTRI_INSCRITO',gov:'Secretária de Estado do Ambiente; Adjunta SE',interlocutor:'Presidente da Direção; Vogal técnico',objeto:'Apresentação do modelo cooperativo de energia renovável e propostas de governação democrática para CER.',sintese:'A Coopérnico defendeu a equiparação plena das cooperativas de energia ao regime das CER, com critérios de governação democrática (um membro/um voto) e limites à concentração de participação. Apresentou estudo comparativo com Espanha e Alemanha.',decisao:'PARCIALMENTE_INCORPORADA',justificacao:'O regime das CER foi alargado para acolher modelos cooperativos sem necessidade de duplicação normativa. Os critérios de governação democrática foram acolhidos no art. 11.º; o limite à concentração foi diferido para portaria.'},
        {id:'d7',data:'2026-04-09',forma:'REUNIAO',entidade:'REN — Redes Energéticas Nacionais',rtri_id:'RTRI/2025/00021',natureza:'RTRI_INSCRITO',gov:'Secretária de Estado do Ambiente; Chefe de gabinete',interlocutor:'Diretor de Sistema; Diretor de Planeamento',objeto:'Análise da capacidade da rede de distribuição face a comunidades de média dimensão.',sintese:'A REN apresentou análise técnica da capacidade da rede em zonas de elevada penetração solar e propôs critérios de prioridade no acesso à rede para CER com componente social.',decisao:null,justificacao:''},
      ],
      bloco_c:[
        {id:'c1',data:'2026-02-08',entidade:'Direção-Geral de Energia e Geologia (DGEG)',cargo:'',forma:'PARECER_ESCRITO',objeto:'Análise técnica do regime',sintese:'A DGEG considera o regime tecnicamente sólido e propôs ajustes a três artigos relativos a procedimentos de comunicação prévia e regimes de exceção para sistemas de pequena escala.'},
        {id:'c2',data:'2026-02-16',entidade:'Entidade Reguladora dos Serviços Energéticos (ERSE)',cargo:'',forma:'PARECER_ESCRITO',objeto:'Análise das implicações regulatórias',sintese:'A ERSE confirma a sua competência regulatória nas matérias tarifárias e propõe coordenação na elaboração das portarias de execução previstas nos arts. 14.º e 18.º.'},
        {id:'c3',data:'2026-02-22',entidade:'Ministério das Finanças (Gabinete SEAF)',cargo:'',forma:'REUNIAO',objeto:'Tratamento fiscal de excedentes',sintese:'Definição do tratamento fiscal aplicável a excedentes de produção: enquadramento em sede de IRS (categoria E) e isenção até 600€/ano por agregado, com reporte ao OE/2027.'},
      ],
      comprovativos:[
        {jti:'cmp_M0-a3F27Kx9bMnQ',marco:'M0',emitido_em:'2026-01-10T11:32:00Z',estado:'VERIFICADO'},
        {jti:'cmp_M3-9fK2bL7xQw4p',marco:'M3',emitido_em:'2026-04-30T16:05:00Z',estado:'VERIFICADO'},
      ],
      versoes:[
        {n:1,ts:'2026-01-10T09:14:00Z',autor:'Maria Silva',marco:null,desc:'FPL criada · Bloco A preenchido'},
        {n:2,ts:'2026-01-10T11:32:00Z',autor:'Maria Silva',marco:'M0',desc:'M0 validado · comprovativo emitido · estado → Em elaboração'},
        {n:8,ts:'2026-04-22T11:42:00Z',autor:'Maria Silva',marco:'M2',desc:'M2 registado · síntese da consulta pública preenchida'},
        {n:13,ts:'2026-04-30T16:05:00Z',autor:'Maria Silva',marco:'M3',desc:'M3 validado · comprovativo emitido · estado → Em RSE'},
      ],
    }),
    mk({
      id:'fpl-002', numero:'2026/MAEN/0049', tipo:'DL', gabinete:'maen',
      titulo:'Decreto-Lei que estabelece o regime de gestão de resíduos de equipamentos elétricos e eletrónicos (transposição da Diretiva (UE) 2024/884)',
      titulo_curto:'Gestão de resíduos de equipamentos elétricos',
      estado:'EM_ELABORACAO', origem:'TRANSPOSICAO_UE', ref_origem:'Diretiva (UE) 2024/884',
      sintese:'O presente diploma transpõe a Diretiva (UE) 2024/884, que estabelece novos limites de recuperação e reciclagem de resíduos de equipamentos elétricos e eletrónicos (REEE), incluindo categorias adicionais introduzidas pela revisão de 2024 e novos requisitos de informação ao consumidor sobre origem e composição material.',
      avaliacao_previa:1, criado_por:'u-maria', criado_em:'2026-04-28T10:00:00Z',
      m0:'2026-04-28T10:00:00Z',m0_por:'u-maria',
      comprovativos:[{jti:'cmp_M0-5kT2yB8nQp1r',marco:'M0',emitido_em:'2026-04-28T10:00:00Z',estado:'VALIDO'}],
      versoes:[
        {n:1,ts:'2026-04-28T09:40:00Z',autor:'Maria Silva',marco:null,desc:'FPL criada'},
        {n:2,ts:'2026-04-28T10:00:00Z',autor:'Maria Silva',marco:'M0',desc:'M0 validado · comprovativo emitido'},
      ],
    }),
    mk({
      id:'fpl-003', numero:'2026/MS/0011', tipo:'DL', gabinete:'ms',
      titulo:'Decreto-Lei que aprova o regime de partilha de dados de saúde para fins de investigação científica',
      titulo_curto:'Partilha de dados de saúde para investigação',
      estado:'EM_CONSULTA_PUBLICA', origem:'INICIATIVA_MINISTERIO', ref_origem:'',
      sintese:'Estabelece o quadro jurídico para a partilha de dados pseudonimizados do Serviço Nacional de Saúde para fins de investigação científica, com salvaguardas específicas para categorias especiais de dados nos termos do RGPD e mecanismos de governação por comité de acesso multidisciplinar.',
      avaliacao_previa:1, criado_por:'u-ana', criado_em:'2026-02-15T10:00:00Z',
      cl_ref:'CL-2026-024', cl_inicio:'2026-04-20', cl_fim:'2026-05-20', cl_n:23,
      m0:'2026-02-15T10:00:00Z',m0_por:'u-ana',m1:'2026-04-15T10:00:00Z',
      bloco_d:[
        {id:'d1',data:'2026-03-10',forma:'REUNIAO',entidade:'Ordem dos Médicos',rtri_id:'RTRI/2025/00061',natureza:'RTRI_FORCA_LEI',gov:'SE Saúde; Chefe de gabinete',interlocutor:'Bastonário',objeto:'Posição da Ordem dos Médicos sobre o acesso de investigadores a dados clínicos pseudonimizados.',sintese:'A Ordem manifestou apoio ao regime mas alertou para a necessidade de garantias adicionais quanto à pseudonimização e à participação de comissões de ética na aprovação de cada projeto de investigação.',decisao:'',justificacao:''},
        {id:'d2',data:'2026-03-18',forma:'AUDIENCIA',entidade:'Conselho Nacional de Ética para as Ciências da Vida',rtri_id:'',natureza:'AUTORIDADE_PUBLICA',gov:'Ministra; SE Saúde',interlocutor:'Presidente',objeto:'Parecer sobre o modelo de governação do regime de partilha de dados de saúde.',sintese:'O CNECV emitiu parecer favorável, sublinhando a importância de um comité de acesso multidisciplinar e a revisão anual do regime.',decisao:'',justificacao:''},
      ],
      comprovativos:[{jti:'cmp_M0-2hX8wK4mLp9q',marco:'M0',emitido_em:'2026-02-15T10:00:00Z',estado:'VERIFICADO'}],
      versoes:[
        {n:1,ts:'2026-02-15T09:30:00Z',autor:'Ana Santos',marco:null,desc:'FPL criada'},
        {n:2,ts:'2026-02-15T10:00:00Z',autor:'Ana Santos',marco:'M0',desc:'M0 validado · comprovativo emitido'},
        {n:5,ts:'2026-04-15T10:00:00Z',autor:'Ana Santos',marco:'M1',desc:'M1 registado · abertura de consulta pública'},
      ],
    }),
    mk({
      id:'fpl-004', numero:'2026/MTSSS/0007', tipo:'PL', gabinete:'mtsss',
      titulo:'Proposta de Lei que altera o Código do Trabalho em matéria de teletrabalho e direito à desconexão',
      titulo_curto:'Teletrabalho e direito à desconexão',
      estado:'EM_CM', origem:'PROGRAMA_GOVERNO', ref_origem:'Programa do Governo, Eixo II',
      sintese:'A presente proposta de lei revê o regime do teletrabalho no Código do Trabalho, consagrando o direito à desconexão profissional, clarificando a repartição de custos e estabelecendo um regime supletivo modulável por instrumento de regulamentação coletiva de trabalho.',
      avaliacao_previa:1, criado_por:'u-pedro', criado_em:'2026-01-08T10:00:00Z',
      cl_ref:'CL-2026-018', cl_inicio:'2026-02-01', cl_fim:'2026-03-03', cl_n:142,
      cl_sintese:'Os 142 contributos dividem-se entre posições patronais que defendem flexibilidade na definição dos horários de desconexão por acordo coletivo, e posições sindicais que defendem a desconexão como direito imperativo. Várias submissões de trabalhadores individuais sublinham a dificuldade de fiscalização do regime.',
      cl_decisao:'Acolheu-se um regime supletivo modulável por convenção coletiva, equilibrando as posições recolhidas. A fiscalização foi reforçada com a atribuição de competências específicas à ACT.',
      m0:'2026-01-08T10:00:00Z',m0_por:'u-carla',m1:'2026-01-30T10:00:00Z',m2:'2026-03-15T10:00:00Z',
      m3:'2026-04-10T10:00:00Z',m3_por:'u-carla',m3_decl:1,m4:'2026-04-25T10:00:00Z',m4_por:'u-carla',m4_decl:1,
      bloco_d:[
        {id:'d1',data:'2026-01-15',forma:'REUNIAO',entidade:'Confederação da Indústria Portuguesa (CIP)',rtri_id:'RTRI/2025/00018',natureza:'RTRI_INSCRITO',gov:'Ministro; SE Trabalho',interlocutor:'Presidente',objeto:'Posição patronal sobre o regime do teletrabalho e do direito à desconexão.',sintese:'A CIP propôs flexibilidade na definição dos horários de desconexão por acordo coletivo, manifestando preocupação com a rigidez de um regime imperativo único.',decisao:'PARCIALMENTE_INCORPORADA',justificacao:'Acolheu-se a modulação por convenção coletiva, mantendo um patamar mínimo imperativo de proteção. A proposta de flexibilidade total não foi acolhida.'},
        {id:'d2',data:'2026-01-22',forma:'REUNIAO',entidade:'Confederação Geral dos Trabalhadores Portugueses (CGTP)',rtri_id:'RTRI/2025/00027',natureza:'RTRI_INSCRITO',gov:'Ministro',interlocutor:'Coordenador',objeto:'Posição sindical sobre o direito à desconexão.',sintese:'A CGTP defendeu a desconexão como direito imperativo, sem possibilidade de derrogação por contratação coletiva, e o reforço dos meios de fiscalização da ACT.',decisao:'PARCIALMENTE_INCORPORADA',justificacao:'Acolheu-se o reforço da ACT. Não se acolheu a imperatividade absoluta, optando-se por um patamar mínimo com modulação coletiva.'},
        {id:'d3',data:'2026-01-29',forma:'REUNIAO',entidade:'União Geral de Trabalhadores (UGT)',rtri_id:'RTRI/2025/00031',natureza:'RTRI_INSCRITO',gov:'Ministro; SE Trabalho',interlocutor:'Secretário-geral',objeto:'Posição sindical sobre o regime supletivo.',sintese:'A UGT manifestou-se favorável a um regime supletivo modulável por convenção coletiva, próximo da solução final adotada.',decisao:'INCORPORADA',justificacao:'A posição da UGT correspondeu, em larga medida, à arquitetura final do regime supletivo modulável.'},
      ],
      comprovativos:[
        {jti:'cmp_M0-7yR3kP9nQw2m',marco:'M0',emitido_em:'2026-01-08T10:00:00Z',estado:'VERIFICADO'},
        {jti:'cmp_M3-4tH8vB2xLk6p',marco:'M3',emitido_em:'2026-04-10T10:00:00Z',estado:'VERIFICADO'},
        {jti:'cmp_M4-3pR8vN2kHy6t',marco:'M4',emitido_em:'2026-04-25T10:00:00Z',estado:'VERIFICADO'},
      ],
      versoes:[
        {n:1,ts:'2026-01-08T09:30:00Z',autor:'Pedro Lopes',marco:null,desc:'FPL criada'},
        {n:2,ts:'2026-01-08T10:00:00Z',autor:'Pedro Lopes',marco:'M0',desc:'M0 validado · comprovativo emitido'},
        {n:9,ts:'2026-04-10T10:00:00Z',autor:'Pedro Lopes',marco:'M3',desc:'M3 validado · comprovativo emitido'},
        {n:14,ts:'2026-04-25T10:00:00Z',autor:'Pedro Lopes',marco:'M4',desc:'M4 validado · comprovativo emitido · estado → Em CM'},
      ],
    }),
    mk({
      id:'fpl-005', numero:'2025/MJ/0058', tipo:'DL', gabinete:'mj',
      titulo:'Decreto-Lei que aprova o regime jurídico da mediação civil e comercial',
      titulo_curto:'Regime jurídico da mediação civil e comercial',
      estado:'PUBLICADO', origem:'PROGRAMA_GOVERNO', ref_origem:'Programa do Governo, Eixo IV',
      sintese:'O presente diploma consolida e moderniza o quadro normativo da mediação extrajudicial em matérias civis e comerciais, alinhando o regime nacional com as melhores práticas europeias e reforçando o estatuto do mediador certificado e a executoriedade dos acordos de mediação.',
      avaliacao_previa:1, criado_por:'u-carla', criado_em:'2025-09-01T10:00:00Z',
      cl_ref:'CL-2025-211', cl_inicio:'2025-11-01', cl_fim:'2025-12-01', cl_n:34,
      cl_sintese:'Os 34 contributos recebidos incidem sobretudo sobre a certificação de mediadores, a articulação com os julgados de paz e a executoriedade dos acordos. As ordens profissionais manifestaram posições convergentes quanto à exigência de formação certificada.',
      cl_decisao:'Acolheu-se o reforço dos requisitos de certificação e clarificou-se a articulação com os julgados de paz. A executoriedade dos acordos homologados foi consagrada nos termos propostos pela generalidade dos contributos.',
      m0:'2025-09-01T10:00:00Z',m0_por:'u-carla',m1:'2025-10-15T10:00:00Z',m2:'2025-12-20T10:00:00Z',
      m3:'2026-02-10T10:00:00Z',m3_por:'u-carla',m3_decl:1,m4:'2026-03-05T10:00:00Z',m4_por:'u-carla',m4_decl:1,
      m5:'2026-04-22T08:00:00Z',ref_dr:'DR n.º 78/2026, Série I, de 22-04-2026', data_publicacao:'2026-04-22T08:00:00Z',
      bloco_d:[
        {id:'d1',data:'2025-10-02',forma:'REUNIAO',entidade:'Ordem dos Advogados',rtri_id:'',natureza:'RTRI_FORCA_LEI',gov:'SE Justiça',interlocutor:'Bastonária',objeto:'Posição da Ordem dos Advogados sobre o estatuto do mediador e a articulação com o patrocínio judiciário.',sintese:'A Ordem dos Advogados defendeu requisitos de formação certificada equivalentes e a clarificação da articulação entre a mediação e o patrocínio judiciário, evitando sobreposições de competências.',decisao:'INCORPORADA',justificacao:'Os requisitos de formação certificada foram consagrados no art. 9.º. A articulação com o patrocínio judiciário foi clarificada no art. 24.º.'},
        {id:'d2',data:'2025-10-20',forma:'AUDIENCIA',entidade:'Conselho Superior da Magistratura',rtri_id:'',natureza:'AUTORIDADE_PUBLICA',gov:'Ministro; SE Justiça',interlocutor:'Vice-Presidente',objeto:'Parecer sobre a articulação da mediação com a tramitação judicial e a homologação de acordos.',sintese:'O CSM emitiu parecer favorável, recomendando a clarificação do regime de homologação judicial dos acordos de mediação e a sua executoriedade.',decisao:'INCORPORADA',justificacao:'O regime de homologação e a executoriedade dos acordos foram consagrados nos termos recomendados pelo CSM.'},
      ],
      comprovativos:[
        {jti:'cmp_M0-9wQ2xK7nLp4m',marco:'M0',emitido_em:'2025-09-01T10:00:00Z',estado:'VERIFICADO'},
        {jti:'cmp_M3-2bH7vN9kLx3p',marco:'M3',emitido_em:'2026-02-10T10:00:00Z',estado:'VERIFICADO'},
        {jti:'cmp_M4-5tR3kP8nQy7m',marco:'M4',emitido_em:'2026-03-05T10:00:00Z',estado:'VERIFICADO'},
        {jti:'cmp_M5-7wQx1aF9bL3m',marco:'M5',emitido_em:'2026-04-22T08:00:00Z',estado:'VERIFICADO'},
      ],
      versoes:[
        {n:1,ts:'2025-09-01T09:30:00Z',autor:'Carla Almeida',marco:null,desc:'FPL criada'},
        {n:2,ts:'2025-09-01T10:00:00Z',autor:'Carla Almeida',marco:'M0',desc:'M0 validado · comprovativo emitido'},
        {n:11,ts:'2026-02-10T10:00:00Z',autor:'Carla Almeida',marco:'M3',desc:'M3 validado · comprovativo emitido'},
        {n:15,ts:'2026-03-05T10:00:00Z',autor:'Carla Almeida',marco:'M4',desc:'M4 validado · comprovativo emitido'},
        {n:16,ts:'2026-04-22T08:00:00Z',autor:'Carla Almeida',marco:'M5',desc:'M5 validado · comprovativo emitido · FPL exportada para o Portal do Governo'},
      ],
    }),
    // ── Adicionais (v1.2) — cobrem outros gabinetes e estados raros ──
    mk({
      id:'fpl-006', numero:'2026/MECT/0023', tipo:'DL', gabinete:'mect',
      titulo:'Decreto-Lei que estabelece o regime jurídico das sandboxes regulatórias para tecnologia financeira e cripto-ativos',
      titulo_curto:'Sandboxes para tecnologia financeira',
      estado:'EM_CONSULTA_INTERNA', origem:'INICIATIVA_MINISTERIO', ref_origem:'Programa do Governo, Eixo IV, medida 7.1',
      sintese:'O presente diploma cria um quadro experimental de regulação flexível (sandbox) para empresas de tecnologia financeira e prestadores de serviços em cripto-ativos, em coordenação com o Banco de Portugal, a CMVM e a ASF. Permite testar produtos inovadores em ambiente controlado, com derrogações específicas e supervisão acrescida.',
      avaliacao_previa:1, criado_por:'u-joao', criado_em:'2026-03-20T10:00:00Z',
      m0:'2026-03-20T11:00:00Z',m0_por:'u-joao',
      cm_prevista:'2026-07-10',
      bloco_c:[
        {id:'c1',data:'2026-04-05',entidade:'Banco de Portugal',forma:'PARECER_ESCRITO',objeto:'Coordenação com regulador financeiro',sintese:'O BdP confirma a sua disponibilidade para participar na sandbox, sublinhando a necessidade de critérios objetivos para a seleção de candidatos e a salvaguarda das obrigações de prevenção do branqueamento.'},
        {id:'c2',data:'2026-04-12',entidade:'CMVM',forma:'PARECER_ESCRITO',objeto:'Coordenação com regulador de valores mobiliários',sintese:'A CMVM defende a articulação obrigatória com o regime europeu MiCA na fase de avaliação prévia de cada candidatura, evitando regimes paralelos.'},
      ],
      bloco_d:[
        {id:'d1',data:'2026-04-08',forma:'REUNIAO',entidade:'Portugal Fintech',rtri_id:'',natureza:'OUTRA',gov:'Secretário de Estado da Economia; Adjunto SE',interlocutor:'Presidente; Diretor executivo',objeto:'Apresentação das prioridades do ecossistema fintech para o regime de sandbox.',sintese:'A Portugal Fintech defendeu critérios menos restritivos para a entrada na sandbox e prazos máximos de 6 meses para decisão sobre candidaturas. Apresentou comparativo com sandboxes do Reino Unido e Lituânia.',decisao:null,justificacao:''},
        {id:'d2',data:'2026-04-15',forma:'VIDEOCONFERENCIA',entidade:'Confederação da Indústria Portuguesa (CIP)',rtri_id:'RTRI/2025/00018',natureza:'RTRI_INSCRITO',gov:'Secretário de Estado da Economia',interlocutor:'Coordenador área digital',objeto:'Posição patronal sobre o regime de sandbox e proteção do consumidor.',sintese:'A CIP defendeu a sandbox como mecanismo de competitividade do mercado nacional mas pediu salvaguardas robustas de proteção do consumidor e mecanismos de saída ordeira do ambiente experimental.',decisao:null,justificacao:''},
      ],
      comprovativos:[{jti:'cmp_M0-8nF2kQ7pLx9m',marco:'M0',emitido_em:'2026-03-20T11:00:00Z',estado:'VERIFICADO'}],
      versoes:[
        {n:1,ts:'2026-03-20T10:00:00Z',autor:'João Pereira',marco:null,desc:'FPL criada'},
        {n:2,ts:'2026-03-20T11:00:00Z',autor:'João Pereira',marco:'M0',desc:'M0 validado · comprovativo emitido'},
        {n:3,ts:'2026-04-08T15:00:00Z',autor:'João Pereira',marco:null,desc:'Bloco D: Portugal Fintech adicionada'},
      ],
    }),
    mk({
      id:'fpl-007', numero:'2026/MEF/0014', tipo:'DL', gabinete:'mef',
      titulo:'Decreto-Lei que atualiza o regime fiscal aplicável aos rendimentos prediais e às mais-valias imobiliárias',
      titulo_curto:'Atualização do regime fiscal predial',
      estado:'APROVADO', origem:'INICIATIVA_MINISTERIO', ref_origem:'OE/2026 art. 235.º',
      sintese:'O presente decreto-lei executa o regime fiscal autorizado pelo art. 235.º da Lei do OE/2026, atualizando as taxas autónomas aplicáveis aos rendimentos prediais e introduzindo um regime de exclusão tributária parcial para mais-valias provenientes da venda de habitação própria reinvestida em arrendamento acessível.',
      avaliacao_previa:1, criado_por:'u-luis', criado_em:'2026-02-01T10:00:00Z',
      cl_ref:'CL-2026-019', cl_inicio:'2026-02-20', cl_fim:'2026-03-22', cl_n:89,
      cl_sintese:'Os 89 contributos repartem-se entre proprietários particulares (que pedem alargamento das exclusões), associações de inquilinos (que defendem a exclusão condicionada à colocação em arrendamento acessível) e fiscalistas (sublinhando a complexidade do regime de excecção). A maioria apoia o princípio mas pede simplificação.',
      cl_decisao:'Reformulou-se o art. 7.º para simplificar o regime de exclusão, mantendo o condicionamento ao arrendamento acessível como proposto pelas associações de inquilinos. Não se acolheu o alargamento generalizado das exclusões por razões de neutralidade fiscal.',
      m0:'2026-02-01T11:00:00Z',m0_por:'u-carla',m1:'2026-02-18T09:00:00Z',m2:'2026-03-25T17:00:00Z',
      m3:'2026-04-02T11:00:00Z',m3_por:'u-carla',m3_decl:1,m4:'2026-04-18T15:00:00Z',m4_por:'u-carla',m4_decl:1,
      dr_prevista:'2026-05-25',
      bloco_d:[
        {id:'d1',data:'2026-02-15',forma:'REUNIAO',entidade:'Associação Portuguesa de Bancos (APB)',rtri_id:'RTRI/2025/00482',natureza:'RTRI_INSCRITO',gov:'Secretário de Estado dos Assuntos Fiscais',interlocutor:'Secretário-geral',objeto:'Impacto do regime no crédito hipotecário e na avaliação fiscal de garantias.',sintese:'A APB apresentou análise sobre o efeito do regime na avaliação patrimonial das garantias hipotecárias e propôs ajustamentos na fase de execução fiscal de bens reinvestidos.',decisao:'PARCIALMENTE_INCORPORADA',justificacao:'A clarificação sobre execução fiscal foi acolhida no art. 12.º. A proposta de regime transitório alargado não foi acolhida por razões de previsibilidade orçamental.'},
        {id:'d2',data:'2026-03-04',forma:'AUDIENCIA',entidade:'Associação dos Inquilinos Lisbonenses',rtri_id:'',natureza:'OUTRA',gov:'Ministro das Finanças; SE Assuntos Fiscais',interlocutor:'Direção',objeto:'Posição sobre o condicionamento da exclusão tributária à colocação no mercado de arrendamento.',sintese:'A AIL defendeu o reforço das condições de elegibilidade para o regime de arrendamento acessível, evitando que a exclusão beneficie habitação devoluta ou alojamento turístico.',decisao:'INCORPORADA',justificacao:'Reforçaram-se os critérios de elegibilidade no art. 9.º com referência ao conceito legal de "arrendamento acessível" da Lei n.º 81/2020.'},
        {id:'d3',data:'2026-03-12',forma:'CORRESPONDENCIA',entidade:'Ordem dos Contabilistas Certificados (OCC)',rtri_id:'',natureza:'RTRI_FORCA_LEI',gov:'SE Assuntos Fiscais',interlocutor:'Bastonário',objeto:'Parecer sobre simplificação do regime para efeitos de declaração fiscal.',sintese:'A OCC alertou para a complexidade do regime, propondo a simplificação da declaração anual e a criação de um simulador na AT para apoiar a aplicação prática.',decisao:'INCORPORADA',justificacao:'A simplificação foi acolhida no art. 6.º e a AT vai disponibilizar simulador no Portal das Finanças.'},
      ],
      comprovativos:[
        {jti:'cmp_M0-1xQ9pK3wLm7n',marco:'M0',emitido_em:'2026-02-01T11:00:00Z',estado:'VERIFICADO'},
        {jti:'cmp_M3-6tR4kP2nQy8z',marco:'M3',emitido_em:'2026-04-02T11:00:00Z',estado:'VERIFICADO'},
        {jti:'cmp_M4-9wH5vB3xLk7p',marco:'M4',emitido_em:'2026-04-18T15:00:00Z',estado:'VERIFICADO'},
      ],
      versoes:[
        {n:1,ts:'2026-02-01T10:00:00Z',autor:'Luís Tavares',marco:null,desc:'FPL criada'},
        {n:2,ts:'2026-02-01T11:00:00Z',autor:'Luís Tavares',marco:'M0',desc:'M0 validado · comprovativo emitido'},
        {n:11,ts:'2026-04-02T11:00:00Z',autor:'Luís Tavares',marco:'M3',desc:'M3 validado · comprovativo emitido'},
        {n:14,ts:'2026-04-18T15:00:00Z',autor:'Luís Tavares',marco:'M4',desc:'M4 validado · estado → Em CM'},
        {n:15,ts:'2026-04-30T16:00:00Z',autor:'Luís Tavares',marco:null,desc:'Aprovado em Conselho de Ministros'},
      ],
    }),
    mk({
      id:'fpl-008', numero:'2026/MAI/0009', tipo:'RCM', gabinete:'mai',
      titulo:'Resolução do Conselho de Ministros que aprova o Plano Nacional de Prevenção e Combate ao Cibercrime 2026–2030',
      titulo_curto:'PNPCC 2026–2030',
      estado:'CRIADO', origem:'INICIATIVA_MINISTERIO', ref_origem:'',
      sintese:'A presente resolução do Conselho de Ministros aprova o Plano Nacional de Prevenção e Combate ao Cibercrime 2026-2030, definindo eixos estratégicos de cooperação entre forças e serviços de segurança, autoridades reguladoras setoriais e o setor privado.',
      avaliacao_previa:0, criado_por:'u-pedro', criado_em:'2026-05-08T14:00:00Z',
      versoes:[
        {n:1,ts:'2026-05-08T14:00:00Z',autor:'Pedro Lopes',marco:null,desc:'FPL criada · aguarda preenchimento do Bloco B antes de validar M0'},
      ],
    }),
    mk({
      id:'fpl-009', numero:'2026/MECI/0017', tipo:'DESPACHO', gabinete:'meci',
      titulo:'Despacho normativo que define o regime de avaliação de centros de investigação para o triénio 2026–2028',
      titulo_curto:'Avaliação de centros de investigação 2026–2028',
      estado:'EM_REVISAO_QA', origem:'PROGRAMA_GOVERNO', ref_origem:'Programa do Governo, Eixo V',
      sintese:'O presente despacho normativo define os critérios, painéis e procedimentos para a avaliação de centros de investigação científica e de unidades de I&D para o período 2026-2028, em articulação com a FCT e os painéis científicos internacionais.',
      avaliacao_previa:1, criado_por:'u-sofia', criado_em:'2026-01-25T11:00:00Z',
      m0:'2026-01-25T12:00:00Z',m0_por:'u-sofia',m1:'2026-02-28T10:00:00Z',
      cl_ref:'CL-2026-022', cl_inicio:'2026-03-10', cl_fim:'2026-04-10', cl_n:208,
      bloco_d:[
        {id:'d1',data:'2026-02-05',forma:'REUNIAO',entidade:'Conselho de Reitores das Universidades Portuguesas (CRUP)',rtri_id:'',natureza:'AUTORIDADE_PUBLICA',gov:'Ministra; SE Ciência',interlocutor:'Presidente; Vice-presidente',objeto:'Discussão dos critérios de avaliação dos centros e unidades de I&D.',sintese:'O CRUP solicitou maior peso da componente colaborativa e da participação em redes europeias na avaliação. Propôs também painéis com avaliadores estrangeiros maioritários.',decisao:null,justificacao:''},
        {id:'d2',data:'2026-02-18',forma:'AUDIENCIA',entidade:'Conselho Coordenador dos Institutos Superiores Politécnicos (CCISP)',rtri_id:'',natureza:'AUTORIDADE_PUBLICA',gov:'SE Ciência',interlocutor:'Presidente',objeto:'Posição sobre critérios diferenciados para o ensino politécnico.',sintese:'O CCISP defendeu critérios de avaliação que valorizem a investigação aplicada e a transferência tecnológica, em distinção da investigação fundamental, para centros associados ao ensino politécnico.',decisao:null,justificacao:''},
      ],
      comprovativos:[{jti:'cmp_M0-3rF8kV2pLn7q',marco:'M0',emitido_em:'2026-01-25T12:00:00Z',estado:'VERIFICADO'}],
      versoes:[
        {n:1,ts:'2026-01-25T11:00:00Z',autor:'Sofia Mendes',marco:null,desc:'FPL criada'},
        {n:2,ts:'2026-01-25T12:00:00Z',autor:'Sofia Mendes',marco:'M0',desc:'M0 validado · comprovativo emitido'},
        {n:8,ts:'2026-05-04T11:00:00Z',autor:'Rui Ferreira',marco:null,desc:'SGGOV pediu correção do Bloco D · decisões em falta'},
      ],
    }),
  ];
  const auditorias = [
    {id:'a1',fpl_id:'fpl-001',auditor:'Rui Ferreira',data:'2026-05-02T10:00:00Z',pontuacao:94,observacoes:'FPL com cobertura adequada das interações relevantes. Decisões de incorporação bem fundamentadas. Sugestão menor: explicitar no objeto da entrada D-2 (EDP) se a reunião abrangeu também aspetos tarifários.',pedido_correcao:0,estado_correcao:'CONCLUIDA'},
    {id:'a2',fpl_id:'fpl-003',auditor:'Ana Costa',data:'2026-04-28T10:00:00Z',pontuacao:76,observacoes:'Bloco D com decisões de incorporação por preencher em ambas as entradas. Necessário completar antes de M3.',pedido_correcao:1,estado_correcao:'PENDENTE'},
    {id:'a3',fpl_id:'fpl-007',auditor:'Rui Ferreira',data:'2026-04-20T11:00:00Z',pontuacao:88,observacoes:'Cobertura adequada das interações relevantes. Decisões de incorporação fundamentadas. Sem pedidos de correção.',pedido_correcao:0,estado_correcao:'CONCLUIDA'},
    {id:'a4',fpl_id:'fpl-009',auditor:'Rui Ferreira',data:'2026-05-04T11:00:00Z',pontuacao:62,observacoes:'Bloco D incompleto: ambas as entradas (CRUP e CCISP) sem decisão de incorporação preenchida. A consulta pública recebeu 208 contributos mas a síntese e a decisão sobre incorporação no Bloco E também estão por preencher. Bloqueia M3.',pedido_correcao:1,estado_correcao:'EM_CURSO'},
  ];
  const notificacoes = [
    {id:'n1',user:'u-maria',tipo:'M3',titulo:'FPL 2026/MAEN/0042 — M3 validado',msg:'O comprovativo de M3 foi emitido. Aguarda agendamento em RSE.',ts:'2026-04-30T16:05:00Z',lida:false,fpl_id:'fpl-001'},
    {id:'n2',user:'u-maria',tipo:'CONSULTA',titulo:'Consulta pública encerrada — 2026/MAEN/0042',msg:'67 contributos importados para o Bloco E.',ts:'2026-04-14T18:00:00Z',lida:false,fpl_id:'fpl-001'},
    {id:'n3',user:'u-maria',tipo:'QA',titulo:'Auditoria QA recebida — 2026/MAEN/0042',msg:'Pontuação 94/100. Sem pedidos de correção.',ts:'2026-05-02T10:30:00Z',lida:true,fpl_id:'fpl-001'},
    {id:'n4',user:'u-ana',tipo:'QA',titulo:'Pedido de correção — 2026/MS/0011',msg:'A SGGOV pediu a correção do Bloco D antes de M3.',ts:'2026-04-28T11:00:00Z',lida:false,fpl_id:'fpl-003'},
    {id:'n5',user:'u-rui',tipo:'M4',titulo:'FPL 2026/MTSSS/0007 submetida para CM',msg:'Comprovativo de M4 verificado pelo SmartLegis.',ts:'2026-04-25T10:05:00Z',lida:false,fpl_id:'fpl-004'},
    {id:'n6',user:'u-joao',tipo:'CONSULTA',titulo:'Consulta interna em curso — 2026/ME/0023',msg:'Aguarda parecer da CMVM e do BdP antes de submissão a consulta pública.',ts:'2026-04-12T14:00:00Z',lida:false,fpl_id:'fpl-006'},
    {id:'n7',user:'u-sofia',tipo:'QA',titulo:'Pedido de correção — 2026/MECIC/0017',msg:'Bloco D e Bloco E incompletos. M3 bloqueado até resolução.',ts:'2026-05-04T11:30:00Z',lida:false,fpl_id:'fpl-009'},
    {id:'n8',user:'u-luis',tipo:'M5',titulo:'Aguarda publicação em DR — 2026/MF/0014',msg:'Aprovado em CM em 30/04. Publicação prevista para 25/05.',ts:'2026-05-01T09:00:00Z',lida:true,fpl_id:'fpl-007'},
    {id:'n9',user:'u-pedro',tipo:'M4',titulo:'Aguarda Conselho de Ministros — 2026/MTSSS/0007',msg:'Comprovativo de M4 verificado. Diploma agendado para CM de 22/05.',ts:'2026-04-25T11:00:00Z',lida:false,fpl_id:'fpl-004'},
  ];
  return {fpls,auditorias,notificacoes,seq:80};
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

/* ============ WORKFLOW (validação client-side real) ============ */
const TRANS = {
  M0:{from:['CRIADO'],to:'EM_ELABORACAO'},
  M1:{from:['EM_ELABORACAO','EM_CONSULTA_INTERNA'],to:'EM_CONSULTA_PUBLICA'},
  M2:{from:['EM_CONSULTA_PUBLICA'],to:'EM_CONSULTA_PUBLICA'},
  M3:{from:['EM_ELABORACAO','EM_CONSULTA_INTERNA','EM_CONSULTA_PUBLICA'],to:'EM_RSE'},
  M4:{from:['EM_RSE'],to:'EM_CM'},
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
  if (marco==='M2') {
    if (!f.m0) p.push({d:'M0 não validado'});
    if (!f.cl_ref) p.push({d:'Bloco E: referência da consulta pública por preencher'});
    if (!f.cl_sintese || f.cl_sintese.length<LIM.SINTESE_E) p.push({d:`Bloco E: síntese das posições (mínimo ${LIM.SINTESE_E} caracteres)`});
    if (!f.cl_decisao || f.cl_decisao.length<LIM.DECISAO_E) p.push({d:`Bloco E: decisão sobre incorporação (mínimo ${LIM.DECISAO_E} caracteres)`});
  }
  if (marco==='M3') {
    if (!f.m0) p.push({d:'M0 não validado'});
    (f.bloco_d||[]).forEach((d,i)=>{
      if (!d.decisao) p.push({d:`Bloco D · entrada ${i+1} (${d.entidade}): decisão de incorporação por preencher`});
      else if (!d.justificacao || d.justificacao.length<LIM.JUSTIF_D) p.push({d:`Bloco D · entrada ${i+1} (${d.entidade}): justificação (mínimo ${LIM.JUSTIF_D} caracteres)`});
    });
    if (f.cl_ref && f.cl_fim) {
      if (!f.cl_sintese || f.cl_sintese.length<LIM.SINTESE_E) p.push({d:`Bloco E: síntese das posições (mínimo ${LIM.SINTESE_E} caracteres)`});
      if (!f.cl_decisao || f.cl_decisao.length<LIM.DECISAO_E) p.push({d:`Bloco E: decisão sobre incorporação (mínimo ${LIM.DECISAO_E} caracteres)`});
    }
  }
  if (marco==='M4') {
    if (!f.m3) p.push({d:'M3 não validado'});
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
  if (!f.m3 && ['EM_ELABORACAO','EM_CONSULTA_INTERNA','EM_CONSULTA_PUBLICA'].includes(f.estado)) return 'M3';
  if (!f.m4 && f.estado==='EM_RSE') return 'M4';
  if (!f.m5 && f.estado==='APROVADO') return 'M5';
  if (f.estado==='EM_CM') return 'APROVAR';
  return null;
}

/* ============ COMPROVATIVO CRIPTOGRÁFICO (simulado) ============ */
function emitirComprovativo(f, marco, user) {
  const jti = 'cmp_'+marco+'-'+Math.random().toString(36).slice(2,14);
  const header = {alg:'EdDSA',typ:'fpl-comprovativo+jws',kid:'fpl-2026-01'};
  const payload = {
    iss:'fpl.sggov.ring', sub:f.numero, fpl_id:f.id, marco,
    validado_em:nowISO(), validado_por:user.papel+':'+(user.gabinete||'sggov'),
    snapshot_hash:'sha256:'+Math.random().toString(16).slice(2,18)+Math.random().toString(16).slice(2,18),
    jti, iat:Math.floor(Date.now()/1000),
  };
  const sig = (Math.random().toString(36)+Math.random().toString(36)+Math.random().toString(36)).replace(/[^a-z0-9]/g,'').slice(0,86);
  const jws = b64u(header)+'.'+b64u(payload)+'.'+sig;
  return {jti, marco, emitido_em:payload.validado_em, estado:'VALIDO', jws, header, payload};
}

/* ============ NOTIFICAÇÕES ============ */
function notificar(userId, tipo, titulo, msg, fpl_id) {
  DB.notificacoes.unshift({id:uuid(),user:userId,tipo,titulo,msg,ts:nowISO(),lida:false,fpl_id});
}

/* ============ ESTADO DA APP ============ */
const S = { user:null, view:'dashboard', fplId:null, tab:'A', dropdown:null };

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

/* ============ NAVEGAÇÃO ============ */
function go(view, opts={}) {
  S.view = view;
  if (opts.fplId!==undefined) S.fplId = opts.fplId;
  if (opts.tab) S.tab = opts.tab;
  S.dropdown = null;
  render();
  window.scrollTo(0,0);
}
window.go = go;

function login(perfilId) {
  S.user = PERFIS.find(p=>p.id===perfilId);
  S.view = isPublico() ? 'portal' : 'dashboard';
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
  return `
  <div class="login">
    <div class="demo-banner">DEMONSTRAÇÃO INTERATIVA · corre inteiramente no seu navegador · dados fictícios · nenhuma informação é enviada para servidores</div>
    <div class="login-body">
      <div class="login-card">
        <div class="login-head">
          <div class="crest">${svg(I.shield)}</div>
          <h1>Pegada Legislativa do Governo</h1>
          <p>Demonstração interativa da aplicação FPL Ponte. Escolha um perfil para entrar e experimentar a plataforma — pode criar fichas, validar marcos, emitir comprovativos e mudar de perspetiva a qualquer momento.</p>
        </div>
        <div class="login-roles">
          <div class="lbl">Entrar como</div>
          <div class="role-grid">
            ${PERFIS.map(p=>`
              <button class="role-card" onclick="login('${p.id}')">
                <span class="avatar" style="background:${p.cor}">${inits(p.nome)}</span>
                <span class="meta">
                  <span class="nome">${esc(p.nome)}</span>
                  <span class="papel">${PAPEL_LBL[p.papel]}${p.gabinete?' · '+gab(p.gabinete).sigla:''}</span>
                </span>
              </button>`).join('')}
          </div>
        </div>
        <div class="login-foot">
          Numa instalação real, a autenticação faz-se contra o diretório interno dos serviços (LDAP/AD), com a aplicação confinada à Rede Informática do Governo. Aqui simula-se essa escolha de perfil.
        </div>
      </div>
    </div>
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
}

function renderSidebar(nUnread) {
  const u = S.user;
  const sggov = isSggov();
  const myFpls = fplsVisiveis();
  const ativos = myFpls.filter(f=>!['PUBLICADO','ARQUIVADO'].includes(f.estado)).length;
  const emCm = myFpls.filter(f=>f.estado==='EM_CM').length;
  const publicadas = myFpls.filter(f=>f.estado==='PUBLICADO').length;
  const validar = myFpls.filter(f=>f.estado==='EM_ELABORACAO' && !f.m3).length;
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
    <div class="bottom">
      <div class="av" style="background:${u.cor}">${inits(u.nome)}</div>
      <div class="nm"><strong>${esc(u.nome)}</strong><span>${PAPEL_LBL[u.papel]}${u.gabinete?' · '+gab(u.gabinete).sigla:''}</span></div>
      <button onclick="logout()" title="Terminar sessão" aria-label="Terminar sessão">${svg(I.out)}</button>
    </div>
  </aside>`;
}
function renderUserMenu() {
  return `<div class="dropdown">
    <div class="dh"><div class="n">${esc(S.user.nome)}</div><div class="e">${esc(S.user.email)}</div></div>
    <button onclick="S.dropdown=null;logout()">${svg(I.out)} Sair / trocar de perfil</button>
    <div class="sep"></div>
    <button onclick="S.dropdown=null;confirmReset()">${svg(I.refresh)} Reiniciar demonstração</button>
  </div>`;
}
function renderNotifPanel() {
  const list = DB.notificacoes.filter(n=>n.user===S.user.id).slice(0,12);
  const icoFor = t => ({M3:I.check,M4:I.check,QA:I.shield,CONSULTA:I.globe}[t]||I.bell);
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
  <div class="modal-b"><div class="alert warning"><span class="at">Repõe todos os dados de demonstração</span>Todas as alterações que fez (FPL criadas, marcos validados, edições) serão descartadas e os dados voltam ao estado inicial.</div></div>
  <div class="modal-f"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn danger" onclick="resetDB();closeModal();S.view='dashboard';S.fplId=null;render();toast('Demonstração reiniciada.','success')">Reiniciar</button></div>`);
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
function viewLista() {
  const fpls = fplsVisiveis();
  return `
  <div class="page-head">
    <div><div class="pt">${isSggov()?'Todas as FPL':'As minhas FPL'}</div><div class="ps">${fpls.length} fichas de pegada legislativa</div></div>
    ${!isSggov()?`<button class="btn primary" onclick="go('nova')">${svg(I.plus)} Nova FPL</button>`:''}
  </div>
  <div class="card">
    <table class="tbl"><thead><tr><th>N.º Processo</th><th>Tipo</th><th>Título</th><th>Gabinete</th><th>Estado</th><th>M0</th><th>M3</th><th>M5</th></tr></thead><tbody>
    ${fpls.length?fpls.map(f=>`
      <tr class="clickable" onclick="go('detalhe',{fplId:'${f.id}'})">
        <td><strong class="mono">${esc(f.numero)}</strong></td>
        <td>${tag(f.tipo)}</td>
        <td class="cel-t">${esc(f.titulo_curto||f.titulo)}</td>
        <td>${gab(f.gabinete).sigla}</td>
        <td>${badge(f.estado)}</td>
        <td class="cel-num">${fmtD(f.m0)}</td>
        <td class="cel-num">${fmtD(f.m3)}</td>
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
  <div class="alert info"><span class="at">Acoplamento por comprovativo</span>Em cada marco bloqueante (M0, M3, M4, M5) a aplicação emite um comprovativo assinado. O ponto focal cola-o no SmartLegis, que o verifica com a chave pública partilhada e bloqueia a tramitação se a verificação falhar — sem integração síncrona entre os sistemas.</div>
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
    <div class="kpi"><div class="l">FPL auditáveis</div><div class="v">${DB.fpls.filter(f=>f.m3).length}</div><div class="d">com M3 validado</div></div>
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
  const auditaveis = DB.fpls.filter(f=>f.m3);
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

function viewDetalhe() {
  const f = getFpl(S.fplId);
  if (!f) return '<div class="card-empty" style="padding:32px">FPL não encontrada.</div>';
  const vista = (sessionStorage.getItem('fpl.detailView.'+f.id) || 'detalhe');

  return painelHeader(f, vista) + (vista === 'cronograma' ? painelCronograma(f) : painelDetalhe(f));
}

function bindDetalhe() {
  // Toggle Detalhe/Cronograma
  document.querySelectorAll('.painel-toggle [data-vista]').forEach(b => {
    b.addEventListener('click', () => {
      sessionStorage.setItem('fpl.detailView.'+S.fplId, b.dataset.vista);
      render();
    });
  });
}

function painelHeader(f, vista) {
  const marcos = [
    {id:'M0',lbl:'Abertura',  data:f.m0, bloq:true},
    {id:'M1',lbl:'Pré-CP',    data:f.m1, bloq:false},
    {id:'M2',lbl:'Pós-CP',    data:f.m2, bloq:false},
    {id:'M3',lbl:'Pré-RSE',   data:f.m3, bloq:true},
    {id:'M4',lbl:'Pré-CM',    data:f.m4, bloq:true},
    {id:'M5',lbl:'Publicação',data:f.m5, bloq:true},
  ];
  let curIdx = marcos.findIndex(m=>!m.data);
  marcos.forEach((m,i)=>{ m.estado = m.data ? 'done' : (i===curIdx?'current':'todo'); });

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
        <button data-vista="detalhe"    role="tab" aria-selected="${vista==='detalhe'}">▦ Detalhe</button>
        <button data-vista="cronograma" role="tab" aria-selected="${vista==='cronograma'}">▥ Cronograma</button>
      </div>
    </div>
    <div class="painel-stepper">
      ${marcos.map(m => `
        <div class="painel-step ${m.estado}">
          <div class="dot">${m.estado==='done'?'✓':m.id.replace('M','')}</div>
          <div>
            <div class="lbl">${m.id} · ${m.lbl}${m.bloq?'<span class="bloq" aria-hidden="true">⚿ bloq.</span>':''}</div>
            <div class="sub">${m.data?fmtD(m.data):(m.estado==='current'?'a validar agora':'—')}</div>
            ${m.estado==='current' && !isPublico() && scopeOk(f) && pm && pm!=='APROVAR' ? `<button class="cta" onclick="modalValidarMarco('${f.id}','${m.id}')">Validar ${m.id}</button>` : ''}
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
  return `<div class="pc-card">
    <div class="pc-card-head">
      <div class="pc-letter">A</div>
      <div><div class="ttl">Identificação</div><div class="sub">Bloco A</div></div>
      <span class="ok">✓ completo</span>
    </div>
    <div class="pc-card-body">
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
  return `<div class="pc-card">
    <div class="pc-card-head">
      <div class="pc-letter">B</div>
      <div><div class="ttl">Origem e motivação</div><div class="sub">Bloco B</div></div>
      ${completo?'<span class="ok">✓ completo</span>':`<span class="warn">⚠ ${sintLen<LIM.SINTESE_B?'síntese curta':'origem em falta'}</span>`}
      ${ed?`<button class="more" onclick="modalEditarB('${f.id}')">Editar</button>`:''}
    </div>
    <div class="pc-card-body">
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

  return `<div class="pc-card wide">
    <div class="pc-card-head">
      <div class="pc-letter d">D</div>
      <div>
        <div class="ttl">Interações externas — núcleo da pegada</div>
        <div class="sub">Bloco D · Lei n.º 5-A/2026 art.º 4.º</div>
      </div>
      ${c.pend>0?`<span class="warn">⚠ ${c.pend} decisão pendente${c.pend>1?'s':''}</span>`:''}
      <span class="count">${total} entrada${total===1?'':'s'}</span>
      ${ed?`<button class="more" onclick="modalNovaD('${f.id}')" style="margin-left:8px">+ Adicionar</button>`:''}
    </div>
    <div class="pc-card-body">
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
          <div class="pc-mini">
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
  return `<div class="pc-card">
    <div class="pc-card-head">
      <div class="pc-letter">C</div>
      <div><div class="ttl">Contributos internos</div><div class="sub">Bloco C · pareceres formais</div></div>
      <span class="count">${lista.length}</span>
      ${ed?`<button class="more" onclick="modalNovaC('${f.id}')" style="margin-left:8px">+</button>`:''}
    </div>
    <div class="pc-card-body">
      ${lista.length===0
        ? '<div class="pc-empty">Sem contributos registados</div>'
        : lista.slice(0,4).map(e=>`
          <div class="pc-mini">
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
  return `<div class="pc-card">
    <div class="pc-card-head">
      <div class="pc-letter">E</div>
      <div><div class="ttl">Consulta pública</div><div class="sub">Bloco E · ConsultaLEX</div></div>
      ${tem && f.cl_fim ? '<span class="ok">✓ encerrada</span>' : tem ? '<span class="warn">em curso</span>' : ''}
      ${ed?`<button class="more" onclick="modalEditarE('${f.id}')" style="margin-left:8px">Editar</button>`:''}
    </div>
    <div class="pc-card-body">
      ${tem?`
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
  const marcos = ['M0','M3','M4','M5'];
  const pendentes = marcos.filter(m=>!cmps.find(c=>c.marco===m));
  return `<div class="pc-card">
    <div class="pc-card-head">
      <div class="pc-letter cmp">⚿</div>
      <div><div class="ttl">Comprovativos</div><div class="sub">JWS Ed25519 · SmartLegis</div></div>
      <span class="count">${cmps.length} / 4</span>
    </div>
    <div class="pc-card-body">
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
  const m3 = f.m3 ? '✓ M3 assinada' : 'M3 pendente';
  const m4 = f.m4 ? '✓ M4 assinada' : 'M4 pendente';
  const ok = f.m3 && f.m4;
  return `<div class="pc-card">
    <div class="pc-card-head">
      <div class="pc-letter f">F</div>
      <div><div class="ttl">Declaração</div><div class="sub">Bloco F · ponto focal</div></div>
      ${ok?'<span class="ok">✓ completas</span>':`<span class="warn">${esc(!f.m3?m3:m4)}</span>`}
    </div>
    <div class="pc-card-body">
      <div class="pc-quote">"Confirmo que a presente FPL reflete todas as interações ocorridas no perímetro do diploma e que os campos obrigatórios estão integralmente preenchidos."</div>
      <div style="font-size:11px;color:var(--p-text-mute);margin-top:10px">${m3} · ${m4}</div>
    </div>
  </div>`;
}

function pcG(f) {
  const lista = DB.auditorias.filter(a=>a.fpl_id===f.id);
  return `<div class="pc-card">
    <div class="pc-card-head">
      <div class="pc-letter h">G</div>
      <div><div class="ttl">Auditoria QA</div><div class="sub">SGGOV · pontuação ${lista[0]?.pontuacao||'—'}/100</div></div>
      <span class="count">${lista.length}</span>
      ${isSggov()?`<button class="more" onclick="modalNovaAuditoria()" style="margin-left:8px">+</button>`:''}
    </div>
    <div class="pc-card-body">
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
  openModal(`
    <div class="modal-h"><h3>Bloco D · Interações externas (${todas.length})</h3><button class="x-btn" onclick="closeModal()">✕</button></div>
    <div class="modal-b" style="max-height:65vh;overflow-y:auto">
      ${todas.map(e=>`
        <div class="pc-mini" style="padding:10px 0">
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
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  const grid = pcGerarGridMes(ano, mes);
  const eventos = pcCompilarEventos(f);
  const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const proximos = pcListarProximos(eventos);
  const isoHoje = pcIsoHoje();

  return `<div class="painel-crono">
    <div class="crono-cal">
      <div class="crono-toolbar">
        <div class="crono-nav"><button aria-label="Mês anterior">‹</button><button aria-label="Mês seguinte">›</button></div>
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
        M0→M3 mediano: <strong style="color:var(--p-text)">72 dias</strong><br>
        M3→M5 mediano: <strong style="color:var(--p-text)">34 dias</strong><br>
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
      const cor = e.k==='M3'||e.k==='M4' ? 'gold'
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
    case 'M3': return 'Validação bloqueante · pré-RSE';
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
        <span class="data">${fmtD(e.data)}</span>
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
        <span class="data">${fmtD(e.data)}</span>
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
        :`<div class="alert warning mt-8" style="margin-bottom:0"><span class="at">Decisão pendente</span>Necessário preencher a decisão de incorporação e a justificação antes de validar M3.${ed?` <button class="btn sm" style="margin-top:6px" onclick="modalDecisaoD('${f.id}','${e.id}')">Preencher decisão</button>`:''}</div>`}
      </div>
    </div>`).join(''):'<div class="card-empty">Sem interações externas registadas</div>';
  return blocoWrap('D','Interações externas — núcleo da pegada','Interações com representantes de interesses (Lei n.º 5-A/2026)',corpo,
    ed?`<button class="btn primary sm" onclick="modalNovaD('${f.id}')">${svg(I.plus)} Adicionar interação</button>`:'','var(--red)');
}
function blocoE(f) {
  const ed = !isPublico() && scopeOk(f);
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
  return blocoWrap('F','Declaração do ponto focal','Validação obrigatória nos marcos M3 e M4',`
    <div class="declaracao">"Confirmo que a presente FPL reflete todas as interações ocorridas no perímetro do diploma e que os campos obrigatórios estão integralmente preenchidos."</div>
    <div class="field-grid">
      <div class="field"><label>Declaração M3 (Pré-RSE)</label><div class="v">${f.m3?`✓ Assinada em ${fmtDH(f.m3)}`:'<span class="empty">Pendente</span>'}</div></div>
      <div class="field"><label>Declaração M4 (Pré-CM)</label><div class="v">${f.m4?`✓ Assinada em ${fmtDH(f.m4)}`:'<span class="empty">Pendente</span>'}</div></div>
    </div>
    <div class="alert info mt-16" style="margin-bottom:0"><span class="at">Lembrete legal</span>A submissão de declaração comprovadamente falsa é sujeita ao regime previsto na RCM.</div>`);
}
function blocoCMP(f) {
  const cmps = f.comprovativos||[];
  const marcos = ['M0','M3','M4','M5'];
  const corpo = `
    <div class="alert info"><span class="at">Acoplamento ao SmartLegis</span>Cada marco bloqueante emite um JWS Ed25519 assinado. O ponto focal copia-o para o SmartLegis, que o verifica offline com a chave pública partilhada e bloqueia a tramitação se a verificação falhar.</div>
    ${marcos.map(m=>{
      const c = cmps.find(x=>x.marco===m);
      return `<div class="cmp-row">
        <span class="cmp-mark ${c?'':'pend'}">${m}</span>
        <div style="flex:1">
          <strong>${({M0:'Abertura',M3:'Pré-RSE',M4:'Pré-CM',M5:'Publicação'})[m]}</strong>
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
  if (['M0','M3','M4'].includes(marco)) f[marco.toLowerCase()+'_por'] = S.user.id;
  if (['M3','M4'].includes(marco)) f[marco.toLowerCase()+'_decl'] = 1;
  if (marco!=='M2') f.estado = t.to;
  if (marco==='M5') { f.data_publicacao = nowISO(); }
  let cmp = null;
  if (MARCOS_BLOQ.includes(marco)) {
    cmp = emitirComprovativo(f, marco, S.user);
    f.comprovativos.push({jti:cmp.jti,marco,emitido_em:cmp.emitido_em,estado:'VALIDO',jws:cmp.jws});
  }
  novaVersao(f, marco, `${marco} validado${cmp?' · comprovativo emitido':''}${marco!=='M2'?' · estado → '+ESTADOS[t.to].l:''}`);
  // notificações
  if (marco==='M3') notificar(f.criado_por,'M3',`FPL ${f.numero} — M3 validado`,'Comprovativo emitido. Aguarda agendamento em RSE.',f.id);
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
  const precisaDecl = ['M3','M4'].includes(marco);
  const lbl = {M0:'Abertura',M1:'Pré-consulta pública',M2:'Pós-consulta pública',M3:'submissão para Reunião de Secretários de Estado',M4:'submissão para Conselho de Ministros',M5:'publicação'}[marco];
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
  const jws = cmp.jws || (b64u({alg:'EdDSA',typ:'fpl-comprovativo+jws',kid:'fpl-2026-01'})+'.'+b64u({iss:'fpl.sggov.ring',sub:f.numero,marco:cmp.marco,jti:cmp.jti})+'.'+'k7Qx9aF2bLnQmR4vP8wZ3yT6sN1uH0eK5cB7dG2fXa9JpYrW3M8tL4QvciZoExS');
  const [h,p,s] = jws.split('.');
  openModal(`
    <div class="modal-h"><h3>${recemEmitido?cmp.marco+' validado — comprovativo emitido':'Comprovativo criptográfico · '+cmp.marco}</h3><button class="x-btn" onclick="closeModal()">✕</button></div>
    <div class="modal-b">
      ${recemEmitido?`<div class="alert success"><span class="at">Marco ${cmp.marco} validado</span>O sistema gerou o comprovativo abaixo. Copie-o e cole-o no campo correspondente do SmartLegis.</div>`:''}
      <div class="cmp-code"><span class="h">${h}</span>.<span class="p">${p}</span>.<span class="s">${s}</span></div>
      <div class="cmp-meta"><span><b>Algoritmo</b> EdDSA (Ed25519)</span><span><b>Emissor</b> fpl.sggov.ring</span><span><b>Marco</b> ${cmp.marco}</span><span><b>jti</b> ${esc(cmp.jti)}</span><span><b>kid</b> fpl-2026-01</span></div>
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
  modalVerComprovativoObj({numero:'2026/MAEN/0042'}, {marco:'M3',jti:'cmp_M3-9fK2bL7xQw4p'}, false);
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
  openModal(`<div class="modal-h"><h3>Editar Bloco E — Consulta pública</h3><button class="x-btn" onclick="closeModal()">✕</button></div>
  <div class="modal-b"><div class="field-grid">
    <div class="field"><label>Referência Consulta.Lex</label><input type="text" id="e-ref" value="${esc(f.cl_ref||'')}" placeholder="CL-2026-..."></div>
    <div class="field"><label>N.º de contributos</label><input type="number" id="e-n" value="${f.cl_n??''}"></div>
    <div class="field"><label>Início</label><input type="date" id="e-ini" value="${(f.cl_inicio||'').slice(0,10)}"></div>
    <div class="field"><label>Fim</label><input type="date" id="e-fim" value="${(f.cl_fim||'').slice(0,10)}"></div>
    <div class="field full"><label>Síntese das posições <span class="help">(mín. ${LIM.SINTESE_E} caracteres)</span></label><textarea id="e-sintese" rows="5">${esc(f.cl_sintese||'')}</textarea></div>
    <div class="field full"><label>Decisão sobre incorporação <span class="help">(mín. ${LIM.DECISAO_E} caracteres)</span></label><textarea id="e-decisao" rows="4">${esc(f.cl_decisao||'')}</textarea></div>
  </div></div>
  <div class="modal-f"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn primary" onclick="salvarE('${id}')">Guardar</button></div>`);
};
window.salvarE = (id) => {
  const f = getFpl(id);
  f.cl_ref = document.getElementById('e-ref').value.trim();
  const n = document.getElementById('e-n').value; f.cl_n = n===''?null:parseInt(n,10);
  f.cl_inicio = document.getElementById('e-ini').value||null;
  f.cl_fim = document.getElementById('e-fim').value||null;
  f.cl_sintese = document.getElementById('e-sintese').value.trim();
  f.cl_decisao = document.getElementById('e-decisao').value.trim();
  novaVersao(f,null,'Bloco E atualizado'); save(); closeModal(); toast('Bloco E atualizado.','success'); render();
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
    <div class="alert warning mt-16" style="margin-bottom:0"><span class="at">Decisão de incorporação</span>Pode preencher mais tarde, mas é obrigatória antes de validar M3.</div>
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

