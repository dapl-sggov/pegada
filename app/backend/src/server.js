// server.js — Arranque da aplicação FPL Ponte.
// Boot assíncrono: inicializa BD, cache, storage e o módulo de comprovativo
// antes de aceitar tráfego. Serve a API e o frontend estático.

import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import config, { assertConfigProducao } from './config.js';
import { initDb, DRIVER } from './db.js';
import { migrate } from './migrate.js';
import { initCache, cache } from './cache.js';
import { initStorage, storage } from './storage.js';
import { initComprovativo } from './comprovativo.js';
import { authMiddleware } from './auth.js';
import { securityHeaders, rateLimit, ensureCsrfToken, requireCsrf } from './security.js';
import { processarOutbox } from './notificacoes.js';
import routes from './routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function boot() {
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
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
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

  // Frontend estático
  const frontendDir = path.resolve(__dirname, '../../frontend');
  app.use(express.static(frontendDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(frontendDir, 'index.html'), err => err && next());
  });

  // Error handler
  app.use((err, req, res, next) => {
    console.error('[erro]', err.message);
    res.status(err.status || 500).json({ error: err.message || 'Erro interno' });
  });

  // Worker do outbox de email
  const outboxTimer = setInterval(() => {
    processarOutbox().catch(e => console.warn('[outbox]', e.message));
  }, 30_000);
  outboxTimer.unref?.();

  const server = app.listen(config.port, () => {
    console.log(`✓ FPL Ponte a escutar em http://localhost:${config.port}`);
    console.log(`  ambiente: ${config.env} · BD: ${DRIVER} · cache: ${cache.driver} · storage: ${storage.driver}`);
    console.log(`  comprovativo: ${cmpInfo.algoritmo} kid=${cmpInfo.kid}`);
    console.log(`  • Frontend:  http://localhost:${config.port}/`);
    console.log(`  • API:       http://localhost:${config.port}/api/`);
    console.log(`  • Health:    http://localhost:${config.port}/health`);
    console.log(`  • JWKS:      http://localhost:${config.port}/api/.well-known/fpl-jwks.json`);
  });

  // Encerramento gracioso
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, async () => {
      console.log(`\n${sig} recebido — a encerrar...`);
      server.close();
      await cache.close().catch(() => {});
      await (await import('./db.js')).db.close().catch(() => {});
      process.exit(0);
    });
  }
}

boot().catch(e => {
  console.error('✗ Falha no arranque:', e.message);
  process.exit(1);
});
