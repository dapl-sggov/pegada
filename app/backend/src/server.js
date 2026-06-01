// server.js — Arranque mínimo.
// SQLite + Express. Sem Redis, sem workers de outbox, sem polling DRE.

import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import config, { assertConfigProducao } from './config.js';
import { initDb } from './db.js';
import { migrate } from './migrate.js';
import { initStorage } from './storage.js';
import { authMiddleware } from './auth.js';
import { securityHeaders, rateLimit, ensureCsrfToken, requireCsrf } from './security.js';
import { iniciarBackupPeriodico, pararBackupPeriodico } from './backup.js';
import routes from './routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function buildApp(opts = {}) {
  const { servirFrontend = true, iniciarWorkers = true } = opts;
  assertConfigProducao();

  await initDb();
  await migrate();
  await initStorage();

  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use(securityHeaders);
  app.use(cookieParser());
  app.use(express.json({ limit: '4mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(ensureCsrfToken);
  app.use(authMiddleware);
  app.use('/api', rateLimit({ max: 240, windowMs: 60_000 }));
  app.use('/api', requireCsrf);
  app.use('/api', routes);

  app.get('/health', async (req, res) => {
    try {
      await (await import('./db.js')).db.get('SELECT 1');
      res.json({ ok: true, ts: new Date().toISOString(), driver: 'sqlite', auth: config.auth.driver });
    } catch (e) {
      res.status(503).json({ ok: false, error: e.message });
    }
  });

  if (servirFrontend) {
    const frontendDir = path.resolve(__dirname, '../../frontend');
    const demoDir = path.resolve(__dirname, '../../../demo');
    const mockDir = path.resolve(__dirname, '../../../mock');
    app.use('/demo', express.static(demoDir));
    app.use('/mock', express.static(mockDir));
    app.use(express.static(frontendDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/demo') || req.path.startsWith('/mock')) return next();
      res.sendFile(path.join(frontendDir, 'index.html'), err => err && next());
    });
  }

  app.use((err, req, res, next) => {
    console.error('[erro]', err.message);
    res.status(err.status || 500).json({ error: err.message || 'Erro interno' });
  });

  if (iniciarWorkers) iniciarBackupPeriodico();

  const stop = async () => {
    pararBackupPeriodico();
    await (await import('./db.js')).db.close().catch(() => {});
  };

  return { app, stop };
}

async function boot() {
  const { app } = await buildApp();
  const server = app.listen(config.port, () => {
    console.log(`✓ FPL Ponte (simplificado) em http://localhost:${config.port}`);
    console.log(`  ambiente: ${config.env} · auth: ${config.auth.driver}`);
    console.log(`  • Frontend:  http://localhost:${config.port}/`);
    console.log(`  • API:       http://localhost:${config.port}/api/`);
    console.log(`  • Health:    http://localhost:${config.port}/health`);
  });
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => { console.log(`\n${sig} — a encerrar...`); server.close(); pararBackupPeriodico(); process.exit(0); });
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  boot().catch(e => { console.error('✗ Falha no arranque:', e.message); process.exit(1); });
}
