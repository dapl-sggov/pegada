// FPL Ponte — Frontend (vanilla JS, single page)
// Liga-se à API em /api/* (mesmo origin se servida pelo backend, ou localhost:3717 em dev)

const API = location.port === '3717' || location.hostname === 'localhost' && !location.port
  ? '/api'
  : 'http://localhost:3717/api';

// ============ STATE ============
const state = {
  user: null,
  view: 'dashboard',
  fplId: null,
  gabinetes: [],
  fpls: [],
  fpl: null,
  versoes: [],
  eventos: [],
  rtriEntidades: [],
  dashboard: null,
  notificacoes: { items: [], nao_lidas: 0 },
  anexos: [],
  auditorias: [],
  comprovativos: [],
  pending2FA: null,
};

// ============ HTTP ============
function getCookie(name) {
  return document.cookie.split('; ').find(c => c.startsWith(name + '='))?.split('=')[1] || '';
}
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  // CSRF para mutações
  if (!['GET', 'HEAD', 'OPTIONS'].includes((opts.method || 'GET').toUpperCase())) {
    const tok = getCookie('fpl_csrf');
    if (tok) headers['x-csrf-token'] = tok;
  }
  const res = await fetch(API + path, {
    method: opts.method || 'GET',
    credentials: 'include',
    headers,
    body: opts.body !== undefined ? (opts.rawBody ? opts.body : JSON.stringify(opts.body)) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const err = new Error(data?.error || res.statusText);
    err.status = res.status; err.data = data;
    throw err;
  }
  return data;
}

async function uploadFile(path, file, extras = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(extras)) fd.append(k, v);
  fd.append('file', file);
  const headers = { 'x-csrf-token': getCookie('fpl_csrf') };
  const res = await fetch(API + path, { method: 'POST', credentials: 'include', headers, body: fd });
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const err = new Error(data?.error || res.statusText); err.status = res.status; err.data = data; throw err;
  }
  return data;
}

// ============ HELPERS ============
const ESTADOS_LBL = {
  CRIADO: { lbl: 'Criado', cls: 'criado' },
  EM_ELABORACAO: { lbl: 'Em elaboração', cls: 'elaboracao' },
  EM_CONSULTA_INTERNA: { lbl: 'Consulta interna', cls: 'consulta' },
  EM_CONSULTA_PUBLICA: { lbl: 'Consulta pública', cls: 'consulta' },
  EM_RSE: { lbl: 'Em RSE', cls: 'rse' },
  EM_CM: { lbl: 'Em CM', cls: 'cm' },
  APROVADO: { lbl: 'Aprovado', cls: 'aprovado' },
  PUBLICADO: { lbl: 'Publicado', cls: 'publicado' },
  EM_REVISAO_QA: { lbl: 'Em revisão QA', cls: 'revisao' },
  ARQUIVADO: { lbl: 'Arquivado', cls: 'criado' },
  REJEITADO_M0: { lbl: 'Rejeitado M0', cls: 'criado' },
};
const TIPOS = { DL: 'Decreto-Lei', PL: 'Proposta de Lei', RCM: 'Resolução do Conselho de Ministros', DR: 'Decreto Regulamentar', DESPACHO: 'Despacho normativo' };
const ORIGEM_LBL = {
  PROGRAMA_GOVERNO: 'Programa do Governo',
  TRANSPOSICAO_UE: 'Transposição UE',
  DECISAO_JUDICIAL: 'Decisão judicial',
  COMPROMISSO_INTERNACIONAL: 'Compromisso internacional',
  INICIATIVA_MINISTERIO: 'Iniciativa do ministério',
  OUTRA: 'Outra',
};
const NATUREZA_LBL = {
  RTRI_INSCRITO: 'Representante de interesses inscrito no RTRI',
  RTRI_FORCA_LEI: 'Representante automaticamente inscrito por força da Lei',
  ACADEMIA_PERITO: 'Academia ou perito individual',
  AUTORIDADE_PUBLICA: 'Autoridade pública',
  OUTRA: 'Outra',
};
const FORMA_LBL = {
  REUNIAO: 'Reunião presencial',
  AUDIENCIA: 'Audiência',
  VIDEOCONFERENCIA: 'Videoconferência',
  CORRESPONDENCIA: 'Correspondência escrita',
  CONTRIBUTO_ESPONTANEO: 'Contributo espontâneo',
  OUTRA: 'Outra',
};
const DECISAO_LBL = {
  INCORPORADA: 'Incorporada',
  PARCIALMENTE_INCORPORADA: 'Parcialmente incorporada',
  NAO_INCORPORADA: 'Não incorporada',
  SEM_OBJETO: 'Sem objeto',
};

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtData = d => { if (!d) return ''; const s = String(d).slice(0, 10); const [y, m, day] = s.split('-'); return `${day}/${m}/${y}`; };
const fmtDH = d => { if (!d) return ''; const dt = new Date(d); return dt.toLocaleDateString('pt-PT') + ' ' + dt.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }); };
const initials = n => (n || '').split(' ').filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();
const badge = e => { const x = ESTADOS_LBL[e] || { lbl: e, cls: 'criado' }; return `<span class="badge ${x.cls} dot">${x.lbl}</span>`; };
const tag = t => `<span class="tag tipo-${t}">${t}</span>`;

const isSggov = () => state.user?.papeis.some(p => ['SGGOV_QA', 'SGGOV_ADMIN', 'GSEPCM'].includes(p.papel));
const myGabinete = () => state.user?.papeis.find(p => p.gabinete_id)?.gabinete_id;
const gabSigla = id => state.gabinetes.find(g => g.id === id)?.sigla || id;
const gabNome = id => state.gabinetes.find(g => g.id === id)?.nome || id;

function toast(msg, type = 'info') {
  let c = document.querySelector('.toast-container');
  if (!c) { c = document.createElement('div'); c.className = 'toast-container'; document.body.appendChild(c); }
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 4500);
}

function openModal(html) {
  let ov = document.querySelector('.modal-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.addEventListener('click', e => { if (e.target === ov) closeModal(); });
    document.body.appendChild(ov);
  }
  ov.innerHTML = `<div class="modal lg">${html}</div>`;
  ov.classList.add('open');
}
function closeModal() {
  const ov = document.querySelector('.modal-overlay');
  if (ov) ov.classList.remove('open');
}
window.closeModal = closeModal;

// ============ ROUTING ============
function setView(view, opts = {}) {
  state.view = view;
  if (opts.fplId !== undefined) state.fplId = opts.fplId;
  render();
  window.scrollTo(0, 0);
}
window.setView = setView;

// ============ DATA LOADING ============
async function loadGabinetes() {
  if (state.gabinetes.length === 0) state.gabinetes = await api('/gabinetes');
}

async function loadFpls() {
  const out = await api('/fpl');
  state.fpls = out.items || [];
}

async function loadFpl(id) {
  state.fpl = await api('/fpl/' + id);
  state.versoes = await api(`/fpl/${id}/versoes`).catch(() => []);
  state.eventos = await api(`/fpl/${id}/eventos`).catch(() => []);
  state.anexos = await api(`/fpl/${id}/anexos`).catch(() => []);
  state.auditorias = await api(`/fpl/${id}/auditoria`).catch(() => []);
  state.comprovativos = await api(`/fpl/${id}/comprovativos`).catch(() => []);
}

async function loadDashboard() {
  if (isSggov()) {
    state.dashboard = await api('/admin/dashboard').catch(() => null);
  } else {
    state.dashboard = null;
  }
}

