// migrate.js — Esquema da base de dados, unificado e idempotente.
//
// Substitui o `init()` que estava espalhado por db.js, security.js,
// notificacoes.js e consultalex.js. Acrescenta as tabelas do comprovativo
// criptográfico. O SQL é escrito num subconjunto compatível com SQLite e
// PostgreSQL — sem tipos exóticos, sem sintaxe específica de um SGBD.
//
// Uso:  node src/migrate.js          (cria/atualiza o schema)
// É idempotente: pode correr-se as vezes que forem necessárias.

import { db, initDb, DRIVER } from './db.js';

// Tipos: usamos TEXT para datas (ISO 8601) e identificadores (UUID gerado em
// JS), e INTEGER para boolean (0/1) — todos portáveis entre SQLite e Postgres.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS utilizador (
  id TEXT PRIMARY KEY,
  nif TEXT UNIQUE,
  email TEXT NOT NULL UNIQUE,
  nome_completo TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1,
  totp_secret TEXT,
  totp_ativo INTEGER NOT NULL DEFAULT 0,
  federacao_provider TEXT,
  federacao_subject TEXT,
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gabinete (
  id TEXT PRIMARY KEY,
  sigla TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS atribuicao_papel (
  utilizador_id TEXT NOT NULL REFERENCES utilizador(id),
  papel TEXT NOT NULL,
  gabinete_id TEXT REFERENCES gabinete(id),
  desde TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  origem TEXT NOT NULL DEFAULT 'MANUAL',  -- MANUAL | DIRETORIO | SEED
  PRIMARY KEY (utilizador_id, papel, gabinete_id)
);

CREATE TABLE IF NOT EXISTS fpl (
  id TEXT PRIMARY KEY,
  numero_processo TEXT UNIQUE NOT NULL,
  tipo_diploma TEXT NOT NULL,
  titulo TEXT NOT NULL,
  titulo_curto TEXT,
  gabinete_id TEXT NOT NULL REFERENCES gabinete(id),
  coproponentes TEXT,
  estado_workflow TEXT NOT NULL DEFAULT 'CRIADO',
  tipo_origem TEXT,
  referencia_origem TEXT,
  sintese_problema TEXT,
  avaliacao_previa INTEGER,
  consulta_lex_ref TEXT,
  consulta_lex_inicio TEXT,
  consulta_lex_fim TEXT,
  consulta_lex_n_contributos INTEGER,
  consulta_lex_sintese TEXT,
  consulta_lex_decisao TEXT,
  m0_validado_em TEXT, m0_validado_por TEXT,
  m1_validado_em TEXT, m1_validado_por TEXT, m1_declaracao TEXT,
  m2_validado_em TEXT,
  m3_validado_em TEXT, m3_validado_por TEXT, m3_declaracao TEXT,
  m4_validado_em TEXT, m4_validado_por TEXT, m4_declaracao TEXT,
  m5_validado_em TEXT,
  referencia_dr TEXT,
  dre_url TEXT,
  data_criacao TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data_publicacao TEXT,
  versao_atual INTEGER NOT NULL DEFAULT 1,
  regime_simplificado TEXT,
  criado_por TEXT REFERENCES utilizador(id),
  CONSTRAINT estado_valido CHECK (estado_workflow IN
    ('CRIADO','EM_ELABORACAO','EM_CONSULTA_INTERNA','EM_CONSULTA_PUBLICA',
     'EM_RSE','EM_CM','APROVADO','PUBLICADO','EM_REVISAO_QA','ARQUIVADO','REJEITADO_M0'))
);
CREATE INDEX IF NOT EXISTS idx_fpl_gabinete ON fpl(gabinete_id);
CREATE INDEX IF NOT EXISTS idx_fpl_estado ON fpl(estado_workflow);

CREATE TABLE IF NOT EXISTS entrada_bloco_c (
  id TEXT PRIMARY KEY,
  fpl_id TEXT NOT NULL REFERENCES fpl(id),
  data TEXT NOT NULL,
  entidade TEXT NOT NULL,
  cargo TEXT,
  forma TEXT NOT NULL,
  objeto TEXT NOT NULL,
  sintese_posicao TEXT NOT NULL,
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_c_fpl ON entrada_bloco_c(fpl_id);

CREATE TABLE IF NOT EXISTS entrada_bloco_d (
  id TEXT PRIMARY KEY,
  fpl_id TEXT NOT NULL REFERENCES fpl(id),
  data TEXT NOT NULL,
  forma TEXT NOT NULL,
  entidade_designacao TEXT NOT NULL,
  rtri_id TEXT,
  rtri_status TEXT,
  natureza_juridica TEXT NOT NULL,
  pessoas_governo TEXT NOT NULL,
  pessoas_interlocutor TEXT,
  objeto TEXT NOT NULL,
  sintese_posicao TEXT NOT NULL,
  decisao_incorporacao TEXT,
  justificacao_decisao TEXT,
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TEXT
);
CREATE INDEX IF NOT EXISTS idx_d_fpl ON entrada_bloco_d(fpl_id);

CREATE TABLE IF NOT EXISTS versao_fpl (
  id TEXT PRIMARY KEY,
  fpl_id TEXT NOT NULL REFERENCES fpl(id),
  numero INTEGER NOT NULL,
  autor_id TEXT NOT NULL REFERENCES utilizador(id),
  timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  snapshot TEXT NOT NULL,
  marco_validado TEXT,
  descricao TEXT,
  UNIQUE (fpl_id, numero)
);
CREATE INDEX IF NOT EXISTS idx_v_fpl ON versao_fpl(fpl_id, numero DESC);

CREATE TABLE IF NOT EXISTS evento_auditoria (
  id TEXT PRIMARY KEY,
  fpl_id TEXT,
  tipo_evento TEXT NOT NULL,
  autor_id TEXT,
  timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payload TEXT NOT NULL,
  ip_origem TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_e_fpl ON evento_auditoria(fpl_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_e_tipo ON evento_auditoria(tipo_evento, timestamp DESC);

CREATE TABLE IF NOT EXISTS entidade_rtri (
  rtri_id TEXT PRIMARY KEY,
  designacao TEXT NOT NULL,
  natureza_juridica TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  data_inscricao TEXT,
  ultima_sincronizacao TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auditoria_qa (
  id TEXT PRIMARY KEY,
  fpl_id TEXT NOT NULL REFERENCES fpl(id),
  auditor_id TEXT NOT NULL REFERENCES utilizador(id),
  data_auditoria TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  pontuacao INTEGER NOT NULL CHECK (pontuacao BETWEEN 0 AND 100),
  observacoes TEXT,
  pedido_correcao INTEGER NOT NULL DEFAULT 0,
  descricao_correcao TEXT,
  estado_correcao TEXT DEFAULT 'PENDENTE',
  estado_workflow_anterior TEXT
);
CREATE INDEX IF NOT EXISTS idx_qa_fpl ON auditoria_qa(fpl_id);

CREATE TABLE IF NOT EXISTS anexo (
  id TEXT PRIMARY KEY,
  fpl_id TEXT NOT NULL REFERENCES fpl(id),
  bloco TEXT NOT NULL,
  entrada_id TEXT,
  nome_original TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  tamanho_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  visibilidade TEXT NOT NULL DEFAULT 'INTERNO',
  upload_por TEXT NOT NULL REFERENCES utilizador(id),
  upload_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  antivirus_status TEXT NOT NULL DEFAULT 'PENDENTE'
);
CREATE INDEX IF NOT EXISTS idx_anexo_fpl ON anexo(fpl_id);

CREATE TABLE IF NOT EXISTS tentativa_login (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  ip TEXT,
  sucesso INTEGER NOT NULL,
  timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tentativa_email_ts ON tentativa_login(email, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_tentativa_ip_ts ON tentativa_login(ip, timestamp DESC);

CREATE TABLE IF NOT EXISTS conta_bloqueada (
  email TEXT PRIMARY KEY,
  bloqueada_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  desbloqueia_em TEXT NOT NULL,
  motivo TEXT
);

CREATE TABLE IF NOT EXISTS notificacao (
  id TEXT PRIMARY KEY,
  destinatario_id TEXT NOT NULL REFERENCES utilizador(id),
  fpl_id TEXT,
  tipo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  corpo TEXT NOT NULL,
  lida INTEGER NOT NULL DEFAULT 0,
  criada_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payload TEXT
);
CREATE INDEX IF NOT EXISTS idx_notif_destinatario ON notificacao(destinatario_id, lida, criada_em DESC);

CREATE TABLE IF NOT EXISTS outbox_email (
  id TEXT PRIMARY KEY,
  notificacao_id TEXT REFERENCES notificacao(id),
  destinatario_email TEXT NOT NULL,
  assunto TEXT NOT NULL,
  corpo_html TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'PENDENTE',
  tentativas INTEGER NOT NULL DEFAULT 0,
  ultima_tentativa TEXT,
  erro TEXT,
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contributo_consulta (
  id TEXT PRIMARY KEY,
  fpl_id TEXT NOT NULL REFERENCES fpl(id),
  cl_ref TEXT NOT NULL,
  data_contributo TEXT NOT NULL,
  entidade TEXT NOT NULL,
  tipo_entidade TEXT,
  tema TEXT,
  sintese TEXT,
  importado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  origem TEXT NOT NULL DEFAULT 'WEBHOOK'
);
CREATE INDEX IF NOT EXISTS idx_contrib_fpl ON contributo_consulta(fpl_id);

CREATE TABLE IF NOT EXISTS comprovativo (
  jti TEXT PRIMARY KEY,
  fpl_id TEXT NOT NULL REFERENCES fpl(id),
  numero_processo TEXT NOT NULL,
  marco TEXT NOT NULL,
  validado_por TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL,
  kid TEXT NOT NULL,
  jws TEXT NOT NULL,
  emitido_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_em TEXT,
  estado TEXT NOT NULL DEFAULT 'VALIDO',
  revogado_em TEXT,
  motivo_revogacao TEXT
);
CREATE INDEX IF NOT EXISTS idx_comprovativo_fpl ON comprovativo(fpl_id, marco);

CREATE TABLE IF NOT EXISTS chave_assinatura (
  kid TEXT PRIMARY KEY,
  algoritmo TEXT NOT NULL DEFAULT 'EdDSA',
  chave_publica TEXT NOT NULL,
  criada_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ativa INTEGER NOT NULL DEFAULT 1,
  desativada_em TEXT
);
`;

// Migrações incrementais para schemas já existentes (instalações antigas).
// Cada migração é idempotente — pode correr-se sempre. Adicionar ao fim
// quando se introduzir uma alteração não-aditiva (ALTER TABLE ADD COLUMN
// é o caso mais comum em SQLite + Postgres).
const MIGRATIONS = [
  // 2026-05 — coluna `origem` em atribuicao_papel para distinguir papéis
  // sincronizados pelo diretório de papéis manuais.
  async () => {
    const ja = await db.get(`SELECT 1 FROM atribuicao_papel WHERE origem IS NOT NULL LIMIT 1`).catch(() => null);
    if (ja) return; // já aplicada
    try { await db.exec(`ALTER TABLE atribuicao_papel ADD COLUMN origem TEXT NOT NULL DEFAULT 'MANUAL'`); }
    catch (e) {
      if (!/duplicate column|already exists/i.test(e.message)) throw e;
    }
  },
  // 2026-05 — coluna `dre_url` em fpl, populada pelo adapter DRE.
  async () => {
    try { await db.exec(`ALTER TABLE fpl ADD COLUMN dre_url TEXT`); }
    catch (e) {
      if (!/duplicate column|already exists/i.test(e.message)) throw e;
    }
  },
  // 2026-05 — refactor de marcos: M1 passa a ser "Pré-RSE" (antigo M3) e
  // M3 passa a ser "Encerramento CP" (não-bloqueante, sem declaração).
  // Acrescenta colunas m1_validado_por / m1_declaracao ao fpl. As colunas
  // m3_* antigas são preservadas (ver migração de dados abaixo).
  async () => {
    try { await db.exec(`ALTER TABLE fpl ADD COLUMN m1_validado_por TEXT`); }
    catch (e) {
      if (!/duplicate column|already exists/i.test(e.message)) throw e;
    }
  },
  async () => {
    try { await db.exec(`ALTER TABLE fpl ADD COLUMN m1_declaracao TEXT`); }
    catch (e) {
      if (!/duplicate column|already exists/i.test(e.message)) throw e;
    }
  },
  // 2026-05 — migração de dados: nas instalações que já tinham FPLs
  // validadas no antigo M3 (Pré-RSE), copia esses dados para o novo M1
  // (mesmo significado semântico no novo desenho). NÃO apaga os dados
  // m3_* antigos — ficam disponíveis para auditoria e como fallback de
  // rollback. Idempotente: o WHERE garante que só copia linhas onde
  // m1_validado_em ainda está vazio.
  async () => {
    await db.exec(`
      UPDATE fpl
         SET m1_validado_em = m3_validado_em,
             m1_validado_por = m3_validado_por,
             m1_declaracao = m3_declaracao
       WHERE m1_validado_em IS NULL
         AND m3_validado_em IS NOT NULL
    `);
  },
  // 2026-05 — marca comprovativos M3 antigos (Pré-RSE) como SUBSTITUIDO.
  // No novo desenho, M3 é "Encerramento CP" — não-bloqueante, sem JWS.
  // Qualquer comprovativo em BD com marco='M3' é necessariamente do
  // desenho antigo. A assinatura criptográfica continua verificável
  // (o JWS é imutável), só o estado interno muda para distinguir do
  // significado actual. Idempotente.
  async () => {
    await db.exec(`
      UPDATE comprovativo
         SET estado = 'SUBSTITUIDO',
             motivo_revogacao = COALESCE(motivo_revogacao,
               'M3 (antigo Pré-RSE) substituído por M1 no novo desenho de marcos')
       WHERE marco = 'M3' AND estado = 'VALIDO'
    `);
  },
  // 2026-05 — coluna `estado_workflow_anterior` em auditoria_qa para
  // que o retorno de uma correção restaure a FPL ao estado em que estava
  // antes do pedido de correção (em vez de assumir EM_CONSULTA_PUBLICA).
  // Permite auditorias pedidas com FPL em EM_RSE (antes da CP) voltarem
  // ao estado correto.
  async () => {
    try { await db.exec(`ALTER TABLE auditoria_qa ADD COLUMN estado_workflow_anterior TEXT`); }
    catch (e) {
      if (!/duplicate column|already exists/i.test(e.message)) throw e;
    }
  },
];

export async function migrate() {
  await initDb();
  await db.exec(SCHEMA);
  for (const m of MIGRATIONS) await m();
  return { driver: DRIVER, tabelas: (SCHEMA.match(/CREATE TABLE/g) || []).length };
}

// Execução direta: `node src/migrate.js`
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('migrate.js')) {
  migrate()
    .then(r => { console.log(`✓ Schema aplicado (driver: ${r.driver}, ${r.tabelas} tabelas).`); process.exit(0); })
    .catch(e => { console.error('✗ Falha na migração:', e.message); process.exit(1); });
}
