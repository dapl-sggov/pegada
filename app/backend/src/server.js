// server.js — Arranque da aplicação FPL Ponte.
// Boot assíncrono: inicializa BD, cache, storage e o módulo de comprovativo
// antes de aceitar tráfego. Serve a API e o frontend estático.
//
// `buildApp()` é exportado para reutilização pelos testes de integração
// (montam o app sem chamar `app.listen()` por si próprios).

import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import config, { assertConfigProducao } from './config.js';
import { initDb, DRIVER } from './db.js';
import { migrate } from './migrate.js';
import { initCache, cache } from './cache.js';
import { initStorage, storage } from './storage.js';
import { initComprovativo } from './comprovativo.js';
import { authMiddleware } from './auth.js';
import { securityHeaders, rateLimit, ensureCsrfToken, requireCsrf } from './security.js';
import { processarOutbox } from './notificacoes.js';
import { iniciarWorkerSincronizacao as iniciarRtriWorker } from './rtri.js';
import { iniciarWorkerPolling as iniciarDreWorker } from './dre.js';
import { metricsMiddleware, metricsHandler } from './metrics.js';
import routes from './routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Constrói e devolve o express app pronto a servir.
 * Inicializa subsistemas (BD, cache, storage, comprovativo) ANTES de devolver.
 * @param {object} opts
 * @param {boolean} [opts.servirFrontend=true]  servir os ficheiros estáticos do frontend
 * @param {boolean} [opts.iniciarWorkers=true]  iniciar o worker periódico do outbox
 * @returns {{app: import('express').Express, cmpInfo: object, stop: () => Promise<void>}}
 */
