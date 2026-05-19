// cmdk.js — Paleta de comandos (Ctrl/⌘+K) + atalhos de teclado.
//
// Inspirada em VS Code / GitHub. Lista comandos contextuais ao papel
// do utilizador e às FPL existentes. A pesquisa é fuzzy ligeira (substring).

import { state, isSggov, isAdmin } from './state.js';
import { esc, openModal, closeModal } from './utils.js';
import { setView } from './router.js';
import { loadFpls } from './data.js';
import { renderRoot } from './render.js';

// MRU: persiste top-5 labels usados recentemente. Ordena a paleta para mostrar
// estes primeiro, sem duplicar.
function pushMru(label) {
  const cur = state.cmdkMru.filter(x => x !== label);
  cur.unshift(label);
  state.cmdkMru = cur.slice(0, 5);
  try { localStorage.setItem('fpl_cmdk_mru', JSON.stringify(state.cmdkMru)); } catch {}
}
function ordenarPorMru(lista) {
  const mru = state.cmdkMru || [];
  if (!mru.length) return lista;
  const idx = (lbl) => {
    const i = mru.indexOf(lbl);
    return i === -1 ? 999 : i;
  };
  return [...lista].sort((a, b) => idx(a.lbl) - idx(b.lbl));
}

const ATALHOS_DOC = [
  { tecla: 'Ctrl/⌘+K', acao: 'Abrir esta paleta' },
  { tecla: 'g d', acao: 'Ir para o Início' },
  { tecla: 'g f', acao: 'Ir para a lista de FPL' },
  { tecla: 'n', acao: 'Nova FPL (se ponto focal)' },
  { tecla: '[ / ]', acao: 'Cronograma — mês anterior / seguinte' },
  { tecla: '?', acao: 'Mostrar atalhos' },
  { tecla: 'Esc', acao: 'Fechar modais e a paleta' },
];

let comandosBase = [];

function comandosContextuais() {
  const u = state.user;
  if (!u) return [];
  const lista = [
    { lbl: '🏠 Ir para o Início', hint: 'Dashboard', acao: () => setView('dashboard') },
    { lbl: '📋 Lista de FPL', hint: isSggov() ? 'Todas' : 'As minhas', acao: () => setView('lista') },
    { lbl: '👤 O meu perfil', hint: '2FA · sessão', acao: () => setView('perfil') },
    { lbl: '⌨️ Mostrar atalhos de teclado', hint: '?', acao: mostrarAtalhos },
    { lbl: '🌓 Alternar tema', hint: 'claro / escuro / alto contraste', acao: () => window.alternarTema?.() },
  ];
  if (!isSggov()) lista.splice(1, 0, { lbl: '➕ Nova FPL', hint: 'Criar', acao: () => setView('nova') });
  if (isSggov()) {
    lista.push(
      { lbl: '🏛 Entidades RTRI', hint: 'Cache local + sincronização', acao: () => setView('entidades') },
      { lbl: '✓ Auditoria QA', hint: 'Bloco G', acao: () => setView('auditoria') },
      { lbl: '📤 Painel de exportação', hint: 'Portal do Governo', acao: () => setView('exportacao') },
    );
  }
  if (isAdmin()) lista.push({ lbl: '✉ Outbox de email', hint: 'Notificações pendentes', acao: () => setView('outbox') });
  // FPL específicas (lista carregada)
  for (const f of (state.fpls || []).slice(0, 30)) {
    lista.push({
      lbl: '📄 ' + (f.titulo_curto || f.titulo.slice(0, 60)),
      hint: f.numero_processo + ' · ' + f.estado_workflow,
      acao: () => setView('detalhe', { fplId: f.id }),
    });
  }
  return lista;
}

