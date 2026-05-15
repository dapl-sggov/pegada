// render.js — Render dispatcher: monta o shell e despacha para a view.
// Despacho é um switch sobre `state.view`; cada view devolve uma string HTML.

import { state } from './state.js';
import { esc } from './utils.js';
import { renderShell } from './shell.js';
import { renderLogin } from './views/login.js';
import { viewDashboard } from './views/dashboard.js';
import { viewLista, bindLista } from './views/lista.js';
import { viewNova, bindNovaFpl } from './views/nova.js';
import { viewDetalhe, bindTabs } from './views/detalhe.js';
import { viewEntidades, viewAuditoriaQa, viewExportacao, viewPerfil, viewOutbox } from './views/admin.js';
import { iniciarCanalNotificacoes } from './notifications.js';

export async function renderRoot() {
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
    if (state.view === 'lista') bindLista();
    iniciarCanalNotificacoes(); // idempotente — primeiro arranque liga, restantes são no-op
  } catch (e) {
    main.innerHTML = `<div class="alert danger"><div><span class="ttl">Erro ao carregar</span>${esc(e.message)}</div></div>`;
  }
}