export async function buildApp(opts = {}) {
  const { servirFrontend = true, iniciarWorkers = true } = opts;
  assertConfigProducao();

  // Subsistemas
  await initDb();
  await migrate();
  await initCache();
  await initStorage();
  const cmpInfo = await initComprovativo();

  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  // CORS: dentro da RING, sem origens externas (config.network.corsOrigins)
  app.use(cors({
    origin: config.network.corsOrigins.length ? config.network.corsOrigins : true,
    credentials: true,
  }));

  app.use(securityHeaders);
  app.use(metricsMiddleware);
  app.use(cookieParser());
  // Em rotas de webhook (`/api/hooks/*`) preservamos o corpo cru para
  // verificação HMAC. Noutras rotas é descartado para poupar memória.
  app.use(express.json({
    limit: '2mb',
    verify: (req, _res, buf) => {
      if (req.path && req.path.startsWith('/api/hooks/')) {
        req.rawBody = buf;
      }
    },
  }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(ensureCsrfToken);
  app.use(authMiddleware);
  app.use('/api', rateLimit({ max: 240, windowMs: 60_000 }));
  app.use('/api', requireCsrf);
  app.use('/api', routes);

  // Health e métricas
  app.get('/health', async (req, res) => {
    try {
      await import('./db.js').then(m => m.db.get('SELECT 1 as ok'));
      res.json({
        ok: true, ts: new Date().toISOString(),
        db: DRIVER, cache: cache.driver, storage: storage.driver, comprovativo_kid: cmpInfo.kid,
      });
    } catch (e) {
      res.status(503).json({ ok: false, error: e.message });
    }
  });

  // /metrics — formato exposição Prometheus (text/plain).
  // Aberto dentro da RING; em produção restringir por firewall/reverse-proxy.
  app.get('/metrics', metricsHandler);

  // Página de "consentimento" simulada da federação (compat. frontend v0.2)
  app.get('/federacao-simulada.html', (req, res) => {
    const state = String(req.query.state || '').replace(/[^a-f0-9]/gi, '');
    res.type('html').send(`<!DOCTYPE html><html lang="pt-PT"><head><meta charset="utf-8">
<title>autenticacao.gov.pt — Demonstração</title><style>
body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#f5f6f8;color:#1a1f2e}
.bar{background:#3b66c4;color:#fff;padding:12px 24px;font-weight:600}
.card{max-width:480px;margin:60px auto;background:#fff;border-radius:8px;padding:32px;box-shadow:0 8px 24px rgba(10,49,97,.12)}
h1{font-size:18px;margin-bottom:8px;color:#0a3161}.sub{font-size:13px;color:#5b6478;margin-bottom:20px}
label{display:block;font-size:11px;text-transform:uppercase;font-weight:600;color:#5b6478;margin-bottom:5px}
input{width:100%;padding:10px;border:1px solid #e1e4e8;border-radius:4px;font-size:14px}
.btn{padding:10px 20px;background:#3b66c4;color:#fff;border:none;border-radius:4px;cursor:pointer;width:100%;margin-top:12px}
.demo{margin-top:18px;padding:12px;background:#fff8e6;border-radius:4px;font-size:12px;color:#7a4a00}
.demo li{cursor:pointer;padding:4px}.demo code{background:rgba(0,0,0,.06);padding:1px 4px;border-radius:2px}
</style></head><body><div class="bar">autenticacao.gov.pt · Demonstração</div>
<div class="card"><h1>Autorizar acesso à FPL Ponte</h1>
<div class="sub">A aplicação solicita o seu nome e NIF para iniciar sessão.</div>
<form id="cf"><input type="hidden" name="state" value="${state}">
<label>NIF</label><input name="nif" id="nif" placeholder="100000001" required>
<button class="btn" type="submit">Autorizar com Cartão de Cidadão</button></form>
<div class="demo"><strong>Modo demonstração</strong> · NIFs de teste:
<ul><li onclick="nif.value='100000001'">Maria Silva (PF MAE) · <code>100000001</code></li>
<li onclick="nif.value='100000005'">Rui Ferreira (SGGOV QA) · <code>100000005</code></li>
<li onclick="nif.value='100000006'">Carla Almeida (SGGOV Admin) · <code>100000006</code></li></ul></div></div>
<script>document.getElementById('cf').addEventListener('submit',async e=>{e.preventDefault();
const fd=new FormData(e.target);
const r=await fetch('/api/auth/federacao/callback',{method:'POST',credentials:'include',
headers:{'Content-Type':'application/json','x-csrf-token':document.cookie.split('fpl_csrf=')[1]?.split(';')[0]||''},
body:JSON.stringify({state:fd.get('state'),nif:fd.get('nif')})});
if(r.ok)location='/';else{const j=await r.json().catch(()=>({}));alert('Falha: '+(j.error||r.statusText));}});</script>
</body></html>`);
  });

  // Frontend estático + demo standalone
  if (servirFrontend) {
    const frontendDir = path.resolve(__dirname, '../../frontend');
    const demoDir = path.resolve(__dirname, '../../../demo');
    const mockDir = path.resolve(__dirname, '../../../mock');
    // /demo/* serve a demonstração interativa autónoma (HTML + JS + CSS).
    // /mock/* serve a página de apresentação institucional.
    // Ambas úteis para mostrar externamente sem dependências do backend.
    app.use('/demo', express.static(demoDir));
    app.use('/mock', express.static(mockDir));
    app.use(express.static(frontendDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/demo') || req.path.startsWith('/mock')) return next();
      res.sendFile(path.join(frontendDir, 'index.html'), err => err && next());
    });
  }

  // Error handler
  app.use((err, req, res, next) => {
    console.error('[erro]', err.message);
    res.status(err.status || 500).json({ error: err.message || 'Erro interno' });
  });

  // Workers (não correm nos testes)
  let outboxTimer = null;
  if (iniciarWorkers) {
    outboxTimer = setInterval(() => {
      processarOutbox().catch(e => console.warn('[outbox]', e.message));
    }, 30_000);
    outboxTimer.unref?.();
    iniciarRtriWorker();   // sem efeito se RTRI_MODE != 'http'
    iniciarDreWorker();    // sem efeito se DRE_MODE != 'http'
  }

  // stop() encerra workers e subsistemas — usado por testes ou por SIGINT.
  const stop = async () => {
    if (outboxTimer) clearInterval(outboxTimer);
    const { pararWorkerSincronizacao } = await import('./rtri.js');
    const { pararWorkerPolling } = await import('./dre.js');
    pararWorkerSincronizacao();
    pararWorkerPolling();
    await cache.close().catch(() => {});
    await (await import('./db.js')).db.close().catch(() => {});
  };

  return { app, cmpInfo, stop };
}

async function boot() {
  const { app, cmpInfo, stop } = await buildApp();

  const server = app.listen(config.port, () => {
    console.log(`✓ FPL Ponte a escutar em http://localhost:${config.port}`);
    console.log(`  ambiente: ${config.env} · BD: ${DRIVER} · cache: ${cache.driver} · storage: ${storage.driver}`);
    console.log(`  comprovativo: ${cmpInfo.algoritmo} kid=${cmpInfo.kid}`);
    console.log(`  • Frontend:  http://localhost:${config.port}/`);
    console.log(`  • API:       http://localhost:${config.port}/api/`);
    console.log(`  • Health:    http://localhost:${config.port}/health`);
    console.log(`  • Metrics:   http://localhost:${config.port}/metrics`);
    console.log(`  • JWKS:      http://localhost:${config.port}/api/.well-known/fpl-jwks.json`);
  });

  // Encerramento gracioso
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, async () => {
      console.log(`\n${sig} recebido — a encerrar...`);
      server.close();
      await stop();
      process.exit(0);
    });
  }
}

// Só arranca o listener se este ficheiro for o ponto de entrada.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  boot().catch(e => {
    console.error('✗ Falha no arranque:', e.message);
    process.exit(1);
  });
}
