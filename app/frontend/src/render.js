// render.js — Render dispatcher.

import { state } from './state.js';
import { esc } from './utils.js';
import { renderShell } from './shell.js';
import { renderLogin } from './views/login.js';
import { viewDashboard } from './views/dashboard.js';
import { viewLista, bindLista } from './views/lista.js';
import { viewNova, bindNovaFpl } from './views/nova.js';
import { viewDetalhePainel, bindDetalhePainel } from './views/detalhe-painel.js';
import { renderAdmin } from './views/admin.js';

export async function renderRoot() {
  if (!state.user) return renderLogin();
  renderShell();
  const main = document.getElementById('main');

  if (state.view === 'detalhe') main.classList.add('no-padding');
  else main.classList.remove('no-padding');

  main.innerHTML = '<div class="card-empty"><div class="spinner-big" style="margin:0 auto 8px"></div>A carregar...</div>';

  try {
    let html = '';
    switch (state.view) {
      case 'dashboard': html = await viewDashboard(); break;
      case 'lista':     html = await viewLista(); break;
      case 'nova':      html = await viewNova(); break;
      case 'detalhe':   html = await viewDetalhePainel(); break;
      case 'admin':     await renderAdmin(); return; // renderAdmin escreve diretamente em #main
      default:          html = await viewDashboard();
    }
    main.innerHTML = html;
    if (state.view === 'detalhe') bindDetalhePainel();
    if (state.view === 'nova')    bindNovaFpl();
    if (state.view === 'lista')   bindLista();
  } catch (e) {
    main.innerHTML = `<div class="alert danger"><div><span class="ttl">Erro ao carregar</span>${esc(e.message)}</div></div>`;
  }
}
