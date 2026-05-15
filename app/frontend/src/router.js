// router.js — Roteador minimalista. Mantém o estado da view atual em
// `state.view` e delega o desenho ao módulo `render.js`. As funções
// expostas em window.* permitem chamadas a partir de handlers HTML
// inline (`onclick="setView('lista')"`) sem refactor de markup.

import { state } from './state.js';
import { renderRoot } from './render.js';

export function setView(view, opts = {}) {
  state.view = view;
  if (opts.fplId !== undefined) state.fplId = opts.fplId;
  renderRoot();
  window.scrollTo(0, 0);
}

window.setView = setView;
