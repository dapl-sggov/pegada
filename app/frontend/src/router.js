// router.js — Hash-based router com deep-linking.
//
// Formatos suportados:
//   #/dashboard
//   #/lista
//   #/nova
//   #/fpl/<id>            → vista de detalhe (sub default = sessão)
//   #/fpl/<id>/detalhe    → vista de detalhe, modo detalhe
//   #/fpl/<id>/cronograma → vista de detalhe, modo cronograma
//   #/auditoria | #/entidades | #/exportacao | #/perfil | #/outbox
//
// `setView()` muta state + emite o hash novo → `hashchange` (que disparamos
// também via popstate quando o utilizador faz "voltar") chama `renderRoot`.
//
// Convenção: a *única* via de transição entre views é `setView`. Não há
// `state.view = ...` espalhado pelo código.

import { state } from './state.js';
import { renderRoot } from './render.js';

const VIEWS_SIMPLES = new Set([
  'dashboard', 'lista', 'nova', 'auditoria', 'entidades', 'exportacao', 'perfil', 'outbox',
]);

/**
 * Lê o hash atual e devolve um descritor `{view, fplId, sub}`.
 * Tolerante a hashes vazios, malformados e legados.
 */
export function parseHash() {
  const raw = (window.location.hash || '').replace(/^#\/?/, '');
  if (!raw) return { view: 'dashboard', fplId: null, sub: null };
  const parts = raw.split('/').filter(Boolean);

  if (parts[0] === 'fpl' && parts[1]) {
    return { view: 'detalhe', fplId: parts[1], sub: parts[2] || null };
  }
  if (VIEWS_SIMPLES.has(parts[0])) {
    return { view: parts[0], fplId: null, sub: null };
  }
  return { view: 'dashboard', fplId: null, sub: null };
}

/** Constrói o hash que representa o estado atual da aplicação. */
function buildHash(view, opts = {}) {
  if (view === 'detalhe' && opts.fplId) {
    return opts.sub ? `#/fpl/${opts.fplId}/${opts.sub}` : `#/fpl/${opts.fplId}`;
  }
  return `#/${view}`;
}

let _ignoreNextHashChange = false;

export function setView(view, opts = {}) {
  state.view = view;
  if (opts.fplId !== undefined) state.fplId = opts.fplId;
  if (view === 'detalhe' && opts.sub) {
    // Persistir a vista de detalhe escolhida (sincronizado com o sessionStorage
    // que detalhe-painel.js já usa).
    try { sessionStorage.setItem('fpl.detailView.' + state.fplId, opts.sub); } catch {}
  }
  const novo = buildHash(view, { fplId: state.fplId, sub: opts.sub });
  if (window.location.hash !== novo) {
    _ignoreNextHashChange = true;
    window.location.hash = novo;
  }
  renderRoot();
  window.scrollTo(0, 0);
}

/**
 * Aplica o hash atual ao state e renderiza. Chamado no boot e em hashchange/popstate.
 */
export function aplicarHash() {
  const { view, fplId, sub } = parseHash();
  state.view = view;
  if (fplId !== undefined) state.fplId = fplId;
  if (view === 'detalhe' && sub) {
    try { sessionStorage.setItem('fpl.detailView.' + fplId, sub); } catch {}
  }
  renderRoot();
}

window.addEventListener('hashchange', () => {
  if (_ignoreNextHashChange) { _ignoreNextHashChange = false; return; }
  aplicarHash();
});

window.setView = setView;
