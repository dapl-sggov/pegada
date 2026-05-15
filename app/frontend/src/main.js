// main.js — Entry point. Carrega a sessão atual e arranca a aplicação,
// ou renderiza o ecrã de login. Liga atalhos globais e tema.

import { state } from './state.js';
import { api } from './api.js';
import { loadGabinetes } from './data.js';
import { renderRoot } from './render.js';
import { renderLogin } from './views/login.js';
import { ligarAtalhosGlobais } from './cmdk.js';
import { inicializarTema } from './tema.js';
// Side-effect imports: registam window.* handlers usados por inline onclick
import './router.js';
import './notifications.js';
import './wizard-bloco-d.js';
import './diff-viewer.js';

export async function bootApp() {
  await loadGabinetes();
  state.view = 'dashboard';
  // Garante que o cookie CSRF está definido antes de qualquer mutação
  await api('/auth/csrf').catch(() => null);
  renderRoot();
}

(async function init() {
  inicializarTema();
  ligarAtalhosGlobais();
  try {
    state.user = await api('/auth/me');
    await bootApp();
  } catch {
    renderLogin();
  }
})();
