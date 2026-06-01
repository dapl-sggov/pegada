// router.js — Hash-based router com deep-linking.
//
// Formatos suportados:
//   #/dashboard
//   #/lista
//   #/nova
//   #/fpl/<id>            → vista de detalhe (sub default = detalhe)
//   #/fpl/<id>/detalhe    → vista de detalhe, modo detalhe
//   #/fpl/<id>/cronograma → vista de detalhe, modo cronograma
//   #/admin               → ferramentas SGGOV (backup + export canónicos)

import { state } from './state.js';
import { renderRoot } from './render.js';

const VIEWS_SIMPLES = new Set(['dashboard', 'lista', 'nova', 'admin']);

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
