// shell.js — Layout permanente do painel: sidebar escura + main column.

import { state, isSggov, isAdmin, myGabinete, gabSigla, isQa } from './state.js';
import { esc, initials } from './utils.js';
import { setView } from './router.js';
import { ico } from './icons.js';

export function renderShell() {
  const user = state.user;
  const sggov = isSggov();
  const adm = isAdmin();
  const qa = isQa();
  const ativos = state.fpls?.filter?.(f => !['PUBLICADO', 'ARQUIVADO'].includes(f.estado)).length;
  const emCm = state.fpls?.filter?.(f => f.estado === 'EM_CM').length;
  const publicadas = state.fpls?.filter?.(f => f.estado === 'PUBLICADO').length;
  const papelLbl = sggov
    ? (adm ? 'SGGOV · Admin' : qa ? 'SGGOV · QA' : 'GSEPCM')
    : (user.papeis.find(p => p.gabinete_id) ? 'PF · ' + gabSigla(myGabinete()) : 'Utilizador');

  document.documentElement.classList.add('painel-mode');
  document.body.classList.add('painel');

  document.getElementById('root').innerHTML = `
    <a href="#main" class="skip-link">Saltar para o conteúdo principal</a>
    <div class="painel-app">
      <aside class="painel-side" aria-label="Menu lateral">
        <div class="brand">
          <div class="brand-name">FPL · SGGOV</div>
          <div class="brand-sub">Pegada Legislativa</div>
        </div>
        <div class="group">
          <div class="group-title">Trabalho</div>
          <button class="link ${state.view === 'dashboard' ? 'active' : ''}" data-nav="dashboard">
            <span class="ico">${ico('dashboard')}</span>Dashboard
          </button>
          <button class="link ${state.view === 'lista' || state.view === 'detalhe' ? 'active' : ''}" data-nav="lista">
            <span class="ico">${ico('lista')}</span>${sggov ? 'Todas as FPL' : 'As minhas FPL'}
            ${ativos > 0 ? `<span class="pill">${ativos}</span>` : ''}
          </button>
          ${!sggov ? `<button class="link ${state.view === 'nova' ? 'active' : ''}" data-nav="nova">
            <span class="ico">${ico('nova')}</span>Nova FPL
          </button>` : ''}
        </div>
        <div class="group">
          <div class="group-title">Vistas rápidas</div>
          ${emCm > 0 ? `<button class="link" data-nav="lista" data-filtro-estado="EM_CM"><span class="ico">${ico('cm')}</span>Em CM</button>` : ''}
          ${publicadas > 0 ? `<button class="link" data-nav="lista" data-filtro-estado="PUBLICADO"><span class="ico">${ico('check')}</span>Publicadas</button>` : ''}
          ${sggov ? `<button class="link ${state.view === 'admin' ? 'active' : ''}" data-nav="admin"><span class="ico">${ico('flag')}</span>Admin SGGOV</button>` : ''}
        </div>
        <div class="group">
          <div class="group-title">Ajuda</div>
          <button class="link" id="cmdkLink"><span class="ico">${ico('cmd')}</span>Paleta (⌘K)</button>
          <button class="link" id="temaLink"><span class="ico" id="temaIco">${iconeTema(state.tema)}</span>Tema</button>
          <a class="link" href="/declaracao-acessibilidade.html"><span class="ico">${ico('accessibility')}</span>Acessibilidade</a>
        </div>
        <div class="bottom">
          <div class="av">${initials(user.nome)}</div>
          <div class="nm">
            <strong>${esc(user.nome.split(' ').slice(0, 2).join(' '))}</strong>
            <span>${esc(papelLbl)}</span>
          </div>
          <button id="logoutBtn" aria-label="Terminar sessão" style="background:none;border:none;color:var(--sidebar-fg);cursor:pointer;margin-left:auto;padding:4px" title="Terminar sessão">${ico('logout', { size: 14 })}</button>
        </div>
      </aside>
      <div class="painel-main">
        <main id="main" class="painel-main-inner" tabindex="-1"></main>
      </div>
    </div>
  `;

  document.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', () => {
      if (el.dataset.filtroEstado) {
        state.filtrosLista = { q: '', estado: el.dataset.filtroEstado, gabinete: '', tipo: '' };
      }
      setView(el.dataset.nav);
    });
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } });
  });
  document.getElementById('cmdkLink')?.addEventListener('click', () => window.abrirCmdK?.());
  document.getElementById('temaLink')?.addEventListener('click', () => window.alternarTema?.());
  document.getElementById('logoutBtn')?.addEventListener('click', () => window.logout?.());
}

export function iconeTema(t) {
  if (t === 'escuro')          return ico('moon');
  if (t === 'claro')           return ico('sun');
  if (t === 'alto-contraste')  return ico('contrast');
  return ico('moon');
}