window.abrirCmdK = async () => {
  // Carrega FPL para que apareçam na paleta
  if (state.user) await loadFpls().catch(() => {});
  comandosBase = ordenarPorMru(comandosContextuais());

  openModal(`
    <div class="modal-head" style="padding:8px 14px">
      <input id="cmdkInp" type="text" placeholder="Pesquisar comandos ou FPL…"
             autocomplete="off" autofocus
             style="flex:1;padding:8px 10px;border:none;outline:none;background:transparent;font-size:15px">
      <button class="btn ghost sm" onclick="closeModal()" aria-label="Fechar">Esc</button>
    </div>
    <div class="modal-body" style="padding:0;max-height:60vh;overflow-y:auto">
      <div id="cmdkLista" role="listbox" aria-label="Comandos disponíveis"></div>
    </div>
  `);

  const inp = document.getElementById('cmdkInp');
  let idx = 0;
  const refresh = () => {
    const q = inp.value.trim().toLowerCase();
    const filtrados = !q ? comandosBase :
      comandosBase.filter(c => (c.lbl + ' ' + (c.hint || '')).toLowerCase().includes(q));
    if (idx >= filtrados.length) idx = 0;
    document.getElementById('cmdkLista').innerHTML = filtrados.length === 0
      ? '<div class="card-empty">Sem resultados.</div>'
      : filtrados.map((c, i) => `
        <div class="cmdk-item ${i === idx ? 'active' : ''}" role="option" data-i="${i}"
             onclick="window._cmdkExec(${i})" aria-selected="${i === idx ? 'true' : 'false'}">
          <div class="cmdk-lbl">${esc(c.lbl)}</div>
          ${c.hint ? `<div class="cmdk-hint">${esc(c.hint)}</div>` : ''}
        </div>`).join('');
    window._cmdkFiltrados = filtrados;
  };
  inp.addEventListener('input', refresh);
  inp.addEventListener('keydown', (e) => {
    const arr = window._cmdkFiltrados || [];
    if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(arr.length - 1, idx + 1); refresh(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(0, idx - 1); refresh(); }
    else if (e.key === 'Enter') { e.preventDefault(); window._cmdkExec(idx); }
  });
  refresh();
};

window._cmdkExec = (i) => {
  const c = (window._cmdkFiltrados || [])[i];
  if (c) {
    pushMru(c.lbl);
    closeModal();
    c.acao();
  }
};

function mostrarAtalhos() {
  openModal(`
    <div class="modal-head"><h3>Atalhos de teclado</h3><button class="btn ghost sm" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <table class="tbl">
        <thead><tr><th style="width:30%">Tecla</th><th>Ação</th></tr></thead>
        <tbody>${ATALHOS_DOC.map(a => `<tr><td><kbd>${a.tecla}</kbd></td><td>${a.acao}</td></tr>`).join('')}</tbody>
      </table>
    </div>
    <div class="modal-foot"><button class="btn primary" onclick="closeModal()">Fechar</button></div>
  `);
}
window._mostrarAtalhos = mostrarAtalhos;

// ---------- Listeners globais ----------
let seqBuf = '';
let seqTimer = null;

export function ligarAtalhosGlobais() {
  document.addEventListener('keydown', (e) => {
    // Cmd+K / Ctrl+K
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault(); window.abrirCmdK?.(); return;
    }
    // Esc fecha modais
    if (e.key === 'Escape') { closeModal(); return; }
    // Ignora se o utilizador estiver a digitar
    const t = e.target;
    if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
    if (t?.isContentEditable) return;

    // Sequência "g d" / "g f"
    if (e.key === 'g') {
      seqBuf = 'g';
      clearTimeout(seqTimer);
      seqTimer = setTimeout(() => seqBuf = '', 800);
      return;
    }
    if (seqBuf === 'g') {
      if (e.key === 'd') { setView('dashboard'); seqBuf = ''; return; }
      if (e.key === 'f') { setView('lista'); seqBuf = ''; return; }
      seqBuf = '';
    }
    // Atalhos simples
    if (e.key === 'n' && state.user && !isSggov()) { setView('nova'); }
    else if (e.key === '?') { e.preventDefault(); mostrarAtalhos(); }
    // Navegação mensal do cronograma (só na vista de detalhe / cronograma)
    else if (e.key === '[' && state.view === 'detalhe') { state.cronoMesOffset = (state.cronoMesOffset || 0) - 1; renderRoot(); }
    else if (e.key === ']' && state.view === 'detalhe') { state.cronoMesOffset = (state.cronoMesOffset || 0) + 1; renderRoot(); }
  });
}
