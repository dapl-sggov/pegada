// shell.js — Layout permanente do painel: sidebar escura 220px + main column.
// Modelo "painel v1.2" do design handoff. Ícones SVG (icons.js) substituem
// os glyphs Unicode anteriores. Indicador SSE ao lado de Notificações mostra
// o estado do canal (verde=SSE, dourado=polling, sem ponto=desconectado).

import { state, isSggov, isAdmin, myGabinete, gabSigla, isQa } from './state.js';
import { esc, initials } from './utils.js';
import { setView } from './router.js';
import { ico } from './icons.js';
import { getEstadoCanal } from './notifications.js';

export function renderShell() {
  const user = state.user;
  const sggov = isSggov();
  const adm = isAdmin();
  const qa = isQa();
  const ativos = state.fpls?.filter?.(f => !['PUBLICADO', 'ARQUIVADO'].includes(f.estado_workflow)).length;
  const emCm = state.fpls?.filter?.(f => f.estado_workflow === 'EM_CM').length;
  const publicadas = state.fpls?.filter?.(f => f.estado_workflow === 'PUBLICADO').length;
  const validar = state.fpls?.filter?.(f => f.estado_workflow === 'EM_ELABORACAO' && !f.m3_validado_em).length;
  const bellCount = state.notificacoes?.nao_lidas || 0;
  const canal = getEstadoCanal(); // 'sse' | 'polling' | 'desconectado'
  const sseDotClass = canal === 'sse' ? 'live' : canal === 'polling' ? 'polling' : '';
  const sseTooltip = canal === 'sse' ? 'Notificações em direto' : canal === 'polling' ? 'A sondar a cada 30s' : 'Sem ligação';
  const papelLbl = sggov
    ? (adm ? 'SGGOV · Admin' : qa ? 'SGGOV · QA' : 'SGGOV')
    : (user.papeis.find(p => p.gabinete_id) ? 'PF · ' + gabSigla(myGabinete()) : 'Utilizador');

  document.documentElement.classList.add('painel-mode');
  document.body.classList.add('painel');

  document.getElementById('root').innerHTML = `
    <a href="#main" class="skip-link">Saltar para o conteúdo principal</a>
    <div class="painel-app">
      <aside class="painel-side" aria-label="Menu lateral">
        <div class="brand">
          <div class="brand-name">FPL · SGGOV</div>
          <div class="brand-sub">Pegada Legislativa</div>
        </div>
        <div class="group">
          <div class="group-title">Trabalho</div>
          <button class="link ${state.view === 'dashboard' ? 'active' : ''}" data-nav="dashboard">
            <span class="ico">${ico('dashboard')}</span>Dashboard
          </button>
          <button class="link ${state.view === 'lista' || state.view === 'detalhe' ? 'active' : ''}" data-nav="lista">
            <span class="ico">${ico('lista')}</span>${sggov ? 'Todas as FPL' : 'As minhas FPL'}
            ${ativos > 0 ? `<span class="pill">${ativos}</span>` : ''}
          </button>
          ${!sggov ? `<button class="link ${state.view === 'nova' ? 'active' : ''}" data-nav="nova">
            <span class="ico">${ico('nova')}</span>Nova FPL
          </button>` : ''}
          <button class="link" id="bellLink" aria-label="Notificações${bellCount > 0 ? ' (' + bellCount + ' não lidas)' : ''}" title="${esc(sseTooltip)}">
            <span class="ico">${ico('bell')}</span>Notificações
            ${bellCount > 0 ? `<span class="pill">${bellCount}</span>` : `<span class="sse-dot ${sseDotClass}" aria-hidden="true"></span>`}
          </button>
        </div>
        <div class="group">
          <div class="group-title">Vistas</div>
          ${validar > 0 ? `<button class="link" data-nav="lista"><span class="ico">${ico('validar')}</span>A validar (${validar})</button>` : ''}
          ${emCm > 0 ? `<button class="link" data-nav="lista"><span class="ico">${ico('cm')}</span>Em CM</button>` : ''}
          ${publicadas > 0 ? `<button class="link" data-nav="lista"><span class="ico">${ico('check')}</span>Publicadas</button>` : ''}
          ${sggov ? `<button class="link ${state.view === 'auditoria' ? 'active' : ''}" data-nav="auditoria"><span class="ico">${ico('flag')}</span>Auditoria QA</button>` : ''}
          ${sggov ? `<button class="link ${state.view === 'entidades' ? 'active' : ''}" data-nav="entidades"><span class="ico">${ico('key')}</span>Entidades RTRI</button>` : ''}
          ${sggov ? `<button class="link ${state.view === 'exportacao' ? 'active' : ''}" data-nav="exportacao"><span class="ico">${ico('upload')}</span>Exportação</button>` : ''}
          ${adm ? `<button class="link ${state.view === 'outbox' ? 'active' : ''}" data-nav="outbox"><span class="ico">${ico('mail')}</span>Outbox</button>` : ''}
        </div>
        <div class="group">
          <div class="group-title">Ajuda</div>
          <button class="link" id="cmdkLink"><span class="ico">${ico('cmd')}</span>Paleta (⌘K)</button>
          <button class="link" id="temaLink"><span class="ico" id="temaIco">${iconeTema(state.tema)}</span>Tema</button>
          <a class="link" href="/declaracao-acessibilidade.html"><span class="ico">${ico('accessibility')}</span>Acessibilidade</a>
        </div>
        <div class="bottom">
          <div class="av">${initials(user.nome)}</div>
          <div class="nm">
            <strong>${esc(user.nome.split(' ').slice(0, 2).join(' '))}</strong>
            <span>${esc(papelLbl)}${user.totp_ativo ? ' · 2FA' : ''}</span>
          </div>
          <button id="logoutBtn" aria-label="Terminar sessão" style="background:none;border:none;color:var(--sidebar-fg);cursor:pointer;margin-left:auto;padding:4px" title="Terminar sessão">${ico('logout', { size: 14 })}</button>
        </div>
      </aside>
      <div class="painel-main">
        <main id="main" class="painel-main-inner" tabindex="-1"></main>
      </div>
    </div>
  `;

  // Bindings
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', () => setView(el.dataset.nav));
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setView(el.dataset.nav); } });
  });
  document.getElementById('bellLink')?.addEventListener('click', () => window.abrirNotificacoes?.());
  document.getElementById('cmdkLink')?.addEventListener('click', () => window.abrirCmdK?.());
  document.getElementById('temaLink')?.addEventListener('click', () => window.alternarTema?.());
  document.getElementById('logoutBtn')?.addEventListener('click', () => window.logout?.());
}

// Ícone do tema atual — usado no botão da sidebar e em tema.js após alternância.
export function iconeTema(t) {
  if (t === 'escuro')          return ico('moon');
  if (t === 'claro')           return ico('sun');
  if (t === 'alto-contraste')  return ico('contrast');
  return ico('moon'); // 'auto' usa o ícone do tema escuro como neutro
}
