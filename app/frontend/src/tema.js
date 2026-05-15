// tema.js — Toggle explícito de tema (auto / claro / escuro / alto-contraste).
// Persistido em localStorage; aplicado via [data-tema] no <html>.

import { state } from './state.js';
import { aplicarTema, toast } from './utils.js';

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
  // Atualiza o botão sem re-renderizar tudo
  const btn = document.getElementById('temaBtn');
  if (btn) {
    btn.textContent = novo === 'escuro' ? '☾' : novo === 'alto-contraste' ? '◐' : novo === 'claro' ? '☀' : '◑';
    btn.setAttribute('title', 'Tema atual: ' + novo);
  }
};
