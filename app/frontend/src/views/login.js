// views/login.js — Ecrã de autenticação.
// Role-cards (caminho rápido em demo) + form email/password + CMD/CC.

import { api } from '../api.js';
import { state } from '../state.js';
import { toast } from '../utils.js';
import { ico } from '../icons.js';

const ROLES_DEMO = [
  { email: 'maria.silva@gov.pt',     iniciais: 'MS', cor: '#1d3461', nome: 'Maria Silva',    papel: 'PF · MAE' },
  { email: 'rui.ferreira@sggov.pt',  iniciais: 'RF', cor: '#a36507', nome: 'Rui Ferreira',   papel: 'SGGOV · QA' },
  { email: 'carla.almeida@sggov.pt', iniciais: 'CA', cor: '#a71728', nome: 'Carla Almeida',  papel: 'SGGOV · Admin' },
  { email: 'ana.santos@gov.pt',      iniciais: 'AS', cor: '#0f7858', nome: 'Ana Santos',     papel: 'PF · MS' },
];

export function renderLogin() {
  const need2fa = !!state.pending2FA;
  document.getElementById('root').innerHTML = `
    <div class="login-page">
      <div class="login-card" role="main" aria-labelledby="loginTitle">
        <div class="crest" aria-hidden="true">${ico('crest', { size: 28 })}</div>
        <h1 id="loginTitle">Pegada Legislativa do Governo</h1>
        <div class="sub">FPL Ponte v1.0-rc · Aplicação interna SGGOV</div>

        <div class="login-roles" id="loginRoles" ${need2fa ? 'style="display:none"' : ''}>
          <div class="ttl">Entrar como — demonstração</div>
          <div class="role-grid">
            ${ROLES_DEMO.map(r => `
              <button type="button" class="role-card" data-fill="${r.email}" aria-label="Preencher como ${r.nome}">
                <div class="avatar" style="background:${r.cor}">${r.iniciais}</div>
                <div class="meta">
                  <div class="nome">${r.nome}</div>
                  <div class="papel">${r.papel}</div>
                </div>
              </button>
            `).join('')}
          </div>
        </div>

        <form id="loginForm" novalidate style="margin-top:18px">
          <div class="form-row">
            <label for="loginEmail">Email</label>
            <input type="email" id="loginEmail" name="email" required autocomplete="email" aria-required="true" value="${state.pending2FA?.email || ''}">
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
          <button class="btn primary" type="submit" style="width:100%;justify-content:center;padding:12px;font-size:14px;font-weight:600">Entrar</button>
        </form>

        <div style="display:flex;align-items:center;gap:12px;margin:18px 0 12px;color:var(--text-faint);font-size:11px;text-transform:uppercase;letter-spacing:.6px">
          <div style="flex:1;height:1px;background:var(--border)"></div>
          ou
          <div style="flex:1;height:1px;background:var(--border)"></div>
        </div>

        <button id="cmdBtn" class="btn" type="button" style="width:100%;justify-content:center;padding:11px;border-color:var(--gov-blue);color:var(--gov-blue);gap:8px">
          ${ico('key', { size: 14 })} Entrar com Cartão de Cidadão / CMD
        </button>
      </div>
    </div>
  `;

  // Role-cards: preenche o form e foca a password
  document.querySelectorAll('.role-card[data-fill]').forEach(el => {
    el.addEventListener('click', () => {
      const email = el.dataset.fill;
      document.getElementById('loginEmail').value = email;
      document.getElementById('loginPwd').value = 'demo1234';
      document.getElementById('loginPwd').focus();
    });
  });

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

// Compatibilidade: alguns testes/legacy chamam window.fillLogin(email)
window.fillLogin = (email) => {
  const em = document.getElementById('loginEmail');
  const pw = document.getElementById('loginPwd');
  if (em) em.value = email;
  if (pw) pw.value = 'demo1234';
};

window.logout = async () => {
  await api('/auth/logout', { method: 'POST' }).catch(() => null);
  state.user = null;
  renderLogin();
};
