// utils.js — Helpers puros + componentes UI elementares (toast, modal).
// Sem dependências do estado da aplicação.

import { ESTADOS_LBL } from './constants.js';

// ---------- Escaping e formatação ----------
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const fmtData = d => {
  if (!d) return '';
  const s = String(d).slice(0, 10);
  const [y, m, day] = s.split('-');
  return `${day}/${m}/${y}`;
};

export const fmtDH = d => {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString('pt-PT') + ' ' + dt.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
};

export const initials = n => (n || '').split(' ').filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();

// ---------- Componentes inline ----------
export const badge = e => {
  const x = ESTADOS_LBL[e] || { lbl: e, cls: 'criado' };
  return `<span class="badge ${x.cls} dot">${x.lbl}</span>`;
};

export const tag = t => `<span class="tag tipo-${t}">${t}</span>`;

// ---------- Toast e modal ----------
export function toast(msg, type = 'info') {
  let c = document.querySelector('.toast-container');
  if (!c) { c = document.createElement('div'); c.className = 'toast-container'; document.body.appendChild(c); }
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 4500);
}

export function openModal(html) {
  let ov = document.querySelector('.modal-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.addEventListener('click', e => { if (e.target === ov) closeModal(); });
    document.body.appendChild(ov);
  }
  ov.innerHTML = `<div class="modal lg">${html}</div>`;
  ov.classList.add('open');
}

export function closeModal() {
  const ov = document.querySelector('.modal-overlay');
  if (ov) ov.classList.remove('open');
}

// Necessário para o handler `onclick="closeModal()"` no HTML
window.closeModal = closeModal;

// ---------- Aplica o tema persistente ao <html> ----------
export function aplicarTema(tema) {
  document.documentElement.setAttribute('data-tema', tema);
}
