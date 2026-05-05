import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'fpl.sqlite');
export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS utilizador (
      id TEXT PRIMARY KEY,
      nif TEXT UNIQUE,
      email TEXT NOT NULL UNIQUE,
      nome_completo TEXT NOT NULL,
      password_hash TEXT NOT NULL,
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
      m1_validado_em TEXT,
      m2_validado_em TEXT,
      m3_validado_em TEXT, m3_validado_por TEXT, m3_declaracao TEXT,
      m4_validado_em TEXT, m4_validado_por TEXT, m4_declaracao TEXT,
      m5_validado_em TEXT,
      referencia_dr TEXT,
      data_criacao TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      data_publicacao TEXT,
      versao_atual INTEGER NOT NULL DEFAULT 1,
      regime_simplificado TEXT,
      criado_por TEXT REFERENCES utilizador(id)
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
      estado_correcao TEXT DEFAULT 'PENDENTE'
    );

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
  `);

  // Migrações idempotentes: adicionar colunas que faltem (TOTP, federação)
  try { db.exec("ALTER TABLE utilizador ADD COLUMN totp_secret TEXT"); } catch {}
  try { db.exec("ALTER TABLE utilizador ADD COLUMN totp_ativo INTEGER NOT NULL DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE utilizador ADD COLUMN federacao_provider TEXT"); } catch {}
  try { db.exec("ALTER TABLE utilizador ADD COLUMN federacao_subject TEXT"); } catch {}
}

init();
