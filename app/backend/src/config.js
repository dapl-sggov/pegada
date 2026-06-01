// config.js — Configuração mínima.
//
// Filosofia do FPL Ponte: este sistema é TEMPORÁRIO (até o SmartLegis
// incorporar a funcionalidade ou a Plataforma IntGov ficar operacional,
// ~2027). É deliberadamente leve. Não tem Redis, Postgres, SMTP outbox,
// JWS, LDAP, federação simulada, métricas Prometheus. Tudo isso foi
// removido como parte da simplificação.
//
// Persistência: SQLite (1 ficheiro).
// Autenticação: Entra ID (Microsoft 365 do Governo) em produção; mock em dev.
// Backup: cópia diária do JSON canónico para uma pasta (SharePoint montado
// como pasta sincronizada na VM, em produção).

function bool(v, def = false) {
  if (v === undefined || v === null || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}
function int(v, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

const env = process.env;
const NODE_ENV = env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';

export const config = {
  env: NODE_ENV,
  isProd,

  // --- HTTP ---
  port: int(env.PORT, 3717),
  publicUrl: env.PUBLIC_URL || `http://localhost:${int(env.PORT, 3717)}`,
  trustProxy: bool(env.TRUST_PROXY, isProd),

  // --- Base de dados (sempre SQLite, 1 ficheiro) ---
  database: {
    file: env.DATABASE_FILE || '', // resolvido em db.js para data/fpl.sqlite
  },

  // --- Autenticação ---
  // Driver `mock` (dev): faz login a partir de uma lista interna de utilizadores
  // demo. Driver `entra`: redireciona para Entra ID (OIDC) — stub a preencher
  // quando a DSTD fornecer tenantId/clientId/clientSecret.
  auth: {
    driver: env.AUTH_DRIVER || (isProd ? 'entra' : 'mock'),
    cookieName: env.SESSION_COOKIE_NAME || 'fpl_session',
    cookieSecure: bool(env.COOKIE_SECURE, isProd),
    sessionSecret: env.SESSION_SECRET || 'fpl-ponte-dev-secret-change-in-prod',
    sessionTtlHours: int(env.SESSION_TTL_HOURS, 8),
    entra: {
      tenantId: env.ENTRA_TENANT_ID || '',
      clientId: env.ENTRA_CLIENT_ID || '',
      clientSecret: env.ENTRA_CLIENT_SECRET || '',
      redirectUri: env.ENTRA_REDIRECT_URI || '',
      // Mapeamento de email → papel SGGOV (CSV simples).
      // Ex: "maria.silva@sggoverno.gov.pt:SGGOV_ADMIN;rui.santos@sggoverno.gov.pt:SGGOV_QA"
      // Os pontos focais de gabinete ganham o papel PONTO_FOCAL pelo domínio do
      // email (ex: @maen.gov.pt → PONTO_FOCAL do gabinete MAEN).
      adminMap: env.ENTRA_ADMIN_MAP || '',
    },
  },

  // --- Anexos (filesystem local) ---
  storage: {
    dir: env.STORAGE_DIR || './data/anexos',
    maxBytes: int(env.STORAGE_MAX_BYTES, 20 * 1024 * 1024), // 20 MB
  },

  // --- Backup do JSON canónico ---
  // Em produção esta pasta é o ponto de montagem da pasta SharePoint
  // (OneDrive client sincronizado pelo serviço Microsoft 365 na VM).
  backup: {
    dir: env.BACKUP_DIR || './data/backup',
    intervaloHoras: int(env.BACKUP_INTERVALO_HORAS, 24),
  },

  // --- Retenção ---
  retention: {
    sessoesDias: int(env.RETENTION_SESSOES_DIAS, 30),
    tentativasLoginDias: int(env.RETENTION_TENTATIVAS_DIAS, 7),
  },
};

export function assertConfigProducao() {
  if (!isProd) return;
  if (config.auth.driver !== 'entra') {
    throw new Error('AUTH_DRIVER tem de ser "entra" em produção.');
  }
  const e = config.auth.entra;
  if (!e.tenantId || !e.clientId || !e.clientSecret || !e.redirectUri) {
    throw new Error('Configuração Entra ID incompleta — verifique ENTRA_TENANT_ID, ENTRA_CLIENT_ID, ENTRA_CLIENT_SECRET, ENTRA_REDIRECT_URI.');
  }
  if (config.auth.sessionSecret.includes('dev-secret')) {
    throw new Error('SESSION_SECRET com valor de demonstração em produção.');
  }
}

export default config;
