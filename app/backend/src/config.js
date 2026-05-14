// config.js — Configuração central 12-factor.
// Toda a configuração vem de variáveis de ambiente, com defaults para
// desenvolvimento local. NUNCA colocar segredos reais neste ficheiro.
//
// Em produção (CEGER on-premises) as variáveis são injetadas pelo
// orquestrador de containers ou por ficheiro .env não versionado.

function bool(v, def = false) {
  if (v === undefined || v === null || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}
function int(v, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}
function req(name, value, { allowDevDefault } = {}) {
  if (value) return value;
  if (process.env.NODE_ENV === 'production' && !allowDevDefault) {
    throw new Error(`Configuração obrigatória em falta: ${name}. Defina a variável de ambiente.`);
  }
  return allowDevDefault;
}

const env = process.env;
const NODE_ENV = env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';

export const config = {
  env: NODE_ENV,
  isProd,

  // --- HTTP ---
  port: int(env.PORT, 3717),
  // Origem pública (para cookies secure, CORS, links em emails)
  publicUrl: env.PUBLIC_URL || `http://localhost:${int(env.PORT, 3717)}`,
  trustProxy: bool(env.TRUST_PROXY, isProd), // atrás de reverse proxy no CEGER

  // --- Base de dados (PostgreSQL) ---
  // Em dev, se DATABASE_URL não estiver definida, o arranque cai para
  // SQLite (modo legado) — ver db.js. Em produção é obrigatória.
  database: {
    url: req('DATABASE_URL', env.DATABASE_URL, {
      allowDevDefault: 'postgres://fpl:fpl@localhost:5432/fpl',
    }),
    poolMax: int(env.DB_POOL_MAX, 10),
    ssl: bool(env.DB_SSL, false),
    // Permite forçar o modo legado SQLite mesmo com DATABASE_URL definida
    forceSqlite: bool(env.DB_FORCE_SQLITE, false),
  },

  // --- Cache / sessões / rate-limit (Redis) ---
  redis: {
    url: env.REDIS_URL || 'redis://localhost:6379',
    // Se Redis estiver indisponível, os módulos caem para implementação
    // in-memory (degradação graciosa) — adequado para dev, não para
    // produção com mais de uma réplica.
    optional: bool(env.REDIS_OPTIONAL, !isProd),
  },

  // --- Object storage (S3-compatível: MinIO no CEGER) ---
  storage: {
    // 's3' usa MinIO/S3; 'fs' usa filesystem local (modo legado/dev)
    driver: env.STORAGE_DRIVER || (isProd ? 's3' : 'fs'),
    s3: {
      endpoint: env.S3_ENDPOINT || 'http://localhost:9000',
      region: env.S3_REGION || 'pt-ceger-1',
      bucket: env.S3_BUCKET || 'fpl-anexos',
      accessKey: req('S3_ACCESS_KEY', env.S3_ACCESS_KEY, { allowDevDefault: 'fpl-minio' }),
      secretKey: req('S3_SECRET_KEY', env.S3_SECRET_KEY, { allowDevDefault: 'fpl-minio-secret' }),
      forcePathStyle: bool(env.S3_FORCE_PATH_STYLE, true), // MinIO exige path-style
    },
    fsDir: env.STORAGE_FS_DIR || './data/anexos',
    maxBytes: int(env.STORAGE_MAX_BYTES, 20 * 1024 * 1024), // 20 MB
  },

  // --- Autenticação ---
  auth: {
    jwtSecret: req('JWT_SECRET', env.JWT_SECRET, {
      allowDevDefault: 'demo-fpl-ponte-jwt-secret-change-in-prod',
    }),
    jwtTtl: env.JWT_TTL || '8h',
    cookieName: env.SESSION_COOKIE_NAME || 'fpl_session',
    cookieSecure: bool(env.COOKIE_SECURE, isProd),
    bcryptRounds: int(env.BCRYPT_ROUNDS, 10),
    // Federação OIDC (autenticação.gov.pt) — desativada na v1.0 por decisão
    // SGGOV. A flag fica preparada para ativação futura sem refactor.
    oidc: {
      enabled: bool(env.OIDC_ENABLED, false),
      issuer: env.OIDC_ISSUER || '',
      clientId: env.OIDC_CLIENT_ID || '',
      clientSecret: env.OIDC_CLIENT_SECRET || '',
      redirectUri: env.OIDC_REDIRECT_URI || '',
    },
  },

  // --- Email transacional (SMTP do Estado / CEGER) ---
  email: {
    // 'outbox' guarda em base de dados sem enviar (dev/staging);
    // 'smtp' envia através do servidor configurado (produção).
    driver: env.EMAIL_DRIVER || (isProd ? 'smtp' : 'outbox'),
    from: env.EMAIL_FROM || 'pegada-legislativa@sggoverno.gov.pt',
    smtp: {
      host: env.SMTP_HOST || '',
      port: int(env.SMTP_PORT, 587),
      secure: bool(env.SMTP_SECURE, false),
      user: env.SMTP_USER || '',
      pass: env.SMTP_PASS || '',
    },
  },

  // --- Integrações externas ---
  // Cada adapter tem modo 'mock' (dados locais) e 'http' (serviço real).
  // A v1.0 arranca em 'mock'; muda-se para 'http' quando os serviços
  // externos estiverem disponíveis e contratualizados.
  rtri: {
    mode: env.RTRI_MODE || 'mock', // mock | http
    baseUrl: env.RTRI_BASE_URL || '',
    apiKey: env.RTRI_API_KEY || '',
    syncCron: env.RTRI_SYNC_CRON || '0 3 * * *', // batch diário às 03:00
  },
  consultaLex: {
    mode: env.CONSULTA_LEX_MODE || 'manual', // manual | webhook | http
    webhookKey: req('CL_WEBHOOK_KEY', env.CL_WEBHOOK_KEY, {
      allowDevDefault: 'cl-demo-key-change-in-prod',
    }),
    baseUrl: env.CONSULTA_LEX_BASE_URL || '',
  },
  dre: {
    mode: env.DRE_MODE || 'manual', // manual | http
    baseUrl: env.DRE_BASE_URL || 'https://dre.pt',
  },

  // --- Observabilidade ---
  observability: {
    metricsEnabled: bool(env.METRICS_ENABLED, true),
    logLevel: env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
    logFormat: env.LOG_FORMAT || (isProd ? 'json' : 'pretty'),
  },

  // --- Retenção de dados (decisão SGGOV) ---
  retention: {
    // Dados das FPL: indefinido (interesse público / transparência)
    logsDias: int(env.RETENTION_LOGS_DIAS, 5 * 365), // logs operacionais: 5 anos
    sessoesDias: int(env.RETENTION_SESSOES_DIAS, 30), // sessões: 30 dias
    tentativasLoginDias: int(env.RETENTION_TENTATIVAS_DIAS, 7),
  },
};

// Validação de arranque: em produção, exigir segredos não-default.
export function assertConfigProducao() {
  if (!isProd) return;
  const fracos = [];
  if (config.auth.jwtSecret.includes('demo')) fracos.push('JWT_SECRET');
  if (config.consultaLex.webhookKey.includes('demo')) fracos.push('CL_WEBHOOK_KEY');
  if (config.storage.driver === 's3' && config.storage.s3.secretKey.includes('minio-secret')) fracos.push('S3_SECRET_KEY');
  if (fracos.length) {
    throw new Error(
      `Segredos com valor de demonstração em produção: ${fracos.join(', ')}. ` +
      `Defina valores reais antes do arranque.`
    );
  }
}

export default config;
