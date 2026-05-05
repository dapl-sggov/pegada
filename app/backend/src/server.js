import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { authMiddleware } from './auth.js';
import { securityHeaders, rateLimit, ensureCsrfToken, requireCsrf, initSecurity } from './security.js';
import { initNotificacoes, processarOutbox } from './notificacoes.js';
import { initConsultaLex } from './consultalex.js';
import routes from './routes.js';
import './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3717;

initSecurity();
initNotificacoes();
initConsultaLex();

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(cors({ origin: true, credentials: true }));

// Middlewares de segurança
app.use(securityHeaders);
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));
// Multipart é tratado dentro do route handler (anexos.js)
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// CSRF token cookie (para todos os pedidos)
app.use(ensureCsrfToken);

// Auth (lê o cookie de sessão)
app.use(authMiddleware);

// Rate limit geral (mais permissivo)
app.use('/api', rateLimit({ max: 240, windowMs: 60_000 }));

// CSRF protection nas mutações
app.use('/api', requireCsrf);

// API
app.use('/api', routes);

// Health
app.get('/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// Página de "consentimento" simulada para a federação CC/CMD
app.get('/federacao-simulada.html', (req, res) => {
  const state = req.query.state || '';
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="pt-PT"><head><meta charset="utf-8"><title>autenticacao.gov.pt — Demonstração</title>
<style>
body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#f5f6f8;color:#1a1f2e}
.bar{background:#3b66c4;color:#fff;padding:12px 24px;font-weight:600}
.card{max-width:480px;margin:60px auto;background:#fff;border-radius:8px;padding:32px;box-shadow:0 8px 24px rgba(10,49,97,.12)}
h1{font-size:18px;margin-bottom:8px;color:#0a3161}
.sub{font-size:13px;color:#5b6478;margin-bottom:20px}
.field{margin-bottom:14px}
label{display:block;font-size:11px;text-transform:uppercase;font-weight:600;color:#5b6478;margin-bottom:5px;letter-spacing:.4px}
input{width:100%;padding:10px;border:1px solid #e1e4e8;border-radius:4px;font-size:14px;font-family:inherit}
.btn{display:inline-block;padding:10px 20px;background:#3b66c4;color:#fff;border:none;border-radius:4px;font-weight:500;cursor:pointer;width:100%;margin-top:8px;font-size:14px}
.demo{margin-top:18px;padding:12px;background:#fff8e6;border-radius:4px;font-size:12px;color:#7a4a00}
.list{list-style:none;padding:0;margin:8px 0 0}
.list li{padding:6px 8px;font-size:12px;cursor:pointer;border-radius:3px}
.list li:hover{background:#fef3c7}
.list code{background:rgba(0,0,0,.06);padding:1px 4px;border-radius:2px}
</style></head>
<body>
<div class="bar">autenticacao.gov.pt · Demonstração</div>
<div class="card">
  <h1>Autorizar acesso à FPL Ponte</h1>
  <div class="sub">A aplicação <strong>FPL — Pegada Legislativa</strong> solicita o seu nome e NIF para iniciar sessão.</div>
  <form id="cf">
    <input type="hidden" name="state" value="${state}">
    <div class="field"><label>NIF</label><input name="nif" id="nif" placeholder="123456789" required></div>
    <button class="btn" type="submit">Autorizar com Cartão de Cidadão</button>
  </form>
  <div class="demo">
    <strong>Modo demonstração</strong> · NIFs de teste:
    <ul class="list">
      <li onclick="document.getElementById('nif').value='100000001'">Maria Silva (PF MAE) · <code>100000001</code></li>
      <li onclick="document.getElementById('nif').value='100000005'">Rui Ferreira (SGGOV QA) · <code>100000005</code></li>
      <li onclick="document.getElementById('nif').value='100000006'">Carla Almeida (SGGOV Admin) · <code>100000006</code></li>
    </ul>
  </div>
</div>
<script>
document.getElementById('cf').addEventListener('submit', async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const r = await fetch('/api/auth/federacao/callback', {
    method:'POST', credentials:'include',
    headers:{'Content-Type':'application/json','x-csrf-token': document.cookie.split('fpl_csrf=')[1]?.split(';')[0]||''},
    body: JSON.stringify({ state: fd.get('state'), nif: fd.get('nif') })
  });
  if(r.ok){ window.location='/'; }
  else { const j = await r.json().catch(()=>({})); alert('Falha: ' + (j.error||r.statusText)); }
});
</script>
</body></html>`);
});

// Frontend estático
const frontendDir = path.resolve(__dirname, '../../frontend');
app.use(express.static(frontendDir));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(frontendDir, 'index.html'), err => err && next());
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Erro interno' });
});

// Worker de outbox (envia "emails" simulados a cada 30s)
setInterval(() => {
  try { processarOutbox(); } catch (e) { console.warn('[outbox] erro:', e.message); }
}, 30_000);

app.listen(PORT, () => {
  console.log(`✓ FPL Ponte API + UI a escutar em http://localhost:${PORT}`);
  console.log(`  • Frontend:    http://localhost:${PORT}/`);
  console.log(`  • API:         http://localhost:${PORT}/api/`);
  console.log(`  • Federação:   http://localhost:${PORT}/federacao-simulada.html`);
  console.log(`  • Health:      http://localhost:${PORT}/health`);
});