// ============ AUTH VIEWS ============
function renderLogin() {
  const need2fa = !!state.pending2FA;
  document.getElementById('root').innerHTML = `
    <div class="login-page">
      <div class="login-card" role="main" aria-labelledby="loginTitle">
        <div class="crest" aria-hidden="true">RP</div>
        <h1 id="loginTitle">Pegada Legislativa do Governo</h1>
        <div class="sub">FPL Ponte v1.0-rc · Aplicação de demonstração</div>
        <button id="cmdBtn" class="btn" type="button" style="width:100%;justify-content:center;padding:10px;margin-bottom:8px;border-color:#3b66c4;color:#3b66c4">
          <span aria-hidden="true">🪪</span> Entrar com Cartão de Cidadão / CMD
        </button>
        <div style="text-align:center;font-size:11px;color:var(--text-faint);margin:10px 0;text-transform:uppercase;letter-spacing:.4px">ou com email</div>
        <form id="loginForm" novalidate>
          <div class="form-row">
            <label for="loginEmail">Email</label>
            <input type="email" id="loginEmail" name="email" required autocomplete="email" aria-required="true">
          </div>
          <div class="form-row">
            <label for="loginPwd">Palavra-passe</label>
            <input type="password" id="loginPwd" name="password" required autocomplete="current-password" aria-required="true">
          </div>
          ${need2fa ? `
          <div class="form-row" id="totpRow">
            <label for="loginTotp">Código 2FA (6 dígitos)</label>
            <input type="text" id="loginTotp" name="totp" inputmode="numeric" pattern="\\d{6}" maxlength="6" required autocomplete="one-time-code" aria-required="true">
          </div>` : ''}
          <div id="loginErr" role="alert" aria-live="polite" style="color:var(--danger);font-size:12px;margin-bottom:10px;${need2fa ? '' : 'display:none'}">${need2fa ? 'Insira o código 2FA do seu autenticador.' : ''}</div>
          <button class="btn primary" type="submit" style="width:100%;justify-content:center;padding:10px">Entrar</button>
        </form>
        <div class="demo-users">
          <div class="ttl">Utilizadores de demonstração (clique para preencher)</div>
          <button type="button" class="demo-user" onclick="fillLogin('maria.silva@gov.pt')"><span>Maria Silva (Ponto Focal MAE)</span><code>demo1234</code></button>
          <button type="button" class="demo-user" onclick="fillLogin('rui.ferreira@sggov.pt')"><span>Rui Ferreira (SGGOV QA)</span><code>demo1234</code></button>
          <button type="button" class="demo-user" onclick="fillLogin('carla.almeida@sggov.pt')"><span>Carla Almeida (SGGOV Admin)</span><code>demo1234</code></button>
          <button type="button" class="demo-user" onclick="fillLogin('ana.santos@gov.pt')"><span>Ana Santos (Ponto Focal MS)</span><code>demo1234</code></button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('cmdBtn').addEventListener('click', async () => {
    try {
      const r = await api('/auth/federacao/start');
      window.location.href = r.consent_url;
    } catch (e) { toast('Falha: ' + e.message, 'error'); }
  });
  document.getElementById('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value || state.pending2FA?.email;
    const pwd = document.getElementById('loginPwd').value || state.pending2FA?.password;
    const totp = document.getElementById('loginTotp')?.value;
    try {
      const u = await api('/auth/login', { method: 'POST', body: { email, password: pwd, totp_token: totp } });
      state.user = u;
      state.pending2FA = null;
      await bootApp();
    } catch (err) {
      if (err.data?.requires_2fa) {
        state.pending2FA = { email, password: pwd };
        renderLogin();
        setTimeout(() => document.getElementById('loginTotp')?.focus(), 50);
        return;
      }
      const eD = document.getElementById('loginErr');
      eD.textContent = err.message || 'Falha ao autenticar';
      eD.style.display = 'block';
    }
  });
  setTimeout(() => (need2fa ? document.getElementById('loginTotp') : document.getElementById('loginEmail'))?.focus(), 50);
}
window.fillLogin = (email) => {
  document.getElementById('loginEmail').value = email;
  document.getElementById('loginPwd').value = 'demo1234';
};

// ============ APP SHELL ============
function renderShell() {
  const user = state.user;
  const sggov = isSggov();
  const isAdmin = user.papeis.some(p => p.papel === 'SGGOV_ADMIN');
  const papelLbl = sggov ? 'SGGOV' : (user.papeis.find(p => p.gabinete_id) ? 'Ponto Focal · ' + gabSigla(myGabinete()) : 'Utilizador');
  const bellCount = state.notificacoes?.nao_lidas || 0;
  document.getElementById('root').innerHTML = `
    <a href="#main" class="skip-link">Saltar para o conteúdo principal</a>
    <div class="demo-banner" role="banner">DEMONSTRAÇÃO · FPL Ponte v1.0-rc · Sistema funcional ligado a SQLite real</div>
    <header class="topbar" role="banner">
      <div class="brand">
        <div class="crest" aria-hidden="true">RP</div>
        <div class="brand-text">
          <span class="t1">República Portuguesa · Governo</span>
          <span class="t2">FPL — Pegada Legislativa</span>
        </div>
      </div>
      <nav aria-label="Navegação principal">
        <button data-nav="dashboard" aria-current="${state.view === 'dashboard' ? 'page' : 'false'}" class="${state.view === 'dashboard' ? 'active' : ''}">Início</button>
        <button data-nav="lista" aria-current="${state.view === 'lista' ? 'page' : 'false'}" class="${state.view === 'lista' ? 'active' : ''}">FPL</button>
        ${sggov ? `<button data-nav="entidades" aria-current="${state.view === 'entidades' ? 'page' : 'false'}" class="${state.view === 'entidades' ? 'active' : ''}">Entidades RTRI</button>` : ''}
        ${sggov ? `<button data-nav="auditoria" aria-current="${state.view === 'auditoria' ? 'page' : 'false'}" class="${state.view === 'auditoria' ? 'active' : ''}">Auditoria QA</button>` : ''}
        ${isAdmin ? `<button data-nav="outbox" aria-current="${state.view === 'outbox' ? 'page' : 'false'}" class="${state.view === 'outbox' ? 'active' : ''}">Outbox</button>` : ''}
      </nav>
      <div class="right">
        <button class="bell" aria-label="Notificações${bellCount > 0 ? ' (' + bellCount + ' não lidas)' : ''}" onclick="abrirNotificacoes()">
          <span aria-hidden="true">🔔</span>
          ${bellCount > 0 ? `<span class="bell-badge" aria-hidden="true">${bellCount}</span>` : ''}
        </button>
        <button class="user" onclick="setView('perfil')" aria-label="Abrir o meu perfil">
          <div class="avatar" aria-hidden="true">${initials(user.nome)}</div>
          <div class="meta"><span class="n">${esc(user.nome)}</span><span class="r">${esc(papelLbl)}${user.totp_ativo ? ' · 2FA' : ''}</span></div>
        </button>
        <button class="logout-btn" onclick="logout()" aria-label="Terminar sessão">Sair</button>
      </div>
    </header>
    <div class="shell">
      <aside class="sidebar" aria-label="Menu lateral">
        <div class="side-section">
          <div class="side-title" id="sec-trab">Trabalho</div>
          <nav aria-labelledby="sec-trab">
            <a class="side-link ${state.view === 'dashboard' ? 'active' : ''}" data-nav="dashboard" tabindex="0" role="link" aria-current="${state.view === 'dashboard' ? 'page' : 'false'}">Início</a>
            <a class="side-link ${state.view === 'lista' ? 'active' : ''}" data-nav="lista" tabindex="0" role="link">${sggov ? 'Todas as FPL' : 'As minhas FPL'}</a>
            ${!sggov ? '<a class="side-link" data-nav="nova" tabindex="0" role="link">+ Nova FPL</a>' : ''}
            <a class="side-link ${state.view === 'perfil' ? 'active' : ''}" data-nav="perfil" tabindex="0" role="link">O meu perfil & 2FA</a>
          </nav>
        </div>
        ${sggov ? `
        <div class="side-section">
          <div class="side-title" id="sec-sg">SGGOV</div>
          <nav aria-labelledby="sec-sg">
            <a class="side-link ${state.view === 'entidades' ? 'active' : ''}" data-nav="entidades" tabindex="0" role="link">Entidades RTRI</a>
            <a class="side-link ${state.view === 'auditoria' ? 'active' : ''}" data-nav="auditoria" tabindex="0" role="link">Auditoria QA</a>
            ${isAdmin ? `<a class="side-link ${state.view === 'outbox' ? 'active' : ''}" data-nav="outbox" tabindex="0" role="link">Outbox de email</a>` : ''}
          </nav>
        </div>` : ''}
        ${sggov ? `
        <div class="side-section">
          <div class="side-title" id="sec-res">Exportação · Portal do Governo</div>
          <nav aria-labelledby="sec-res">
            <a class="side-link ${state.view === 'exportacao' ? 'active' : ''}" data-nav="exportacao" tabindex="0" role="link">Painel de exportação</a>
            <a class="side-link" href="/api/export/datasets/fpl.json" target="_blank" rel="noopener">Dataset JSON</a>
            <a class="side-link" href="/api/export/datasets/fpl.csv" target="_blank" rel="noopener">Dataset CSV</a>
            <a class="side-link" href="/api/export/datasets/fpl.jsonld" target="_blank" rel="noopener">JSON-LD (vocabulário OCDE)</a>
          </nav>
        </div>` : ''}
      </aside>
      <main class="main" id="main" tabindex="-1"></main>
    </div>
    <footer class="footer" role="contentinfo">
      FPL Ponte · SGGOV · Lei n.º 5-A/2026 · Demonstração
      · <a href="/declaracao-acessibilidade.html">Declaração de Acessibilidade</a>
    </footer>
  `;
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', () => setView(el.dataset.nav));
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setView(el.dataset.nav); } });
  });
}

// Carrega notificações periodicamente
let notifPollHandle = null;
async function pollNotificacoes() {
  if (!state.user) return;
  try {
    const r = await api('/notificacoes');
    const before = state.notificacoes.nao_lidas;
    state.notificacoes = r;
    // Atualiza só o badge sem re-renderizar tudo
    const bell = document.querySelector('.bell');
    if (bell) {
      const old = bell.querySelector('.bell-badge');
      if (old) old.remove();
      if (r.nao_lidas > 0) {
        const b = document.createElement('span');
        b.className = 'bell-badge';
        b.textContent = r.nao_lidas;
        b.setAttribute('aria-hidden', 'true');
        bell.appendChild(b);
      }
      bell.setAttribute('aria-label', 'Notificações' + (r.nao_lidas > 0 ? ' (' + r.nao_lidas + ' não lidas)' : ''));
    }
    if (r.nao_lidas > before && before !== undefined) {
      toast('Tem ' + (r.nao_lidas - before) + ' nova(s) notificação(ões).', 'info');
    }
  } catch {}
}

window.logout = async () => {
  await api('/auth/logout', { method: 'POST' }).catch(() => null);
  state.user = null;
  renderLogin();
};

// ============ VIEWS ============
async function viewDashboard() {
  await loadFpls();
  await loadDashboard();
  const sggov = isSggov();
  if (sggov) return viewDashboardSggov();
  const fpls = state.fpls;
  const ativas = fpls.filter(f => !['PUBLICADO', 'ARQUIVADO'].includes(f.estado_workflow));
  const publicadas = fpls.filter(f => f.estado_workflow === 'PUBLICADO');
  const recentes = [...fpls].sort((a, b) => (b.data_criacao || '').localeCompare(a.data_criacao || '')).slice(0, 5);
  return `
    <div class="page-head">
      <div>
        <div class="page-title">Bem-vindo, ${esc(state.user.nome.split(' ')[0])}.</div>
        <div class="page-sub">${ativas.length} FPL ativas · ${publicadas.length} publicadas em 2026</div>
      </div>
      <button class="btn primary" data-nav="nova">+ Nova FPL</button>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="lbl">FPL ativas</div><div class="val">${ativas.length}</div></div>
      <div class="kpi"><div class="lbl">Em RSE / CM</div><div class="val" style="color:var(--warning)">${fpls.filter(f => ['EM_RSE', 'EM_CM'].includes(f.estado_workflow)).length}</div></div>
      <div class="kpi"><div class="lbl">Publicadas</div><div class="val" style="color:var(--success)">${publicadas.length}</div></div>
      <div class="kpi"><div class="lbl">Em revisão QA</div><div class="val" style="color:var(--danger)">${fpls.filter(f => f.estado_workflow === 'EM_REVISAO_QA').length}</div></div>
    </div>
    <div class="card">
      <div class="card-head"><h3>FPL recentes</h3><a onclick="setView('lista')">Ver todas →</a></div>
      <table class="tbl">
        <thead><tr><th>Diploma</th><th>Tipo</th><th>Estado</th><th>M0</th><th>M3</th></tr></thead>
        <tbody>
        ${recentes.length === 0 ? '<tr><td colspan="5" class="card-empty">Sem FPL ainda. Crie a primeira.</td></tr>' :
        recentes.map(f => `
          <tr onclick="setView('detalhe',{fplId:'${f.id}'})">
            <td class="cell-titulo">${esc(f.titulo_curto || f.titulo.substring(0, 80))}<span class="num">${esc(f.numero_processo)} · ${gabSigla(f.gabinete_id)}</span></td>
            <td>${tag(f.tipo_diploma)}</td>
            <td>${badge(f.estado_workflow)}</td>
            <td class="muted small">${fmtData(f.m0_validado_em) || '—'}</td>
            <td class="muted small">${fmtData(f.m3_validado_em) || '—'}</td>
          </tr>
        `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function viewDashboardSggov() {
  const d = state.dashboard;
  if (!d) return '<div class="card-empty">Sem dados</div>';
  return `
    <div class="page-head">
      <div><div class="page-title">Dashboard SGGOV</div><div class="page-sub">Visão consolidada do regime de Pegada Legislativa</div></div>
      <a class="btn" href="/api/export/datasets/fpl.csv" target="_blank" rel="noopener">↓ Exportar CSV</a>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="lbl">Total FPL</div><div class="val">${d.total}</div></div>
      <div class="kpi"><div class="lbl">Publicadas</div><div class="val" style="color:var(--success)">${d.publicadas}</div></div>
      <div class="kpi"><div class="lbl">Comprovativos emitidos</div><div class="val">${d.comprovativos ?? '—'}</div></div>
      <div class="kpi"><div class="lbl">Em revisão QA</div><div class="val" style="color:var(--warning)">${d.em_revisao}</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px">
      <div class="card">
        <div class="card-head"><h3>Distribuição por estado</h3></div>
        <div class="card-body">
          ${d.por_estado.map(e => {
            const lbl = ESTADOS_LBL[e.estado]?.lbl || e.estado;
            const max = Math.max(...d.por_estado.map(x => x.n));
            return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
              <div style="width:130px;font-size:12px">${lbl}</div>
              <div style="flex:1;height:18px;background:#f5f6f8;border-radius:3px;overflow:hidden">
                <div style="width:${e.n / max * 100}%;height:100%;background:var(--gov-blue);display:flex;align-items:center;padding:0 8px;color:#fff;font-size:11px;font-weight:600">${e.n}</div>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Top ministérios</h3></div>
        <table class="tbl">
          <thead><tr><th>Ministério</th><th class="txt-right">FPL</th></tr></thead>
          <tbody>
            ${d.top_gabinetes.map(g => `<tr><td>${g.sigla}</td><td class="txt-right"><strong>${g.n}</strong></td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
    <div class="card mt-12">
      <div class="card-head"><h3>Top entidades RTRI mais interlocutadas</h3></div>
      <table class="tbl">
        <thead><tr><th>Entidade</th><th>RTRI</th><th class="txt-right">Interações</th></tr></thead>
        <tbody>
          ${d.top_entidades.map(e => `<tr><td>${esc(e.entidade)}</td><td>${e.rtri_id || '<em>—</em>'}</td><td class="txt-right"><strong>${e.n}</strong></td></tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function viewLista() {
  await loadFpls();
  return `
    <div class="page-head">
      <div><div class="page-title">${isSggov() ? 'Todas as FPL' : 'As minhas FPL'}</div><div class="page-sub">${state.fpls.length} fichas</div></div>
      ${isSggov() ? '' : '<button class="btn primary" data-nav="nova">+ Nova FPL</button>'}
    </div>
    <div class="card">
      <table class="tbl">
        <thead><tr><th>N.º Processo</th><th>Tipo</th><th>Título</th><th>Gabinete</th><th>Estado</th><th>M0</th><th>M3</th><th>M5</th></tr></thead>
        <tbody>
          ${state.fpls.length === 0 ? '<tr><td colspan="8" class="card-empty">Sem FPL. Crie a primeira.</td></tr>' : state.fpls.map(f => `
            <tr onclick="setView('detalhe',{fplId:'${f.id}'})">
              <td><strong>${esc(f.numero_processo)}</strong></td>
              <td>${tag(f.tipo_diploma)}</td>
              <td class="cell-titulo">${esc(f.titulo_curto || f.titulo)}</td>
              <td>${gabSigla(f.gabinete_id)}</td>
              <td>${badge(f.estado_workflow)}</td>
              <td class="muted small">${fmtData(f.m0_validado_em) || '—'}</td>
              <td class="muted small">${fmtData(f.m3_validado_em) || '—'}</td>
              <td class="muted small">${fmtData(f.m5_validado_em) || '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function viewNova() {
  await loadGabinetes();
  const myGab = myGabinete();
  return `
    <div class="page-head">
      <div><div class="page-title">Nova FPL</div><div class="page-sub">Bloco A (identificação) + Bloco B (origem). Validar M0 inicia o ciclo de vida da FPL.</div></div>
    </div>
    <form id="novaFplForm">
      <div class="bloco-section">
        <div class="bloco-head"><div class="ttl"><div class="letra">A</div><div><h3>Bloco A · Identificação</h3></div></div></div>
        <div class="bloco-body">
          <div class="field-grid">
            <div class="field"><label>Tipo de diploma *</label>
              <select name="tipo_diploma" required>
                ${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
              </select>
            </div>
            <div class="field"><label>Área governativa proponente *</label>
              <select name="gabinete_id" required>
                ${state.gabinetes.filter(g => isSggov() || g.id === myGab).map(g => `<option value="${g.id}">${esc(g.nome)}</option>`).join('')}
              </select>
            </div>
            <div class="field full"><label>Título do diploma *</label><input type="text" name="titulo" required placeholder="Decreto-Lei que aprova..."></div>
            <div class="field full"><label>Título curto (para listagens)</label><input type="text" name="titulo_curto" placeholder="Ex.: Comunidades de energia"></div>
          </div>
        </div>
      </div>
      <div class="bloco-section">
        <div class="bloco-head"><div class="ttl"><div class="letra">B</div><div><h3>Bloco B · Origem e motivação</h3></div></div></div>
        <div class="bloco-body">
          <div class="field-grid">
            <div class="field"><label>Tipo de origem *</label>
              <select name="tipo_origem" required>
                ${Object.entries(ORIGEM_LBL).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
              </select>
            </div>
            <div class="field"><label>Referência da origem</label><input type="text" name="referencia_origem" placeholder="Ex.: Diretiva (UE) 2024/884"></div>
            <div class="field full"><label>Síntese do problema e solução * <span class="help">(mínimo 200 caracteres — exigido para validar M0)</span></label>
              <textarea name="sintese_problema" rows="6" placeholder="Descreva o problema e a solução proposta..."></textarea>
              <div class="help" id="sinteseChars">0 caracteres</div>
            </div>
            <div class="field"><label>Avaliação prévia de impacto</label>
              <select name="avaliacao_previa"><option value="">Não indicada</option><option value="1">Sim</option><option value="0">Não</option></select>
            </div>
          </div>
        </div>
      </div>
      <div class="flex gap-12 mt-12" style="justify-content:flex-end">
        <button type="button" class="btn" onclick="setView('lista')">Cancelar</button>
        <button type="submit" class="btn primary" id="btnCreate">Criar FPL e validar M0</button>
      </div>
    </form>
  `;
}

function bindNovaFpl() {
  const form = document.getElementById('novaFplForm');
  if (!form) return;
  const sintTxt = form.querySelector('[name=sintese_problema]');
  const sintChars = document.getElementById('sinteseChars');
  if (sintTxt && sintChars) {
    sintTxt.addEventListener('input', () => {
      const n = sintTxt.value.length;
      sintChars.textContent = `${n} caracteres ${n >= 200 ? '✓' : '(faltam ' + (200 - n) + ')'}`;
      sintChars.style.color = n >= 200 ? 'var(--success)' : 'var(--text-faint)';
    });
  }
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(form);
    const body = Object.fromEntries(fd.entries());
    const btn = document.getElementById('btnCreate');
    btn.disabled = true;
    try {
      // Cria
      const fpl = await api('/fpl', { method: 'POST', body: { tipo_diploma: body.tipo_diploma, titulo: body.titulo, titulo_curto: body.titulo_curto, gabinete_id: body.gabinete_id } });
      // Atualiza Bloco B
      await api(`/fpl/${fpl.id}/bloco-b`, { method: 'PATCH', body: {
        tipo_origem: body.tipo_origem,
        referencia_origem: body.referencia_origem || null,
        sintese_problema: body.sintese_problema || null,
        avaliacao_previa: body.avaliacao_previa ? parseInt(body.avaliacao_previa, 10) : null,
      } });
      // Tenta validar M0
      try {
        await api(`/fpl/${fpl.id}/marcos/M0/validar`, { method: 'POST', body: {} });
        toast('FPL criada e M0 validado.', 'success');
      } catch (e) {
        toast('FPL criada. M0 não validado: ' + (e.data?.pendencias?.[0]?.detalhe || e.message), 'warning');
      }
      setView('detalhe', { fplId: fpl.id });
    } catch (err) {
      toast('Falha ao criar: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });
}

async function viewDetalhe() {
  if (!state.fplId) return '<div class="card-empty">FPL não selecionada</div>';
  await loadFpl(state.fplId);
  await loadGabinetes();
  const f = state.fpl;
  const marcosArr = ['M0', 'M1', 'M2', 'M3', 'M4', 'M5'];
  const marcosLbl = { M0: 'Abertura', M1: 'Pré-CP', M2: 'Pós-CP', M3: 'Pré-RSE', M4: 'Pré-CM', M5: 'Publicação' };
  const marcosVal = { M0: f.m0_validado_em, M1: f.m1_validado_em, M2: f.m2_validado_em, M3: f.m3_validado_em, M4: f.m4_validado_em, M5: f.m5_validado_em };
  let lastDone = -1;
  marcosArr.forEach((m, i) => { if (marcosVal[m]) lastDone = i; });
  const next = lastDone < 5 ? lastDone + 1 : 5;

  // Determinar qual marco é o próximo a validar
  let acaoMarco = null;
  if (!marcosVal.M0) acaoMarco = 'M0';
  else if (!marcosVal.M3 && ['EM_ELABORACAO', 'EM_CONSULTA_INTERNA', 'EM_CONSULTA_PUBLICA'].includes(f.estado_workflow)) acaoMarco = 'M3';
  else if (!marcosVal.M4 && f.estado_workflow === 'EM_RSE') acaoMarco = 'M4';
  else if (!marcosVal.M5 && f.estado_workflow === 'APROVADO') acaoMarco = 'M5';
  // Aprovação em Conselho de Ministros (passo entre M4 e M5) — papel GSEPCM/SGGOV_ADMIN
  const podeAprovarCM = f.estado_workflow === 'EM_CM'
    && state.user.papeis.some(p => ['GSEPCM', 'SGGOV_ADMIN'].includes(p.papel));
  const marcosBloq = ['M0', 'M3', 'M4', 'M5'];

  return `
    <div class="fpl-head">
      <div class="breadcrumb"><a onclick="setView('lista')" style="cursor:pointer">FPL</a> › ${esc(f.numero_processo)}</div>
      <h1>${esc(f.titulo)}</h1>
      <div class="flex gap-8">${tag(f.tipo_diploma)} ${badge(f.estado_workflow)}<span class="muted small">· ${esc(f.numero_processo)} · ${esc(gabNome(f.gabinete_id))}</span></div>
      <div class="meta">
        <span><strong>Origem:</strong> ${ORIGEM_LBL[f.tipo_origem] || f.tipo_origem || '—'}</span>
        <span><strong>Aberto:</strong> ${fmtData(f.m0_validado_em) || fmtData(f.data_criacao)}</span>
        ${f.referencia_dr ? `<span><strong>DR:</strong> ${esc(f.referencia_dr)}</span>` : ''}
        <span><strong>Versão:</strong> ${f.versao_atual}</span>
      </div>
      <div class="actions">
        ${acaoMarco ? `<button class="btn primary" onclick="abrirValidacaoMarco('${acaoMarco}')">Validar ${acaoMarco}${marcosBloq.includes(acaoMarco) ? ' — emite comprovativo' : ''}</button>` : ''}
        ${podeAprovarCM ? `<button class="btn primary" onclick="abrirAprovarCM()">Registar aprovação em Conselho de Ministros</button>` : ''}
        <button class="btn" onclick="setTab('CMP')">Comprovativos</button>
        <button class="btn" onclick="setTab('H')">Histórico</button>
      </div>
    </div>
    <div class="marcos" role="img" aria-label="Progresso dos marcos M0 a M5">
      ${marcosArr.map((m, i) => {
        const done = !!marcosVal[m]; const cur = i === next && !done;
        const bloq = marcosBloq.includes(m);
        return `<div class="marco ${done ? 'done' : ''} ${cur ? 'current' : ''}" title="${m} · ${marcosLbl[m]}${bloq ? ' · marco bloqueante (emite comprovativo)' : ''}">
          <div class="dot">${done ? '✓' : m.replace('M', '')}</div>
          <div class="lbl">${m}${bloq ? ' ⚿' : ''}</div>
          <div class="sub">${marcosLbl[m]}</div>
          ${done ? `<div class="sub">${fmtData(marcosVal[m])}</div>` : ''}
        </div>`;
      }).join('')}
    </div>
    <div class="tabs" role="tablist" aria-label="Blocos da FPL">
      <button class="tab active" data-tab="A" role="tab" aria-selected="true">Bloco A</button>
      <button class="tab" data-tab="B" role="tab" aria-selected="false">Bloco B · Origem</button>
      <button class="tab" data-tab="C" role="tab" aria-selected="false">Bloco C · Internos <span class="pill">${(f.bloco_c || []).length}</span></button>
      <button class="tab" data-tab="D" role="tab" aria-selected="false">Bloco D · Externos <span class="pill">${(f.bloco_d || []).length}</span></button>
      <button class="tab" data-tab="E" role="tab" aria-selected="false">Bloco E · Consulta pública</button>
      <button class="tab" data-tab="F" role="tab" aria-selected="false">Bloco F · Declaração</button>
      <button class="tab" data-tab="CMP" role="tab" aria-selected="false">Comprovativos <span class="pill">${state.comprovativos.length}</span></button>
      <button class="tab" data-tab="G" role="tab" aria-selected="false">Bloco G · QA <span class="pill">${state.auditorias.length}</span></button>
      <button class="tab" data-tab="N" role="tab" aria-selected="false">Anexos <span class="pill">${state.anexos.length}</span></button>
      <button class="tab" data-tab="H" role="tab" aria-selected="false">Histórico <span class="pill">${state.versoes.length}</span></button>
    </div>
    <div id="tab-A" role="tabpanel">${blocoA(f)}</div>
    <div id="tab-B" role="tabpanel" hidden>${blocoB(f)}</div>
    <div id="tab-C" role="tabpanel" hidden>${blocoC(f)}</div>
    <div id="tab-D" role="tabpanel" hidden>${blocoD(f)}</div>
    <div id="tab-E" role="tabpanel" hidden>${blocoE(f)}</div>
    <div id="tab-F" role="tabpanel" hidden>${blocoF(f)}</div>
    <div id="tab-CMP" role="tabpanel" hidden>${blocoCMP(f)}</div>
    <div id="tab-G" role="tabpanel" hidden>${blocoG(f)}</div>
    <div id="tab-N" role="tabpanel" hidden>${blocoAnexos(f)}</div>
    <div id="tab-H" role="tabpanel" hidden>${blocoH(f)}</div>
  `;
}

// Bloco de comprovativos criptográficos
function blocoCMP(f) {
  const marcos = ['M0', 'M3', 'M4', 'M5'];
  const marcosLbl = { M0: 'Abertura', M3: 'Pré-RSE', M4: 'Pré-CM', M5: 'Publicação' };
  const cmps = state.comprovativos || [];
  return `<div class="bloco-section">
    <div class="bloco-head">
      <div class="ttl"><div class="letra" style="background:var(--gov-gold);color:var(--gov-blue-dark)">⚿</div>
        <div><h3>Comprovativos criptográficos</h3><div class="desc">JWS Ed25519 · verificáveis offline pelo SmartLegis</div></div></div>
    </div>
    <div class="bloco-body">
      <div class="alert info"><div><span class="ttl">Acoplamento ao SmartLegis</span>Cada marco bloqueante (M0/M3/M4/M5) emite um comprovativo assinado. O ponto focal copia-o para o SmartLegis, que o verifica com a chave pública partilhada e bloqueia a tramitação se a verificação falhar — sem integração síncrona entre os sistemas.</div></div>
      ${marcos.map(m => {
        const c = cmps.find(x => x.marco === m);
        return `<div class="entrada ${c ? 'open' : ''}">
          <div class="entrada-head">
            <div class="ttl">
              <strong>${m} · ${marcosLbl[m]}</strong>
              ${c
                ? `<span class="rtri-status validado">✓ emitido</span><span class="tag">${esc(c.estado)}</span>`
                : '<span class="tag" style="background:#f5f6f8">Será emitido ao validar ' + m + '</span>'}
            </div>
            ${c ? `<div class="data">${fmtDH(c.emitido_em)}</div>` : ''}
          </div>
          ${c ? `<div class="entrada-body">
            <div class="row"><div class="lbl">Identificador (jti)</div><div><code>${esc(c.jti)}</code></div></div>
            <div class="row"><div class="lbl">Chave de assinatura</div><div><code>${esc(c.kid)}</code> · EdDSA (Ed25519)</div></div>
            <div class="row"><div class="lbl">Validado por</div><div>${esc(c.validado_por)}</div></div>
            <div class="row"><div class="lbl">Validade</div><div>${fmtData(c.emitido_em)} — ${fmtData(c.expira_em)}</div></div>
            <div class="flex gap-8 mt-12">
              <button class="btn sm primary" onclick="verComprovativo('${esc(c.jti)}')">Ver comprovativo e copiar para o SmartLegis</button>
            </div>
          </div>` : ''}
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function blocoG(f) {
  const isQa = state.user.papeis.some(p => ['SGGOV_QA', 'SGGOV_ADMIN'].includes(p.papel));
  const lista = state.auditorias || [];
  return `<div class="bloco-section">
    <div class="bloco-head">
      <div class="ttl"><div class="letra" style="background:#5b6478">G</div><div><h3>Auditoria SGGOV (Bloco G)</h3><div class="desc">Pontuação 0-100 · pedidos de correção</div></div></div>
      ${isQa ? `<button class="btn primary sm" onclick="abrirNovaAuditoria()">+ Nova auditoria</button>` : ''}
    </div>
    <div class="bloco-body">
      ${lista.length === 0 ? `<div class="card-empty">Sem auditorias registadas para esta FPL.</div>` :
      lista.map(a => `
        <div class="entrada open">
          <div class="entrada-head">
            <div class="ttl">
              <strong>Auditoria de ${esc(a.auditor_nome || '')}</strong>
              <span class="tag" style="background:${a.pontuacao >= 80 ? '#d1fae5' : '#fef3c7'};color:${a.pontuacao >= 80 ? '#0e6b34' : '#92400e'};border:none">${a.pontuacao}/100</span>
              ${a.pedido_correcao ? `<span class="badge revisao dot">${a.estado_correcao || 'PENDENTE'}</span>` : `<span class="badge aprovado dot">Sem correções</span>`}
            </div>
            <div class="data">${fmtDH(a.data_auditoria)}</div>
          </div>
          <div class="entrada-body">
            ${a.observacoes ? `<div class="row"><div class="lbl">Observações</div><div>${esc(a.observacoes)}</div></div>` : ''}
            ${a.pedido_correcao ? `
              <div class="alert warning"><div><span class="ttl">Pedido de correção</span>${esc(a.descricao_correcao || '')}</div></div>
              <div class="flex gap-8 mt-12">
                ${a.estado_correcao === 'PENDENTE' && userOwns(f) ? `<button class="btn sm" onclick="iniciarCorrecao('${a.id}')">Iniciar correção</button>` : ''}
                ${a.estado_correcao === 'EM_CURSO' && userOwns(f) ? `<button class="btn primary sm" onclick="submeterCorrecao('${a.id}')">Submeter correção</button>` : ''}
                ${a.estado_correcao === 'SUBMETIDA' && isQa ? `<button class="btn success sm" onclick="aprovarCorrecao('${a.id}')">Aprovar correção</button>` : ''}
              </div>
            ` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  </div>`;
}

function blocoAnexos(f) {
  return `<div class="bloco-section">
    <div class="bloco-head">
      <div class="ttl"><div class="letra" style="background:#1a7f3c">⎙</div><div><h3>Anexos</h3><div class="desc">PDF, DOC(X), XLS(X) — máximo 20 MB · SHA-256 + scan antivírus</div></div></div>
      <button class="btn primary sm" onclick="abrirUploadAnexo(null,'A')">+ Carregar ficheiro</button>
    </div>
    <div class="bloco-body">
      ${(state.anexos || []).length === 0 ? `<div class="card-empty">Sem anexos. Use "+ Carregar ficheiro" para anexar PDFs ou outros documentos.</div>` :
      `<table class="tbl">
        <thead><tr><th>Ficheiro</th><th>Bloco</th><th>Tamanho</th><th>Visibilidade</th><th>Antivírus</th><th>Carregado</th><th></th></tr></thead>
        <tbody>
        ${state.anexos.map(a => `
          <tr>
            <td><strong>${esc(a.nome_original)}</strong><div class="muted small">SHA-256: ${a.sha256.slice(0, 16)}…</div></td>
            <td>${a.bloco}</td>
            <td>${(a.tamanho_bytes / 1024).toFixed(1)} KB</td>
            <td>${a.visibilidade === 'PUBLICO' ? '<span class="badge consulta dot">Público</span>' : '<span class="badge criado dot">Interno</span>'}</td>
            <td>${a.antivirus_status === 'LIMPO' ? '<span class="rtri-status validado">✓ Limpo</span>' : (a.antivirus_status === 'INFETADO' ? '<span class="rtri-status invalido">⚠ Quarentena</span>' : '<span class="rtri-status pendente">Pendente</span>')}</td>
            <td class="muted small">${fmtDH(a.upload_em)}</td>
            <td>
              ${a.antivirus_status !== 'INFETADO' ? `<a class="btn ghost sm" href="/api/anexos/${a.id}" target="_blank" rel="noopener">Abrir</a>` : ''}
              <button class="btn ghost sm" onclick="eliminarAnexo('${a.id}')" aria-label="Eliminar anexo ${esc(a.nome_original)}">🗑</button>
            </td>
          </tr>
        `).join('')}
        </tbody>
      </table>`}
    </div>
  </div>`;
}

function userOwns(f) {
  return state.user.papeis.some(p => p.gabinete_id === f.gabinete_id);
}

function blocoA(f) {
  return `<div class="bloco-section">
    <div class="bloco-head"><div class="ttl"><div class="letra">A</div><div><h3>Identificação</h3></div></div></div>
    <div class="bloco-body">
      <div class="field-grid">
        <div class="field"><label>Tipo de diploma</label><div class="val">${TIPOS[f.tipo_diploma] || f.tipo_diploma}</div></div>
        <div class="field"><label>N.º interno de processo</label><div class="val"><strong>${esc(f.numero_processo)}</strong></div></div>
        <div class="field full"><label>Título</label><div class="val">${esc(f.titulo)}</div></div>
        <div class="field"><label>Área governativa proponente</label><div class="val">${esc(gabNome(f.gabinete_id))}</div></div>
        <div class="field"><label>Estado atual</label><div class="val">${badge(f.estado_workflow)}</div></div>
        <div class="field"><label>Data de criação</label><div class="val">${fmtDH(f.data_criacao)}</div></div>
        <div class="field"><label>Versão atual</label><div class="val">${f.versao_atual}</div></div>
      </div>
    </div>
  </div>`;
}

function blocoB(f) {
  return `<div class="bloco-section">
    <div class="bloco-head">
      <div class="ttl"><div class="letra">B</div><div><h3>Origem e motivação</h3></div></div>
      <button class="btn sm" onclick="abrirEditarBlocoB()">Editar</button>
    </div>
    <div class="bloco-body">
      <div class="field-grid">
        <div class="field"><label>Tipo de origem</label><div class="val ${!f.tipo_origem ? 'empty' : ''}">${ORIGEM_LBL[f.tipo_origem] || f.tipo_origem || 'Por preencher'}</div></div>
        <div class="field"><label>Referência da origem</label><div class="val ${!f.referencia_origem ? 'empty' : ''}">${esc(f.referencia_origem) || 'Não aplicável'}</div></div>
        <div class="field full"><label>Síntese do problema e solução</label>
          <div class="val ${!f.sintese_problema ? 'empty' : ''}">${esc(f.sintese_problema) || 'Por preencher (mínimo 200 caracteres)'}</div>
          ${f.sintese_problema ? `<div class="help">${f.sintese_problema.length} caracteres ${f.sintese_problema.length >= 200 ? '✓' : '⚠ insuficiente'}</div>` : ''}
        </div>
        <div class="field"><label>Avaliação prévia de impacto</label><div class="val">${f.avaliacao_previa === 1 ? '✓ Sim' : (f.avaliacao_previa === 0 ? 'Não' : '<span class="empty">Não indicada</span>')}</div></div>
      </div>
    </div>
  </div>`;
}

function blocoC(f) {
  const lista = f.bloco_c || [];
  return `<div class="bloco-section">
    <div class="bloco-head">
      <div class="ttl"><div class="letra">C</div><div><h3>Contributos internos ao Governo</h3><div class="desc">Pareceres e contributos formais</div></div></div>
      <button class="btn primary sm" onclick="abrirNovaEntradaC()">+ Adicionar</button>
    </div>
    <div class="bloco-body">
      ${lista.length === 0 ? '<div class="card-empty">Sem contributos internos registados</div>' :
      lista.map((e, i) => `
        <div class="entrada" id="c-${i}">
          <div class="entrada-head" onclick="document.getElementById('c-${i}').classList.toggle('open')">
            <div class="ttl"><strong>${esc(e.entidade)}</strong> <span class="tag">${e.forma}</span></div>
            <div class="data">${fmtData(e.data)}</div>
          </div>
          <div class="entrada-body">
            <div class="row"><div class="lbl">Objeto</div><div>${esc(e.objeto)}</div></div>
            <div class="row"><div class="lbl">Síntese</div><div>${esc(e.sintese_posicao)}</div></div>
          </div>
        </div>
      `).join('')}
    </div>
  </div>`;
}

function blocoD(f) {
  const lista = f.bloco_d || [];
  return `<div class="bloco-section">
    <div class="bloco-head">
      <div class="ttl"><div class="letra" style="background:var(--gov-red)">D</div><div><h3>Interações externas — núcleo da pegada</h3><div class="desc">Lei n.º 5-A/2026</div></div></div>
      <button class="btn primary sm" onclick="abrirNovaEntradaD()">+ Adicionar interação</button>
    </div>
    <div class="bloco-body">
      ${lista.length === 0 ? '<div class="card-empty">Sem interações externas registadas</div>' :
      lista.map((e, i) => {
        const govPess = (() => { try { return JSON.parse(e.pessoas_governo || '[]'); } catch { return []; } })();
        const intPess = (() => { try { return JSON.parse(e.pessoas_interlocutor || '[]'); } catch { return []; } })();
        return `<div class="entrada" id="d-${i}">
          <div class="entrada-head" onclick="document.getElementById('d-${i}').classList.toggle('open')">
            <div class="ttl">
              <strong>${esc(e.entidade_designacao)}</strong>
              <span class="tag">${FORMA_LBL[e.forma] || e.forma}</span>
              ${e.rtri_id ? `<span class="rtri-status ${e.rtri_status || 'PENDENTE'}">RTRI ${esc(e.rtri_id)}</span>` :
                `<span class="rtri-status NAO_APLICAVEL">${esc(NATUREZA_LBL[e.natureza_juridica] || e.natureza_juridica)}</span>`}
              ${e.decisao_incorporacao ? `<span class="tag" style="background:#e6fcf0;color:#0a4520;border-color:#86efac">→ ${DECISAO_LBL[e.decisao_incorporacao]}</span>` : '<span class="tag" style="background:#fff8e6;color:#86610a;border-color:#fde68a">⚠ Decisão pendente</span>'}
            </div>
            <div class="data">${fmtData(e.data)}</div>
          </div>
          <div class="entrada-body">
            <div class="row"><div class="lbl">Forma</div><div>${FORMA_LBL[e.forma] || e.forma}</div></div>
            <div class="row"><div class="lbl">Natureza jurídica</div><div>${esc(NATUREZA_LBL[e.natureza_juridica] || e.natureza_juridica)}</div></div>
            <div class="row"><div class="lbl">RTRI</div><div>${e.rtri_id ? `<strong>${esc(e.rtri_id)}</strong> <span class="rtri-status ${e.rtri_status}">${e.rtri_status === 'VALIDADO' ? '✓ Validado' : e.rtri_status}</span>` : '<em>Não aplicável</em>'}</div></div>
            <div class="row"><div class="lbl">Pelo Governo</div><div>${esc(govPess.join('; ') || '—')}</div></div>
            <div class="row"><div class="lbl">Pela entidade</div><div>${esc(intPess.join('; ') || '—')}</div></div>
            <div class="row"><div class="lbl">Objeto</div><div>${esc(e.objeto)}</div></div>
            <div class="row"><div class="lbl">Síntese da posição</div><div>${esc(e.sintese_posicao)}</div></div>
            ${e.decisao_incorporacao ? `
              <div class="divider"></div>
              <div class="row"><div class="lbl">Decisão</div><div><strong>${DECISAO_LBL[e.decisao_incorporacao]}</strong></div></div>
              <div class="row"><div class="lbl">Justificação</div><div>${esc(e.justificacao_decisao || '')}</div></div>
            ` : `<div class="alert warning mt-12"><div><span class="ttl">Decisão pendente</span>Necessário preencher antes de M3. <button class="btn sm" style="margin-left:10px" onclick="abrirEditarDecisaoD('${e.id}')">Preencher decisão</button></div></div>`}
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function blocoE(f) {
  return `<div class="bloco-section">
    <div class="bloco-head">
      <div class="ttl"><div class="letra">E</div><div><h3>Resultado da consulta pública</h3></div></div>
      <div class="flex gap-8">
        <button class="btn sm" onclick="abrirImportCsvCl()">↑ Importar CSV de contributos</button>
        <button class="btn sm" onclick="abrirEditarBlocoE()">Editar</button>
      </div>
    </div>
    <div class="bloco-body">
      <div class="field-grid">
        <div class="field"><label>Referência Consulta.Lex</label><div class="val ${!f.consulta_lex_ref ? 'empty' : ''}">${esc(f.consulta_lex_ref) || 'Sem consulta'}</div></div>
        <div class="field"><label>Período</label><div class="val">${f.consulta_lex_inicio ? `${fmtData(f.consulta_lex_inicio)} a ${fmtData(f.consulta_lex_fim)}` : '<span class="empty">—</span>'}</div></div>
        <div class="field"><label>N.º contributos</label><div class="val">${f.consulta_lex_n_contributos ?? '<span class="empty">—</span>'}</div></div>
        <div class="field full"><label>Síntese das principais posições <span class="help">(mínimo 300 caracteres)</span></label><div class="val ${!f.consulta_lex_sintese ? 'empty' : ''}">${esc(f.consulta_lex_sintese) || 'Por preencher'}</div></div>
        <div class="field full"><label>Decisão sobre incorporação <span class="help">(mínimo 200 caracteres)</span></label><div class="val ${!f.consulta_lex_decisao ? 'empty' : ''}">${esc(f.consulta_lex_decisao) || 'Por preencher'}</div></div>
      </div>
    </div>
  </div>`;
}

function blocoF(f) {
  return `<div class="bloco-section">
    <div class="bloco-head"><div class="ttl"><div class="letra">F</div><div><h3>Declaração do ponto focal</h3></div></div></div>
    <div class="bloco-body">
      <div class="declaration-box">"Confirmo que a presente FPL reflete todas as interações ocorridas no perímetro do diploma e que os campos obrigatórios estão integralmente preenchidos."</div>
      <div class="field-grid">
        <div class="field"><label>Declaração M3</label><div class="val">${f.m3_validado_em ? `✓ Assinada em ${fmtDH(f.m3_validado_em)}` : '<span class="empty">Pendente</span>'}</div></div>
        <div class="field"><label>Declaração M4</label><div class="val">${f.m4_validado_em ? `✓ Assinada em ${fmtDH(f.m4_validado_em)}` : '<span class="empty">Pendente</span>'}</div></div>
      </div>
      <div class="alert info mt-12"><div><span class="ttl">Lembrete legal</span>A submissão de declaração comprovadamente falsa é sujeita ao regime previsto no n.º 13 da RCM.</div></div>
    </div>
  </div>`;
}

function blocoH(f) {
  return `<div class="bloco-section">
    <div class="bloco-head"><div class="ttl"><div class="letra" style="background:#5b6478">H</div><div><h3>Histórico (versões + auditoria)</h3></div></div></div>
    <div class="bloco-body">
      ${state.versoes.length === 0 ? '<div class="card-empty">Sem histórico</div>' : `
        <div class="timeline">
        ${state.versoes.map(v => `
          <div class="timeline-item ${v.marco_validado ? 'marco' : ''}">
            <div class="ts">${fmtDH(v.timestamp)} · v${v.numero}</div>
            <div class="desc">${v.marco_validado ? `<strong>${v.marco_validado}</strong> · ` : ''}${esc(v.descricao || '')}</div>
            <div class="author">por ${esc(v.autor_nome || '')}</div>
          </div>
        `).join('')}
        </div>
      `}
    </div>
  </div>`;
}

function bindTabs() {
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => setTab(t.dataset.tab)));
}
window.setTab = (id) => {
  document.querySelectorAll('.tab').forEach(t => {
    const active = t.dataset.tab === id;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  ['A', 'B', 'C', 'D', 'E', 'F', 'CMP', 'G', 'N', 'H'].forEach(x => {
    const el = document.getElementById('tab-' + x);
    if (el) {
      if (x === id) el.removeAttribute('hidden');
      else el.setAttribute('hidden', '');
    }
  });
};

// ============ MODAIS ============
window.abrirEditarBlocoB = () => {
  const f = state.fpl;
  openModal(`
    <div class="modal-head"><h3>Editar Bloco B — Origem</h3><button class="btn ghost sm" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <form id="editBForm">
        <div class="field-grid">
          <div class="field"><label>Tipo de origem</label>
            <select name="tipo_origem">${Object.entries(ORIGEM_LBL).map(([k, v]) => `<option value="${k}" ${f.tipo_origem === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
          </div>
          <div class="field"><label>Referência da origem</label><input name="referencia_origem" value="${esc(f.referencia_origem || '')}"></div>
          <div class="field full"><label>Síntese do problema * <span class="help">(mín. 200 caracteres)</span></label>
            <textarea name="sintese_problema" rows="6">${esc(f.sintese_problema || '')}</textarea>
          </div>
          <div class="field"><label>Avaliação prévia</label>
            <select name="avaliacao_previa"><option value="">—</option><option value="1" ${f.avaliacao_previa === 1 ? 'selected' : ''}>Sim</option><option value="0" ${f.avaliacao_previa === 0 ? 'selected' : ''}>Não</option></select>
          </div>
        </div>
      </form>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" onclick="salvarBlocoB()">Guardar</button>
    </div>
  `);
};

window.salvarBlocoB = async () => {
  const fd = new FormData(document.getElementById('editBForm'));
  const body = Object.fromEntries(fd.entries());
  if (body.avaliacao_previa === '') body.avaliacao_previa = null;
  else body.avaliacao_previa = parseInt(body.avaliacao_previa, 10);
  try {
    await api(`/fpl/${state.fpl.id}/bloco-b`, { method: 'PATCH', body });
    closeModal();
    toast('Bloco B atualizado.', 'success');
    render();
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
};

window.abrirEditarBlocoE = () => {
  const f = state.fpl;
  openModal(`
    <div class="modal-head"><h3>Editar Bloco E — Consulta pública</h3><button class="btn ghost sm" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <form id="editEForm">
        <div class="field-grid">
          <div class="field"><label>Referência Consulta.Lex</label><input name="consulta_lex_ref" value="${esc(f.consulta_lex_ref || '')}"></div>
          <div class="field"><label>N.º contributos</label><input type="number" name="consulta_lex_n_contributos" value="${f.consulta_lex_n_contributos ?? ''}"></div>
          <div class="field"><label>Início</label><input type="date" name="consulta_lex_inicio" value="${(f.consulta_lex_inicio || '').slice(0,10)}"></div>
          <div class="field"><label>Fim</label><input type="date" name="consulta_lex_fim" value="${(f.consulta_lex_fim || '').slice(0,10)}"></div>
          <div class="field full"><label>Síntese das posições <span class="help">(mín. 300 caracteres)</span></label>
            <textarea name="consulta_lex_sintese" rows="5">${esc(f.consulta_lex_sintese || '')}</textarea>
          </div>
          <div class="field full"><label>Decisão sobre incorporação <span class="help">(mín. 200 caracteres)</span></label>
            <textarea name="consulta_lex_decisao" rows="4">${esc(f.consulta_lex_decisao || '')}</textarea>
          </div>
        </div>
      </form>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" onclick="salvarBlocoE()">Guardar</button>
    </div>
  `);
};
window.salvarBlocoE = async () => {
  const fd = new FormData(document.getElementById('editEForm'));
  const body = Object.fromEntries(fd.entries());
  if (body.consulta_lex_n_contributos === '') body.consulta_lex_n_contributos = null;
  else body.consulta_lex_n_contributos = parseInt(body.consulta_lex_n_contributos, 10);
  try {
    await api(`/fpl/${state.fpl.id}/bloco-e`, { method: 'PATCH', body });
    closeModal();
    toast('Bloco E atualizado.', 'success');
    render();
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
};

window.abrirNovaEntradaC = () => {
  openModal(`
    <div class="modal-head"><h3>Nova entrada · Bloco C (interno)</h3><button class="btn ghost sm" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <form id="cForm">
        <div class="field-grid">
          <div class="field"><label>Data *</label><input type="date" name="data" required value="${new Date().toISOString().slice(0,10)}"></div>
          <div class="field"><label>Forma *</label>
            <select name="forma" required><option>PARECER_ESCRITO</option><option>REUNIAO</option><option>AUDIENCIA</option></select>
          </div>
          <div class="field full"><label>Entidade contactada *</label><input name="entidade" required></div>
          <div class="field"><label>Cargo / função</label><input name="cargo"></div>
          <div class="field full"><label>Objeto *</label><input name="objeto" required></div>
          <div class="field full"><label>Síntese da posição * <span class="help">(mín. 100 caracteres)</span></label>
            <textarea name="sintese_posicao" rows="4" required></textarea>
          </div>
        </div>
      </form>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" onclick="salvarEntradaC()">Adicionar</button>
    </div>
  `);
};
window.salvarEntradaC = async () => {
  const fd = new FormData(document.getElementById('cForm'));
  const body = Object.fromEntries(fd.entries());
  try {
    await api(`/fpl/${state.fpl.id}/bloco-c`, { method: 'POST', body });
    closeModal();
    toast('Entrada Bloco C adicionada.', 'success');
    render();
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
};

window.abrirNovaEntradaD = () => {
  openModal(`
    <div class="modal-head"><h3>Nova interação externa · Bloco D</h3><button class="btn ghost sm" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="alert info"><div>Esta entrada documenta uma interação com um representante de interesses, na aceção da Lei n.º 5-A/2026.</div></div>
      <form id="dForm">
        <div class="field-grid">
          <div class="field"><label>Data *</label><input type="date" name="data" required value="${new Date().toISOString().slice(0,10)}"></div>
          <div class="field"><label>Forma *</label>
            <select name="forma" required>${Object.entries(FORMA_LBL).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
          </div>
          <div class="field full">
            <label>Pesquisar entidade no RTRI</label>
            <div class="rtri-search-wrap">
              <input id="rtriSearchInput" type="text" placeholder="Comece a escrever para pesquisar..." autocomplete="off">
              <div class="rtri-results" id="rtriResults"></div>
            </div>
            <div class="help">Selecione da lista para preencher automaticamente. Para entidades sem RTRI (peritos, autoridades), preencha manualmente abaixo.</div>
          </div>
          <div class="field full"><label>Entidade interlocutora — designação *</label><input name="entidade_designacao" id="dEnt" required></div>
          <div class="field"><label>N.º RTRI</label><input name="rtri_id" id="dRtri"></div>
          <div class="field"><label>Natureza jurídica *</label>
            <select name="natureza_juridica" required>${Object.entries(NATUREZA_LBL).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
          </div>
          <div class="field full"><label>Pessoas pelo Governo (separar com ;)</label><input name="pessoas_governo_str" placeholder="SE Ambiente; Adjunta SE"></div>
          <div class="field full"><label>Pessoas pela entidade (separar com ;)</label><input name="pessoas_interlocutor_str" placeholder="Presidente; Director"></div>
          <div class="field full"><label>Objeto * <span class="help">(mín. 50 caracteres)</span></label><textarea name="objeto" rows="2" required></textarea></div>
          <div class="field full"><label>Síntese da posição * <span class="help">(mín. 100 caracteres)</span></label><textarea name="sintese_posicao" rows="4" required></textarea></div>
        </div>
        <div class="alert warning mt-12"><div><span class="ttl">Decisão de incorporação</span>Pode preencher mais tarde, mas é <strong>obrigatória antes de validar M3</strong>.</div></div>
      </form>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" onclick="salvarEntradaD()">Adicionar interação</button>
    </div>
  `);
  // RTRI search
  const inp = document.getElementById('rtriSearchInput');
  const box = document.getElementById('rtriResults');
  let timer = null;
  inp.addEventListener('input', () => {
    clearTimeout(timer);
    const q = inp.value.trim();
    if (q.length < 2) { box.classList.remove('open'); box.innerHTML = ''; return; }
    timer = setTimeout(async () => {
      try {
        const res = await api('/rtri/entidades?q=' + encodeURIComponent(q));
        if (res.length === 0) {
          box.innerHTML = '<div class="rtri-result" style="cursor:default"><div class="nome">Sem resultados</div><div class="det">Pode preencher manualmente abaixo.</div></div>';
        } else {
          box.innerHTML = res.map(e => `
            <div class="rtri-result" onclick="selecionarRtri('${e.rtri_id}','${esc(e.designacao).replace(/'/g, '\\\'')}')">
              <div class="nome">${esc(e.designacao)}</div>
              <div class="det">${e.rtri_id} · ${esc(e.natureza_juridica || '')} <span class="rtri-status validado">✓ Ativo</span></div>
            </div>
          `).join('');
        }
        box.classList.add('open');
      } catch (e) { /* ignore */ }
    }, 200);
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.rtri-search-wrap')) box.classList.remove('open');
  });
};
window.selecionarRtri = (rtriId, nome) => {
  document.getElementById('dEnt').value = nome;
  document.getElementById('dRtri').value = rtriId;
  document.querySelector('[name=natureza_juridica]').value = 'RTRI_INSCRITO';
  document.getElementById('rtriResults').classList.remove('open');
  document.getElementById('rtriSearchInput').value = nome;
};
window.salvarEntradaD = async () => {
  const fd = new FormData(document.getElementById('dForm'));
  const body = Object.fromEntries(fd.entries());
  body.pessoas_governo = (body.pessoas_governo_str || '').split(';').map(s => s.trim()).filter(Boolean);
  body.pessoas_interlocutor = (body.pessoas_interlocutor_str || '').split(';').map(s => s.trim()).filter(Boolean);
  delete body.pessoas_governo_str; delete body.pessoas_interlocutor_str;
  try {
    await api(`/fpl/${state.fpl.id}/bloco-d`, { method: 'POST', body });
    closeModal();
    toast('Interação adicionada ao Bloco D.', 'success');
    render();
  } catch (e) {
    const errs = e.data?.errors || [];
    toast('Erro: ' + (errs.length ? errs.join(' | ') : e.message), 'error');
  }
};

window.abrirEditarDecisaoD = (eid) => {
  const e = state.fpl.bloco_d.find(x => x.id === eid);
  openModal(`
    <div class="modal-head"><h3>Decisão de incorporação · ${esc(e.entidade_designacao)}</h3><button class="btn ghost sm" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <form id="dDecForm">
        <div class="field"><label>Decisão *</label>
          <select name="decisao_incorporacao" required><option value="">—</option>${Object.entries(DECISAO_LBL).map(([k, v]) => `<option value="${k}" ${e.decisao_incorporacao === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        </div>
        <div class="field mt-12"><label>Justificação * <span class="help">(mín. 100 caracteres)</span></label>
          <textarea name="justificacao_decisao" rows="5" required>${esc(e.justificacao_decisao || '')}</textarea>
        </div>
      </form>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" onclick="salvarDecisaoD('${eid}')">Guardar</button>
    </div>
  `);
};
window.salvarDecisaoD = async (eid) => {
  const fd = new FormData(document.getElementById('dDecForm'));
  const body = Object.fromEntries(fd.entries());
  try {
    await api(`/fpl/${state.fpl.id}/bloco-d/${eid}`, { method: 'PATCH', body });
    closeModal();
    toast('Decisão guardada.', 'success');
    render();
  } catch (e) {
    toast('Erro: ' + (e.data?.errors?.join(' | ') || e.message), 'error');
  }
};

const MARCO_PRECISA_DECLARACAO = m => ['M3', 'M4'].includes(m);
const MARCO_BLOQUEANTE = m => ['M0', 'M3', 'M4', 'M5'].includes(m);

window.abrirValidacaoMarco = async (marco) => {
  // Primeira chamada: sem declaração. Para M0/M1/M2/M5 isto valida logo (não
  // exigem declaração); para M3/M4 devolve as pendências ou a exigência de
  // declaração. Em qualquer caso, captura-se o resultado.
  let pendencias = [];
  let resultado = null;
  try {
    resultado = await api(`/fpl/${state.fpl.id}/marcos/${marco}/validar`, { method: 'POST', body: {} });
  } catch (e) {
    pendencias = e.data?.pendencias || [];
  }
  // Marco que não exige declaração e passou: já está validado.
  if (resultado && resultado.ok) {
    closeModal();
    await loadFpl(state.fpl.id);
    if (resultado.comprovativo) mostrarComprovativoModal(resultado.comprovativo, marco);
    else { toast(marco + ' validado.', 'success'); render(); }
    return;
  }
  const realPend = pendencias.filter(p => p.regra !== 'declaracao_obrigatoria');
  const isBlocking = realPend.length > 0;
  openModal(`
    <div class="modal-head"><h3>Validar Marco ${marco}</h3><button class="btn ghost sm" onclick="closeModal()" aria-label="Fechar">✕</button></div>
    <div class="modal-body">
      ${isBlocking ? `
        <div class="alert danger"><div><span class="ttl">Não é possível validar ${marco}</span>O sistema bloqueia a transição até as ${realPend.length} pendência(s) abaixo serem resolvidas. <strong>Esta é a submissão bloqueante prevista no regime — sem validação não há comprovativo, e sem comprovativo o SmartLegis bloqueia a tramitação.</strong></div></div>
      ` : `
        <div class="alert success"><div><span class="ttl">Verificações automáticas cumpridas</span>${MARCO_PRECISA_DECLARACAO(marco) ? 'Falta a sua assinatura da declaração de completude (Bloco F).' : 'A FPL cumpre os requisitos.'}${MARCO_BLOQUEANTE(marco) ? ' Ao validar, o sistema emite o comprovativo criptográfico.' : ''}</div></div>
      `}
      <h4 style="font-size:13px;margin:12px 0 4px">${realPend.length === 0 ? 'Verificações' : 'Pendências bloqueantes'}</h4>
      <ul class="checklist">
        ${realPend.length === 0 ?
          '<li class="ok"><div>Todas as verificações automáticas passaram</div></li>' :
          realPend.map(p => `<li class="fail"><div>${esc(p.detalhe)}<div class="det">Campo: ${esc(p.campo)} · Regra: ${esc(p.regra)}</div></div></li>`).join('')}
      </ul>
      ${MARCO_PRECISA_DECLARACAO(marco) ? `
        <div class="declaration-box"><strong>Declaração:</strong> "Confirmo que a presente FPL reflete todas as interações ocorridas no perímetro do diploma e que os campos obrigatórios estão integralmente preenchidos."</div>
      ` : ''}
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal()">${isBlocking ? 'Voltar e corrigir' : 'Cancelar'}</button>
      ${isBlocking ?
        '<button class="btn primary" disabled>Assinar e validar (bloqueado)</button>' :
        `<button class="btn success" onclick="confirmarValidacao('${marco}')">${MARCO_PRECISA_DECLARACAO(marco) ? 'Assinar e validar' : 'Validar'} ${marco}</button>`}
    </div>
  `);
};
window.confirmarValidacao = async (marco) => {
  try {
    const r = await api(`/fpl/${state.fpl.id}/marcos/${marco}/validar`, {
      method: 'POST', body: { declaracao_assinada: true },
    });
    closeModal();
    await loadFpl(state.fpl.id);
    if (r.comprovativo) mostrarComprovativoModal(r.comprovativo, marco);
    else { toast(`${marco} validado com sucesso.`, 'success'); render(); }
  } catch (e) {
    toast('Erro: ' + e.message, 'error');
  }
};

// Modal do comprovativo criptográfico (recém-emitido ou consultado)
function mostrarComprovativoModal(c, marcoRecente) {
  const jws = c.jws || '';
  const partes = jws.split('.');
  openModal(`
    <div class="modal-head">
      <h3>${marcoRecente ? marcoRecente + ' validado — comprovativo emitido' : 'Comprovativo criptográfico'}</h3>
      <button class="btn ghost sm" onclick="closeModal()" aria-label="Fechar">✕</button>
    </div>
    <div class="modal-body">
      ${marcoRecente ? `<div class="alert success"><div><span class="ttl">Marco ${marcoRecente} validado</span>O sistema gerou o comprovativo abaixo. Copie-o e cole-o no campo correspondente do SmartLegis.</div></div>` : ''}
      <div class="field"><label>Comprovativo (JWS Ed25519)</label>
        <textarea id="cmpJws" rows="5" readonly style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;word-break:break-all">${esc(jws)}</textarea>
      </div>
      <div class="field-grid mt-12">
        <div class="field"><label>Identificador (jti)</label><div class="val"><code>${esc(c.jti || c.payload?.jti || '')}</code></div></div>
        <div class="field"><label>Marco</label><div class="val">${esc(c.marco || c.payload?.marco || marcoRecente || '')}</div></div>
        <div class="field"><label>Algoritmo</label><div class="val">EdDSA (Ed25519) · kid ${esc(c.kid || c.payload?.kid || '')}</div></div>
        <div class="field"><label>Emitido em</label><div class="val">${fmtDH(c.emitido_em || c.payload?.validado_em || '')}</div></div>
      </div>
      <div class="alert info mt-12"><div><span class="ttl">Verificação offline</span>O SmartLegis verifica este comprovativo com a chave pública partilhada (endpoint <code>/api/.well-known/fpl-jwks.json</code>), sem qualquer chamada de rede a esta aplicação. Sem comprovativo válido, a tramitação fica bloqueada.</div></div>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal();render()">Fechar</button>
      <button class="btn primary" onclick="copiarComprovativo()">Copiar para a área de transferência</button>
    </div>
  `);
}
window.copiarComprovativo = async () => {
  const ta = document.getElementById('cmpJws');
  try {
    await navigator.clipboard.writeText(ta.value);
    toast('Comprovativo copiado. Cole-o no SmartLegis.', 'success');
  } catch {
    ta.select();
    toast('Selecione o texto e copie (Ctrl+C).', 'info');
  }
};
window.verComprovativo = async (jti) => {
  try {
    const c = await api('/comprovativos/' + encodeURIComponent(jti));
    mostrarComprovativoModal(c, null);
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
};

// Registar aprovação em Conselho de Ministros (passo entre M4 e M5)
window.abrirAprovarCM = () => {
  openModal(`
    <div class="modal-head"><h3>Registar aprovação em Conselho de Ministros</h3><button class="btn ghost sm" onclick="closeModal()" aria-label="Fechar">✕</button></div>
    <div class="modal-body">
      <div class="alert info"><div>Após a aprovação do diploma em Conselho de Ministros, registe aqui a referência do Diário da República. Isto desbloqueia o marco M5 (publicação).</div></div>
      <form id="cmForm">
        <div class="field"><label for="cmDr">Referência do Diário da República *</label>
          <input id="cmDr" placeholder="Ex.: DR n.º 78/2026, Série I, de 22-04-2026" required>
        </div>
      </form>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" onclick="confirmarAprovarCM()">Confirmar aprovação</button>
    </div>
  `);
};
window.confirmarAprovarCM = async () => {
  const referencia_dr = document.getElementById('cmDr').value.trim();
  if (!referencia_dr) return toast('Indique a referência do Diário da República.', 'warning');
  try {
    await api(`/fpl/${state.fpl.id}/aprovar-cm`, { method: 'POST', body: { referencia_dr } });
    closeModal();
    toast('Aprovação em CM registada. O marco M5 está agora disponível.', 'success');
    await loadFpl(state.fpl.id);
    render();
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
};

// ============ Entidades RTRI (SGGOV) ============
async function viewEntidades() {
  const list = await api('/rtri/entidades/all');
  return `
    <div class="page-head">
      <div><div class="page-title">Entidades RTRI</div><div class="page-sub">${list.length} entidades · cache local sincronizada com a API da Assembleia da República</div></div>
      <button class="btn" onclick="sincronizarRtri(this)">Forçar sincronização</button>
    </div>
    <div class="alert info"><div><span class="ttl">Degradação graciosa</span>O RTRI é a única dependência externa crítica. Se a API da AR estiver indisponível, o ponto focal insere a entidade manualmente com validação pendente — a operação nunca fica bloqueada por falha externa.</div></div>
    <div class="card">
      <table class="tbl">
        <thead><tr><th scope="col">RTRI</th><th scope="col">Designação</th><th scope="col">Natureza</th><th scope="col">Estado</th></tr></thead>
        <tbody>
          ${list.map(e => `
            <tr><td><strong>${esc(e.rtri_id)}</strong></td><td>${esc(e.designacao)}</td><td>${esc(e.natureza_juridica || '')}</td><td><span class="rtri-status validado">✓ Ativo</span></td></tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}
window.sincronizarRtri = async (btn) => {
  if (btn) { btn.disabled = true; btn.textContent = 'A sincronizar…'; }
  try {
    const r = await api('/rtri/sincronizar', { method: 'POST' });
    toast(r.modo === 'http' ? `Sincronizadas ${r.sincronizadas} entidades do RTRI.` : 'Modo mock — cache local já está atualizada.', 'success');
  } catch (e) {
    toast('Sincronização indisponível: ' + e.message, 'warning');
  } finally {
    render();
  }
};

// ============ Auditoria QA ============
async function viewAuditoriaQa() {
  await loadFpls();
  // Para cada FPL, ler auditorias
  const auditorias = [];
  for (const f of state.fpls.slice(0, 30)) {
    const a = await api(`/fpl/${f.id}/auditoria`).catch(() => []);
    a.forEach(x => auditorias.push({ ...x, fpl: f }));
  }
  auditorias.sort((a, b) => (b.data_auditoria || '').localeCompare(a.data_auditoria || ''));
  return `
    <div class="page-head">
      <div><div class="page-title">Auditoria por amostra · Bloco G</div><div class="page-sub">Auditoria de qualidade das FPL</div></div>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="lbl">Auditorias</div><div class="val">${auditorias.length}</div></div>
      <div class="kpi"><div class="lbl">Pontuação média</div><div class="val">${auditorias.length ? Math.round(auditorias.reduce((s, a) => s + a.pontuacao, 0) / auditorias.length) : '—'}</div></div>
      <div class="kpi"><div class="lbl">Em correção</div><div class="val" style="color:var(--warning)">${auditorias.filter(a => a.pedido_correcao && a.estado_correcao !== 'CONCLUIDA').length}</div></div>
      <div class="kpi"><div class="lbl">Concluídas</div><div class="val" style="color:var(--success)">${auditorias.filter(a => !a.pedido_correcao || a.estado_correcao === 'CONCLUIDA').length}</div></div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Auditorias recentes</h3></div>
      <table class="tbl">
        <thead><tr><th>FPL</th><th>Auditor</th><th>Data</th><th>Pontuação</th><th>Estado</th></tr></thead>
        <tbody>
          ${auditorias.length === 0 ? '<tr><td colspan="5" class="card-empty">Sem auditorias registadas</td></tr>' :
          auditorias.map(a => `
            <tr onclick="setView('detalhe',{fplId:'${a.fpl.id}'})">
              <td><strong>${esc(a.fpl.numero_processo)}</strong> ${esc(a.fpl.titulo_curto || a.fpl.titulo.substring(0, 60))}</td>
              <td>${esc(a.auditor_nome)}</td>
              <td>${fmtData(a.data_auditoria)}</td>
              <td><strong style="color:${a.pontuacao >= 80 ? 'var(--success)' : 'var(--warning)'}">${a.pontuacao}</strong>/100</td>
              <td>${a.pedido_correcao ? `<span class="badge revisao dot">${a.estado_correcao || 'PENDENTE'}</span>` : '<span class="badge aprovado dot">Sem correções</span>'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ============ Exportação para o Portal do Governo (SGGOV) ============
async function viewExportacao() {
  const publicadas = await api('/export/fpl').catch(() => []);
  return `
    <div class="page-head">
      <div><h1 class="page-title">Exportação para o Portal do Governo</h1>
      <div class="page-sub">A aplicação opera confinada à RING e não serve a face pública. Após M5, gera pacotes estruturados que são transferidos para o Portal do Governo, ao lado da Agenda Pública dos membros do Governo.</div></div>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="lbl">FPL publicadas</div><div class="val">${publicadas.length}</div></div>
      <div class="kpi"><div class="lbl">Formatos</div><div class="val" style="font-size:18px">JSON · CSV · JSON-LD</div></div>
      <div class="kpi"><div class="lbl">Vocabulário</div><div class="val" style="font-size:18px">OCDE 2024</div></div>
      <div class="kpi"><div class="lbl">Transferência</div><div class="val" style="font-size:18px">Manual → automática</div></div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Datasets agregados</h3></div>
      <div class="card-body">
        <p class="small muted">Pacotes prontos para transferência para o Portal do Governo. Em formatos abertos, atualizados a cada publicação.</p>
        <div class="flex gap-8 mt-12" style="flex-wrap:wrap">
          <a class="btn" href="/api/export/datasets/fpl.json" target="_blank" rel="noopener">↓ Dataset JSON</a>
          <a class="btn" href="/api/export/datasets/fpl.csv" target="_blank" rel="noopener">↓ Dataset CSV</a>
          <a class="btn" href="/api/export/datasets/fpl.jsonld" target="_blank" rel="noopener">↓ JSON-LD (vocabulário OCDE)</a>
        </div>
      </div>
    </div>
    <div class="card mt-12">
      <div class="card-head"><h3>FPL publicadas — prontas para o Portal do Governo</h3></div>
      <table class="tbl">
        <thead><tr><th scope="col">N.º Processo</th><th scope="col">Título</th><th scope="col">Gabinete</th><th scope="col">DR</th><th scope="col">Publicado</th><th scope="col"></th></tr></thead>
        <tbody>
          ${publicadas.length === 0 ? '<tr><td colspan="6" class="card-empty">Ainda não há FPL publicadas (M5).</td></tr>' :
          publicadas.map(f => `
            <tr>
              <td><strong>${esc(f.numero_processo)}</strong></td>
              <td class="cell-titulo">${esc(f.titulo_curto || f.titulo)}</td>
              <td>${esc(f.gabinete_sigla)}</td>
              <td class="muted small">${esc(f.referencia_dr || '—')}</td>
              <td class="muted small">${fmtData(f.data_publicacao)}</td>
              <td><a class="btn ghost sm" href="/api/export/fpl/${f.id}" target="_blank" rel="noopener">Ver pacote</a></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ============ Notificações UI ============
window.abrirNotificacoes = async () => {
  const r = await api('/notificacoes');
  state.notificacoes = r;
  const items = r.items || [];
  openModal(`
    <div class="modal-head">
      <h3>Notificações ${r.nao_lidas > 0 ? `<span class="badge consulta dot" style="margin-left:6px">${r.nao_lidas} não lidas</span>` : ''}</h3>
      <div>
        ${r.nao_lidas > 0 ? '<button class="btn sm" onclick="marcarTodasLidas()">Marcar todas como lidas</button>' : ''}
        <button class="btn ghost sm" onclick="closeModal()" aria-label="Fechar">✕</button>
      </div>
    </div>
    <div class="modal-body" style="max-height:60vh;overflow-y:auto">
      ${items.length === 0 ? '<div class="card-empty">Sem notificações</div>' :
      items.map(n => `
        <div class="notif ${n.lida ? '' : 'unread'}" data-id="${n.id}">
          <div class="notif-head">
            <strong>${esc(n.titulo)}</strong>
            <span class="muted small">${fmtDH(n.criada_em)}</span>
          </div>
          <div class="notif-body">${esc(n.corpo)}</div>
          <div class="notif-actions">
            ${n.fpl_id ? `<button class="btn sm" onclick="abrirFplDeNotif('${n.fpl_id}','${n.id}')">Abrir FPL</button>` : ''}
            ${!n.lida ? `<button class="btn ghost sm" onclick="marcarLida('${n.id}')">Marcar lida</button>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `);
};
window.marcarLida = async (id) => {
  await api('/notificacoes/' + id + '/lida', { method: 'POST' });
  pollNotificacoes();
  abrirNotificacoes();
};
window.marcarTodasLidas = async () => {
  await api('/notificacoes/lidas-todas', { method: 'POST' });
  pollNotificacoes();
  abrirNotificacoes();
};
window.abrirFplDeNotif = async (fplId, notifId) => {
  await api('/notificacoes/' + notifId + '/lida', { method: 'POST' });
  closeModal();
  pollNotificacoes();
  setView('detalhe', { fplId });
};

// ============ Perfil / 2FA ============
async function viewPerfil() {
  return `
    <div class="page-head">
      <div><h1 class="page-title">O meu perfil</h1><div class="page-sub">Gestão de autenticação multi-fator</div></div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Identificação</h3></div>
      <div class="card-body">
        <div class="field-grid">
          <div class="field"><label>Nome</label><div class="val">${esc(state.user.nome)}</div></div>
          <div class="field"><label>Email</label><div class="val">${esc(state.user.email)}</div></div>
          <div class="field"><label>Papéis</label><div class="val">${state.user.papeis.map(p => esc(p.papel) + (p.gabinete_id ? ' @ ' + gabSigla(p.gabinete_id) : '')).join(', ')}</div></div>
          <div class="field"><label>2FA TOTP</label><div class="val">${state.user.totp_ativo ? '✓ Ativo' : '<span class="empty">Não configurado</span>'}</div></div>
        </div>
      </div>
    </div>
    <div class="card mt-12">
      <div class="card-head"><h3>Autenticação multi-fator (2FA)</h3></div>
      <div class="card-body">
        <p class="small muted">Recomenda-se ativar 2FA TOTP para todas as contas com papel de validação. Compatível com Google Authenticator, Microsoft Authenticator, Authy e equivalentes.</p>
        ${state.user.totp_ativo ? `
          <button class="btn danger mt-12" onclick="desativarTotp()">Desativar 2FA</button>
        ` : `
          <button class="btn primary mt-12" onclick="iniciarSetupTotp()">Configurar 2FA agora</button>
        `}
      </div>
    </div>
    <div class="card mt-12">
      <div class="card-head"><h3>Sessão</h3></div>
      <div class="card-body">
        <p class="small muted">Sessão ativa via cookie httpOnly + JWT (HS256, validade 8h). CSRF protegido por double-submit cookie.</p>
        <button class="btn mt-12" onclick="logout()">Terminar sessão</button>
      </div>
    </div>
  `;
}
window.iniciarSetupTotp = async () => {
  try {
    const r = await api('/auth/totp/setup', { method: 'POST' });
    // Render QR via API pública qr-server (apenas para demo) - mas CSP bloqueia. Vou desenhar texto.
    openModal(`
      <div class="modal-head"><h3>Configurar 2FA</h3><button class="btn ghost sm" onclick="closeModal()">✕</button></div>
      <div class="modal-body">
        <ol style="padding-left:20px;line-height:1.8">
          <li>Abra a sua app autenticadora (Google Authenticator, Microsoft Authenticator, Authy).</li>
          <li>Escolha "+ Adicionar conta" → "Introduzir chave manual".</li>
          <li>Use estes valores:
            <div style="background:#fafbfc;border:1px solid var(--border);border-radius:4px;padding:10px;margin:8px 0">
              <div><strong>Conta:</strong> ${esc(state.user.email)}</div>
              <div><strong>Emissor:</strong> FPL Ponte</div>
              <div><strong>Chave:</strong> <code style="font-size:13px;word-break:break-all">${esc(r.secret)}</code></div>
              <div><strong>Tipo:</strong> Time-based (TOTP) · 30s · 6 dígitos</div>
            </div>
          </li>
          <li>Insira o código de 6 dígitos gerado para confirmar:</li>
        </ol>
        <div class="field"><label for="totpInp">Código de confirmação</label>
          <input id="totpInp" inputmode="numeric" pattern="\\d{6}" maxlength="6" autocomplete="one-time-code">
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn" onclick="closeModal()">Cancelar</button>
        <button class="btn primary" onclick="confirmarTotp()">Ativar 2FA</button>
      </div>
    `);
    setTimeout(() => document.getElementById('totpInp')?.focus(), 50);
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
};
window.confirmarTotp = async () => {
  const token = document.getElementById('totpInp').value;
  try {
    await api('/auth/totp/activate', { method: 'POST', body: { token } });
    state.user.totp_ativo = true;
    closeModal();
    toast('2FA ativado.', 'success');
    render();
  } catch (e) { toast(e.message, 'error'); }
};
window.desativarTotp = async () => {
  if (!confirm('Desativar 2FA? Recomenda-se manter ativo para contas com poderes de validação.')) return;
  await api('/auth/totp/disable', { method: 'POST' });
  state.user.totp_ativo = false;
  toast('2FA desativado.', 'warning');
  render();
};

// ============ Outbox SGGOV ============
async function viewOutbox() {
  const items = await api('/admin/outbox');
  return `
    <div class="page-head">
      <div><h1 class="page-title">Outbox de email</h1><div class="page-sub">Notificações encaminhadas para SMTP do Governo (modo demonstração)</div></div>
      <button class="btn primary" onclick="processarOutbox()">Processar pendentes</button>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="lbl">Total</div><div class="val">${items.length}</div></div>
      <div class="kpi"><div class="lbl">Pendentes</div><div class="val" style="color:var(--warning)">${items.filter(i => i.estado === 'PENDENTE').length}</div></div>
      <div class="kpi"><div class="lbl">Enviadas</div><div class="val" style="color:var(--success)">${items.filter(i => i.estado === 'ENVIADO').length}</div></div>
      <div class="kpi"><div class="lbl">Falhadas</div><div class="val" style="color:var(--danger)">${items.filter(i => i.estado === 'FALHADO').length}</div></div>
    </div>
    <div class="card">
      <table class="tbl">
        <thead><tr><th>Destinatário</th><th>Assunto</th><th>Estado</th><th>Tentativas</th><th>Criada</th></tr></thead>
        <tbody>
          ${items.length === 0 ? '<tr><td colspan="5" class="card-empty">Sem mensagens em fila</td></tr>' :
          items.map(m => `
            <tr>
              <td>${esc(m.destinatario_email)}</td>
              <td>${esc(m.assunto)}</td>
              <td><span class="badge ${m.estado === 'ENVIADO' ? 'aprovado' : (m.estado === 'FALHADO' ? 'cm' : 'elaboracao')} dot">${m.estado}</span></td>
              <td>${m.tentativas}</td>
              <td class="muted small">${fmtDH(m.criado_em)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}
window.processarOutbox = async () => {
  const r = await api('/admin/outbox/processar', { method: 'POST' });
  toast(`Processadas ${r.enviados} mensagens.`, 'success');
  render();
};

// ============ RENDER ============
async function render() {
  if (!state.user) return renderLogin();
  renderShell();
  const main = document.getElementById('main');
  main.innerHTML = '<div class="card-empty"><div class="spinner-big" style="margin:0 auto 8px"></div>A carregar...</div>';
  try {
    let html = '';
    switch (state.view) {
      case 'dashboard': html = await viewDashboard(); break;
      case 'lista': html = await viewLista(); break;
      case 'nova': html = await viewNova(); break;
      case 'detalhe': html = await viewDetalhe(); break;
      case 'entidades': html = await viewEntidades(); break;
      case 'auditoria': html = await viewAuditoriaQa(); break;
      case 'exportacao': html = await viewExportacao(); break;
      case 'perfil': html = await viewPerfil(); break;
      case 'outbox': html = await viewOutbox(); break;
      default: html = await viewDashboard();
    }
    main.innerHTML = html;
    if (state.view === 'detalhe') bindTabs();
    if (state.view === 'nova') bindNovaFpl();
    pollNotificacoes();
  } catch (e) {
    main.innerHTML = `<div class="alert danger"><div><span class="ttl">Erro ao carregar</span>${esc(e.message)}</div></div>`;
  }
}

// ============ Anexos ============
window.abrirUploadAnexo = (entradaId, blocoDefault) => {
  openModal(`
    <div class="modal-head"><h3>Carregar anexo</h3><button class="btn ghost sm" onclick="closeModal()" aria-label="Fechar">✕</button></div>
    <div class="modal-body">
      <div class="alert info"><div>Tipos aceites: PDF, DOC(X), XLS(X). Tamanho máximo 20 MB. SHA-256 calculado e scan antivírus aplicado.</div></div>
      <form id="upForm">
        <div class="field"><label for="upFile">Ficheiro *</label>
          <input type="file" id="upFile" name="file" accept=".pdf,.doc,.docx,.xls,.xlsx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required>
        </div>
        <div class="field"><label for="upBloco">Bloco associado</label>
          <select id="upBloco" name="bloco">
            <option value="A" ${blocoDefault === 'A' ? 'selected' : ''}>A · Identificação</option>
            <option value="B" ${blocoDefault === 'B' ? 'selected' : ''}>B · Origem</option>
            <option value="C" ${blocoDefault === 'C' ? 'selected' : ''}>C · Internos</option>
            <option value="D" ${blocoDefault === 'D' ? 'selected' : ''}>D · Externos</option>
            <option value="E" ${blocoDefault === 'E' ? 'selected' : ''}>E · Consulta pública</option>
          </select>
        </div>
        <div class="field"><label for="upVis">Visibilidade após M5</label>
          <select id="upVis" name="visibilidade"><option value="INTERNO">Interno (apenas SGGOV / gabinete)</option><option value="PUBLICO">Público</option></select>
        </div>
      </form>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" onclick="confirmarUpload('${entradaId || ''}')">Carregar</button>
    </div>
  `);
};
window.confirmarUpload = async (entradaId) => {
  const file = document.getElementById('upFile').files[0];
  if (!file) return toast('Selecione um ficheiro.', 'warning');
  const bloco = document.getElementById('upBloco').value;
  const visibilidade = document.getElementById('upVis').value;
  try {
    const r = await uploadFile(`/fpl/${state.fpl.id}/anexos`, file, {
      bloco, visibilidade, ...(entradaId ? { entrada_id: entradaId } : {}),
    });
    closeModal();
    if (r.antivirus_status === 'INFETADO') {
      toast('Ficheiro guardado em quarentena (antivírus detetou padrão suspeito).', 'warning');
    } else {
      toast('Ficheiro carregado.', 'success');
    }
    await loadFpl(state.fpl.id);
    render();
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
};
window.eliminarAnexo = async (id) => {
  if (!confirm('Eliminar este anexo? A operação é registada no log de auditoria.')) return;
  try { await api('/anexos/' + id, { method: 'DELETE' }); await loadFpl(state.fpl.id); render(); toast('Anexo eliminado.', 'success'); }
  catch (e) { toast('Erro: ' + e.message, 'error'); }
};

// ============ Auditoria QA ============
window.abrirNovaAuditoria = () => {
  openModal(`
    <div class="modal-head"><h3>Nova auditoria · Bloco G</h3><button class="btn ghost sm" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <form id="audForm">
        <div class="field"><label for="audPont">Pontuação de completude (0-100) *</label>
          <input id="audPont" type="number" min="0" max="100" value="85" required>
        </div>
        <div class="field"><label for="audObs">Observações</label>
          <textarea id="audObs" rows="4" placeholder="Notas sobre a qualidade da FPL, completude, fundamentação das decisões..."></textarea>
        </div>
        <div class="field">
          <label><input type="checkbox" id="audPC" onchange="document.getElementById('audDescWrap').style.display=this.checked?'block':'none'"> Solicitar correção ao ponto focal</label>
        </div>
        <div class="field" id="audDescWrap" style="display:none">
          <label for="audDesc">Descrição do pedido de correção</label>
          <textarea id="audDesc" rows="3" placeholder="Indique claramente o que precisa ser corrigido."></textarea>
        </div>
      </form>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" onclick="salvarAuditoria()">Registar auditoria</button>
    </div>
  `);
};
window.salvarAuditoria = async () => {
  const body = {
    pontuacao: parseInt(document.getElementById('audPont').value, 10),
    observacoes: document.getElementById('audObs').value,
    pedido_correcao: document.getElementById('audPC').checked,
    descricao_correcao: document.getElementById('audDesc').value,
  };
  try {
    await api(`/fpl/${state.fpl.id}/auditoria`, { method: 'POST', body });
    closeModal();
    toast('Auditoria registada.', 'success');
    await loadFpl(state.fpl.id);
    render();
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
};
window.iniciarCorrecao = async (aid) => {
  await api(`/fpl/${state.fpl.id}/auditoria/${aid}`, { method: 'PATCH', body: { estado_correcao: 'EM_CURSO' } });
  toast('Correção iniciada.', 'success');
  await loadFpl(state.fpl.id); render();
};
window.submeterCorrecao = async (aid) => {
  if (!confirm('Submeter correções? A FPL volta ao estado anterior e a SGGOV é notificada para aprovação.')) return;
  await api(`/fpl/${state.fpl.id}/auditoria/${aid}`, { method: 'PATCH', body: { estado_correcao: 'SUBMETIDA' } });
  toast('Correção submetida para revisão SGGOV.', 'success');
  await loadFpl(state.fpl.id); render();
};
window.aprovarCorrecao = async (aid) => {
  await api(`/fpl/${state.fpl.id}/auditoria/${aid}`, { method: 'PATCH', body: { estado_correcao: 'CONCLUIDA' } });
  toast('Correção aprovada.', 'success');
  await loadFpl(state.fpl.id); render();
};

// ============ Import CSV Consulta.Lex ============
window.abrirImportCsvCl = () => {
  openModal(`
    <div class="modal-head"><h3>Importar contributos da Consulta.Lex (CSV)</h3><button class="btn ghost sm" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="alert info"><div><span class="ttl">Modo fallback</span>Use este formulário enquanto o webhook automático Consulta.Lex não está ligado. Em produção, esta operação é automática.</div></div>
      <form id="clForm">
        <div class="field"><label for="clRef">Referência da consulta *</label><input id="clRef" placeholder="CL-2026-..." required></div>
        <div class="field"><label for="clCsv">Contributos (CSV) *</label>
          <textarea id="clCsv" rows="8" placeholder="data,entidade,tipo_entidade,tema,sintese
2026-04-01,&quot;APREN&quot;,Associação,Energia,&quot;Posição sobre o regime das CER...&quot;
2026-04-03,&quot;Cidadão anónimo&quot;,Particular,,Concorda com o diploma..."></textarea>
          <div class="help">Formato: data,entidade,tipo_entidade,tema,sintese. Aspas duplas para campos com vírgulas.</div>
        </div>
      </form>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" onclick="importarCl()">Importar</button>
    </div>
  `);
};
window.importarCl = async () => {
  const cl_ref = document.getElementById('clRef').value.trim();
  const csv = document.getElementById('clCsv').value;
  if (!cl_ref || !csv) return toast('Preencha a referência e o CSV.', 'warning');
  try {
    const r = await api(`/fpl/${state.fpl.id}/consulta-lex/import-csv`, { method: 'POST', body: { cl_ref, csv } });
    closeModal();
    toast(`Importados ${r.importados} contributos (${r.total} no total).`, 'success');
    await loadFpl(state.fpl.id); render();
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
};

// ============ BOOT ============
async function bootApp() {
  await loadGabinetes();
  state.view = 'dashboard';
  // CSRF token cookie é definido pelo middleware de qualquer pedido GET
  await api('/auth/csrf').catch(() => null);
  render();
  if (notifPollHandle) clearInterval(notifPollHandle);
  notifPollHandle = setInterval(pollNotificacoes, 30_000);
}

(async function init() {
  try {
    state.user = await api('/auth/me');
    await bootApp();
  } catch {
    renderLogin();
  }
})();
