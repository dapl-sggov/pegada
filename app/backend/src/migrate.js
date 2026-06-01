// migrate.js — Esquema SQLite mínimo, idempotente.
//
// Cobre o que sobra depois da simplificação:
//
//   utilizador / gabinete / atribuicao_papel / sessao   → identidade
//   fpl                                                 → ficha principal (Blocos A, B, E)
//   audicao                                             → Bloco D.1 + D.2 (categoria distingue)
//   interacao_integra                                   → Bloco D.3 (ingestão JSON UnIT, read-only)
//   evento                                              → audit log append-only
//   versao_fpl                                          → snapshots (substituibilidade)
//   tentativa_login / conta_bloqueada                   → security
//   anexo                                               → ficheiros no filesystem
//
// Sem: comprovativo, chave_assinatura, contributo_consulta, entidade_rtri,
// notificacao, outbox_email, auditoria_qa (todo o ciclo QA passou a viver
// no audit log).

import { db, initDb } from './db.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS utilizador (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  nome_completo TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1,
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
  PRIMARY KEY (utilizador_id, papel, gabinete_id)
);

CREATE TABLE IF NOT EXISTS sessao (
  id TEXT PRIMARY KEY,
  utilizador_id TEXT NOT NULL REFERENCES utilizador(id),
  criada_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_em TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessao_user ON sessao(utilizador_id);

CREATE TABLE IF NOT EXISTS fpl (
  id TEXT PRIMARY KEY,
  numero_processo TEXT UNIQUE NOT NULL,
  tipo_diploma TEXT NOT NULL,
  titulo TEXT NOT NULL,
  titulo_curto TEXT,
  gabinete_id TEXT NOT NULL REFERENCES gabinete(id),
  coproponentes TEXT, -- JSON array de gabinete_ids
  estado TEXT NOT NULL DEFAULT 'RASCUNHO',
  -- Bloco B
  tipo_origem TEXT,
  referencia_origem TEXT,
  sintese_problema TEXT,
  avaliacao_previa INTEGER,
  -- Bloco E (ConsultaLex simplificado: link + n.º + síntese)
  cl_link TEXT,
  cl_n_contributos INTEGER,
  cl_sintese TEXT,
  -- Publicação
  referencia_dr TEXT,
  data_publicacao TEXT,
  -- Marcos (timestamps de transição)
  m0_em TEXT, m0_por TEXT,
  m1_em TEXT, m1_por TEXT,
  m2_em TEXT,
  m3_em TEXT,
  m4_em TEXT, m4_por TEXT,
  m5_em TEXT, m5_por TEXT,
  -- Integridade (hash SHA-256 do snapshot publicado)
  hash_publicacao TEXT,
  -- Versionamento
  versao_atual INTEGER NOT NULL DEFAULT 1,
  data_criacao TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  criado_por TEXT REFERENCES utilizador(id),
  CONSTRAINT estado_valido CHECK (estado IN
    ('RASCUNHO','EM_RSE','EM_CONSULTA_PUBLICA','EM_CM','APROVADO','PUBLICADO','ARQUIVADO'))
);
CREATE INDEX IF NOT EXISTS idx_fpl_gabinete ON fpl(gabinete_id);
CREATE INDEX IF NOT EXISTS idx_fpl_estado ON fpl(estado);

-- Bloco D.1 (audições obrigatórias) e D.2 (audições GSEPCM/discricionárias).
-- Mesma estrutura; distingue-se pela coluna categoria.
CREATE TABLE IF NOT EXISTS audicao (
  id TEXT PRIMARY KEY,
  fpl_id TEXT NOT NULL REFERENCES fpl(id) ON DELETE CASCADE,
  categoria TEXT NOT NULL,            -- 'OBRIGATORIA' | 'GSEPCM'
  entidade TEXT NOT NULL,
  base_legal TEXT,                    -- relevante para obrigatórias
  forma TEXT,                         -- 'ESCRITA' | 'AUDIENCIA' | 'OUTRO'
  data_pedido TEXT,
  data_resposta TEXT,
  estado TEXT NOT NULL DEFAULT 'PEDIDA',  -- PEDIDA | RESPONDEU | DISPENSOU | SEM_RESPOSTA
  sintese_posicao TEXT,
  decisao_incorporacao TEXT,
  justificacao_decisao TEXT,
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TEXT,
  CONSTRAINT categoria_valida CHECK (categoria IN ('OBRIGATORIA','GSEPCM')),
  CONSTRAINT estado_valido CHECK (estado IN ('PEDIDA','RESPONDEU','DISPENSOU','SEM_RESPOSTA'))
);
CREATE INDEX IF NOT EXISTS idx_audicao_fpl ON audicao(fpl_id);

-- Bloco D.3 — Ingestão JSON do INTEGRA (UnIT).
-- Apresentação read-only na ficha; representa interações pré-legislativas
-- já registadas no sistema da UnIT por outros gabinetes para este diploma.
CREATE TABLE IF NOT EXISTS interacao_integra (
  id TEXT PRIMARY KEY,
  fpl_id TEXT NOT NULL REFERENCES fpl(id) ON DELETE CASCADE,
  gabinete_origem TEXT NOT NULL,      -- sigla do gabinete que produziu o INTEGRA
  payload TEXT NOT NULL,              -- JSON cru da entrada (preservação fiel)
  data_interacao TEXT,                -- extraído do JSON quando disponível
  entidade TEXT,                      -- idem
  importado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  importado_por TEXT REFERENCES utilizador(id)
);
CREATE INDEX IF NOT EXISTS idx_integra_fpl ON interacao_integra(fpl_id);

-- Audit log append-only. Substitui auditoria_qa e parte da notificação.
CREATE TABLE IF NOT EXISTS evento (
  id TEXT PRIMARY KEY,
  fpl_id TEXT,
  tipo TEXT NOT NULL,
  autor_id TEXT,
  timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payload TEXT,
  ip TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_evento_fpl ON evento(fpl_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_evento_tipo ON evento(tipo, timestamp DESC);

-- Versões: snapshot em JSON canónico para garantir substituibilidade.
CREATE TABLE IF NOT EXISTS versao_fpl (
  id TEXT PRIMARY KEY,
  fpl_id TEXT NOT NULL REFERENCES fpl(id),
  numero INTEGER NOT NULL,
  autor_id TEXT NOT NULL REFERENCES utilizador(id),
  timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  snapshot_json TEXT NOT NULL,
  marco TEXT,
  descricao TEXT,
  UNIQUE (fpl_id, numero)
);
CREATE INDEX IF NOT EXISTS idx_versao_fpl ON versao_fpl(fpl_id, numero DESC);

CREATE TABLE IF NOT EXISTS anexo (
  id TEXT PRIMARY KEY,
  fpl_id TEXT NOT NULL REFERENCES fpl(id),
  bloco TEXT,
  entrada_id TEXT,
  nome_original TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  tamanho_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  visibilidade TEXT NOT NULL DEFAULT 'INTERNO',
  upload_por TEXT NOT NULL REFERENCES utilizador(id),
  upload_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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

CREATE TABLE IF NOT EXISTS conta_bloqueada (
  email TEXT PRIMARY KEY,
  bloqueada_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  desbloqueia_em TEXT NOT NULL,
  motivo TEXT
);
`;

// Migrações incrementais — só ALTER TABLE ADD COLUMN para SQLite (idempotente).
// Falhas com "duplicate column name" são ignoradas (coluna já existe).
const MIGRATIONS = [
  // 2026-06 — datas previstas dos marcos M0/M2/M3/M4/M5 (ponto focal define)
  // + datas reais do período da consulta pública (cl_inicio, cl_fim).
  // Usadas no cronograma calendário para mostrar planeamento e marcos no calendário.
  'ALTER TABLE fpl ADD COLUMN cl_inicio TEXT',
  'ALTER TABLE fpl ADD COLUMN cl_fim TEXT',
  'ALTER TABLE fpl ADD COLUMN m0_prevista TEXT',
  'ALTER TABLE fpl ADD COLUMN m2_prevista TEXT',
  'ALTER TABLE fpl ADD COLUMN m3_prevista TEXT',
  'ALTER TABLE fpl ADD COLUMN m4_prevista TEXT',
  'ALTER TABLE fpl ADD COLUMN m5_prevista TEXT',
];

async function aplicarMigracoes() {
  for (const sql of MIGRATIONS) {
    try { await db.exec(sql); }
    catch (e) {
      // SQLite reporta "duplicate column name: X" se coluna já existe — ignorar
      if (!/duplicate column|already exists/i.test(e.message)) throw e;
    }
  }
}

export async function migrate() {
  await initDb();
  await db.exec(SCHEMA);
  await aplicarMigracoes();
  return { driver: 'sqlite', tabelas: (SCHEMA.match(/CREATE TABLE/g) || []).length };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('migrate.js')) {
  migrate()
    .then(r => { console.log(`✓ Schema aplicado (${r.tabelas} tabelas).`); process.exit(0); })
    .catch(e => { console.error('✗ Falha:', e.message); process.exit(1); });
}
