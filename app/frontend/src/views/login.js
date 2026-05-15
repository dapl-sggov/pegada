// views/login.js — Ecrã de autenticação (email+password e CMD/CC mock).

import { api } from '../api.js';
import { state } from '../state.js';
import { toast } from '../utils.js';

export function renderLogin() {
  const need2fa = !!state.pending2FA;
  document.getElementById('root').innerHTML = `
    <div class="login-page">
      <div class="login-card" role="main" aria-labelledby="loginTitle">
        <div class="crest" aria-hidden="true">RP</div>
        <h1 id="loginTitle">Pegada Legislativa do Governo</h1>
        <div class="sub">FPL Ponte v1.0-rc · Aplicação de demonstração</div>
        <button id="cmdBtn" class="btn" type="button" style="width:100%;justify-content:center;padding:10px;margin-bottom:8px;border-color:var(--gov-blue);color:var(--gov-blue)">
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
      const { bootApp } = await import('../main.js');
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

window.logout = async () => {
  await api('/auth/logout', { method: 'POST' }).catch(() => null);
  state.user = null;
  renderLogin();
};
