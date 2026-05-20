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
  // Origem da aplicação (cookies secure, links em emails). Dentro da RING
  // não há "origem pública" — esta URL é o endereço interno da aplicação.
  publicUrl: env.PUBLIC_URL || `http://localhost:${int(env.PORT, 3717)}`,
  trustProxy: bool(env.TRUST_PROXY, isProd), // atrás de reverse proxy interno da RING

  // --- Rede / confinamento ---
  // A aplicação opera exclusivamente dentro da Rede Informática do Governo
  // (RING), com acesso mediado por VPN. Não há exposição à internet pública.
  // Decisão: Memorando Executivo, Princípio 1 · RCM v2, n.º 11.1.
  network: {
    confinadoRing: bool(env.CONFINADO_RING, isProd),
    // Em RING não há CORS aberto: o frontend é servido pela própria app
    // (mesma origem). Origens adicionais só por configuração explícita.
    corsOrigins: (env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  },

  // --- Base de dados ---
  // Em dev, se DATABASE_URL não estiver definida, o arranque cai para SQLite
  // (driver dual — ver db.js): zero dependências externas para desenvolver.
  // Em produção, DATABASE_URL (PostgreSQL) é obrigatória.
  database: {
    url: req('DATABASE_URL', env.DATABASE_URL, { allowDevDefault: '' }),
    poolMax: int(env.DB_POOL_MAX, 10),
    ssl: bool(env.DB_SSL, false),
    // Força o modo SQLite mesmo com DATABASE_URL definida (transição/diagnóstico)
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
  // Modelo de duas camadas (Memorando Executivo, Princípio 1 · RCM v2, n.º 11.1):
  //   1. acesso à RING mediado por VPN (fora do âmbito desta aplicação)
  //   2. autenticação aplicacional contra o diretório interno dos serviços
  //      (LDAP/AD), com TOTP para papéis sensíveis
  auth: {
    jwtSecret: req('JWT_SECRET', env.JWT_SECRET, {
      allowDevDefault: 'demo-fpl-ponte-jwt-secret-change-in-prod',
    }),
    jwtTtl: env.JWT_TTL || '8h',
    cookieName: env.SESSION_COOKIE_NAME || 'fpl_session',
    cookieSecure: bool(env.COOKIE_SECURE, isProd),
    bcryptRounds: int(env.BCRYPT_ROUNDS, 10),
    // Diretório interno dos serviços (LDAP/AD). Em dev/protótipo, o driver
    // 'local' usa utilizadores na base de dados a simular o diretório;
    // em produção, 'ldap' liga ao diretório real — mudança de config, sem refactor.
    diretorio: {
      driver: env.DIRECTORY_DRIVER || 'local', // local | ldap | http
      // LDAP / Active Directory
      ldapUrl: env.LDAP_URL || '',                  // ex: ldaps://dc.gov.pt:636
      ldapBaseDn: env.LDAP_BASE_DN || '',           // ex: OU=Pessoal,DC=gov,DC=pt
      ldapBindDn: env.LDAP_BIND_DN || '',           // conta de serviço para pesquisar
      ldapBindPassword: env.LDAP_BIND_PASSWORD || '',
      // HTTP REST (alternativa: broker interno do CEGER ou outro front-end)
      httpUrl: env.DIRECTORY_HTTP_URL || '',
      httpAuth: env.DIRECTORY_HTTP_AUTH || '',      // header `authorization` opcional
    },
    // TOTP obrigatório para papéis sensíveis
    totpRequiredRoles: (env.TOTP_REQUIRED_ROLES || 'SGGOV_ADMIN,SGGOV_QA')
      .split(',').map(s => s.trim()).filter(Boolean),
    // Federação OIDC: NÃO usada na v1.0. O confinamento à RING torna-a
    // desnecessária (decisão expressa do Memorando Executivo). A estrutura
    // fica documentada para eventual reavaliação futura, mas não está ativa.
    oidc: { enabled: false },
  },

  // --- Comprovativo criptográfico ---
  // Em cada marco bloqueante (M0, M1, M4, M5) a aplicação emite um JWS
  // assinado (Ed25519). O SmartLegis verifica-o offline com a chave pública
  // e bloqueia a tramitação se a verificação falhar.
  // Decisão: Memorando Executivo, Princípio 2 · RCM v2, n.º 4.
  // Nota: o desenho de marcos foi atualizado (CP depois da RSE) — M1
  // substitui o antigo M3 como marco bloqueante de pré-RSE.
  comprovativo: {
    algoritmo: 'EdDSA', // Ed25519
    issuer: env.COMPROVATIVO_ISSUER || 'fpl.sggov.ring',
    // Identificador da chave ativa para emissão (header `kid` do JWS).
    keyId: env.COMPROVATIVO_KEY_ID || 'fpl-dev-2026-01',
    // Chave privada Ed25519 em PEM (PKCS#8). NUNCA na base de dados nem
    // versionada. Em produção vive no cofre de segredos; é injetada por
    // env var ou caminho de ficheiro protegido.
    privateKeyPem: env.COMPROVATIVO_PRIVATE_KEY_PEM || '',
    privateKeyPath: env.COMPROVATIVO_PRIVATE_KEY_PATH || '',
    // Se nenhuma chave for fornecida em dev, o módulo gera um par efémero
    // ao arranque (apenas para desenvolvimento — avisa nos logs).
    allowEphemeralDevKey: bool(env.COMPROVATIVO_ALLOW_EPHEMERAL, !isProd),
    // Validade do comprovativo. A revogação efetiva faz-se por estado na BD;
    // o exp é uma salvaguarda adicional.
    ttlDias: int(env.COMPROVATIVO_TTL_DIAS, 365),
    // Marcos que emitem comprovativo
    marcosBloqueantes: ['M0', 'M1', 'M4', 'M5'],
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

// Validação de arranque: em produção, exigir segredos não-default e
// configuração coerente com o confinamento à RING.
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
  // O comprovativo criptográfico exige chave persistente em produção —
  // uma chave efémera invalidaria todos os comprovativos a cada reinício.
  if (!config.comprovativo.privateKeyPem && !config.comprovativo.privateKeyPath) {
    throw new Error(
      'Chave privada do comprovativo criptográfico em falta. Defina ' +
      'COMPROVATIVO_PRIVATE_KEY_PEM ou COMPROVATIVO_PRIVATE_KEY_PATH. ' +
      'Gerar: openssl genpkey -algorithm ed25519 -out fpl-comprovativo.pem'
    );
  }
  // Confinamento à RING: em produção a aplicação não deve aceitar CORS aberto.
  if (config.network.corsOrigins.includes('*')) {
    throw new Error('CORS_ORIGINS não pode incluir "*" em produção (confinamento à RING).');
  }
}

export default config;
