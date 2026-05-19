// tema.js — Toggle explícito de tema (auto / claro / escuro / alto-contraste).
// Persistido em localStorage; aplicado via [data-tema] no <html>.

import { state } from './state.js';
import { aplicarTema, toast } from './utils.js';
import { iconeTema } from './shell.js';

const ORDEM = ['auto', 'claro', 'escuro', 'alto-contraste'];
const NOMES = {
  auto: 'Automático (segue o sistema)',
  claro: 'Tema claro',
  escuro: 'Tema escuro',
  'alto-contraste': 'Alto contraste',
};

export function inicializarTema() {
  aplicarTema(state.tema);
}

window.alternarTema = () => {
  const i = ORDEM.indexOf(state.tema);
  const novo = ORDEM[(i + 1) % ORDEM.length];
  state.tema = novo;
  localStorage.setItem('fpl_tema', novo);
  aplicarTema(novo);
  toast('Tema: ' + NOMES[novo], 'info');
  // Atualiza o ícone da sidebar sem re-renderizar tudo
  const ti = document.getElementById('temaIco');
  if (ti) ti.innerHTML = iconeTema(novo);
};
