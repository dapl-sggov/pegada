// views/login.js — Login simplificado v2.0.
// Em dev: role-cards com email pré-preenchido (driver `mock`, sem password).
// Em produção: botão Entra ID (redirect).

import { api } from '../api.js';
import { state } from '../state.js';
import { toast } from '../utils.js';
import { ico } from '../icons.js';

const ROLES_DEMO = [
  { email: 'maria.silva@maen.gov.pt',         iniciais: 'MS', cor: '#1d3461', nome: 'Maria Silva',    papel: 'PF · MAEN' },
  { email: 'joao.santos@ms.gov.pt',           iniciais: 'JS', cor: '#0f7858', nome: 'João Santos',    papel: 'PF · MS' },
  { email: 'ana.pereira@mtsss.gov.pt',        iniciais: 'AP', cor: '#5b3aa3', nome: 'Ana Pereira',    papel: 'PF · MTSSS' },
  { email: 'rui.ferreira@sggoverno.gov.pt',   iniciais: 'RF', cor: '#a36507', nome: 'Rui Ferreira',   papel: 'SGGOV · QA' },
  { email: 'carla.almeida@sggoverno.gov.pt',  iniciais: 'CA', cor: '#a71728', nome: 'Carla Almeida',  papel: 'SGGOV · Admin' },
  { email: 'goncalo.matos@sggoverno.gov.pt',  iniciais: 'GM', cor: '#1d3461', nome: 'Gonçalo Matos',  papel: 'GSEPCM' },
];

export function renderLogin() {
  document.getElementById('root').innerHTML = `
    <div class="login-page">
      <div class="login-card" role="main" aria-labelledby="loginTitle">
        <div class="crest" aria-hidden="true">${ico('crest', { size: 28 })}</div>
        <h1 id="loginTitle">Pegada Legislativa do Governo</h1>
        <div class="sub">FPL Ponte v2.0 (simplificada) · Aplicação interna SGGOV</div>

        <button id="entraBtn" class="btn primary" type="button" style="width:100%;justify-content:center;padding:12px;font-size:14px;font-weight:600;margin-top:18px;gap:8px">
          ${ico('key', { size: 14 })} Entrar com conta Microsoft 365 do Governo
        </button>

        <div style="display:flex;align-items:center;gap:12px;margin:18px 0 12px;color:var(--text-faint);font-size:11px;text-transform:uppercase;letter-spacing:.6px">
          <div style="flex:1;height:1px;background:var(--border)"></div>
          ou em demonstração
          <div style="flex:1;height:1px;background:var(--border)"></div>
        </div>

        <div class="login-roles" id="loginRoles">
          <div class="role-grid">
            ${ROLES_DEMO.map(r => `
              <button type="button" class="role-card" data-email="${r.email}" aria-label="Entrar como ${r.nome}">
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
            <label for="loginEmail">Email institucional</label>
            <input type="email" id="loginEmail" name="email" required autocomplete="email" aria-required="true" placeholder="nome.apelido@<ministério>.gov.pt">
          </div>
          <div id="loginErr" role="alert" aria-live="polite" style="color:var(--danger);font-size:12px;margin-bottom:10px;display:none"></div>
          <button class="btn" type="submit" style="width:100%;justify-content:center;padding:10px;font-size:13px">Entrar (modo demonstração)</button>
        </form>
      </div>
    </div>
  `;

  document.getElementById('entraBtn').addEventListener('click', () => {
    window.location.href = '/api/auth/entra/start';
  });

  document.querySelectorAll('.role-card[data-email]').forEach(el => {
    el.addEventListener('click', async () => {
      const email = el.dataset.email;
      await fazerLogin(email);
    });
  });

  document.getElementById('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    if (!email) return;
    await fazerLogin(email);
  });

  async function fazerLogin(email) {
    try {
      const u = await api('/auth/login', { method: 'POST', body: { email } });
      state.user = u;
      const { bootApp } = await import('../main.js');
      await bootApp();
    } catch (err) {
      const eD = document.getElementById('loginErr');
      eD.textContent = err.message || 'Falha ao autenticar';
      eD.style.display = 'block';
      if (err.status === 400 && err.message?.includes('Entra')) {
        eD.textContent = 'O modo de demonstração não está ativo neste servidor. Use "Entrar com Microsoft 365".';
      }
    }
  }

  setTimeout(() => document.getElementById('loginEmail')?.focus(), 50);
}

window.logout = async () => {
  await api('/auth/logout', { method: 'POST' }).catch(() => null);
  state.user = null;
  renderLogin();
};
