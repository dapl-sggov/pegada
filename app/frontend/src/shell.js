// shell.js — Layout permanente do painel: sidebar escura 200px + main column.
//
// Substitui o shell anterior (header largo + sidebar clara) pelo modelo
// do design handoff: sidebar à esquerda, header ao topo da main column
// dentro da própria view (porque o header tem conteúdo dependente da
// view atual — breadcrumb, marcos stepper na vista de detalhe). Aqui
// só desenhamos a estrutura permanente: sidebar e contentor main vazio
// para a view preencher.

import { state, isSggov, isAdmin, myGabinete, gabSigla, isQa } from './state.js';
import { esc, initials } from './utils.js';
import { setView } from './router.js';

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
            <span class="ico" aria-hidden="true">▤</span>Dashboard
          </button>
          <button class="link ${state.view === 'lista' || state.view === 'detalhe' ? 'active' : ''}" data-nav="lista">
            <span class="ico" aria-hidden="true">▦</span>${sggov ? 'Todas as FPL' : 'As minhas FPL'}
            ${ativos > 0 ? `<span class="pill">${ativos}</span>` : ''}
          </button>
          ${!sggov ? `<button class="link ${state.view === 'nova' ? 'active' : ''}" data-nav="nova">
            <span class="ico" aria-hidden="true">+</span>Nova FPL
          </button>` : ''}
          <button class="link" id="bellLink" aria-label="Notificações${bellCount > 0 ? ' (' + bellCount + ' não lidas)' : ''}">
            <span class="ico" aria-hidden="true">◔</span>Notificações
            ${bellCount > 0 ? `<span class="pill">${bellCount}</span>` : ''}
          </button>
        </div>
        <div class="group">
          <div class="group-title">Vistas</div>
          ${validar > 0 ? `<button class="link" data-nav="lista"><span class="ico">◐</span>A validar (${validar})</button>` : ''}
          ${emCm > 0 ? `<button class="link" data-nav="lista"><span class="ico">◔</span>Em CM</button>` : ''}
          ${publicadas > 0 ? `<button class="link" data-nav="lista"><span class="ico">✓</span>Publicadas</button>` : ''}
          ${sggov ? `<button class="link ${state.view === 'auditoria' ? 'active' : ''}" data-nav="auditoria"><span class="ico">⚐</span>Auditoria QA</button>` : ''}
          ${sggov ? `<button class="link ${state.view === 'entidades' ? 'active' : ''}" data-nav="entidades"><span class="ico">⚿</span>Entidades RTRI</button>` : ''}
          ${sggov ? `<button class="link ${state.view === 'exportacao' ? 'active' : ''}" data-nav="exportacao"><span class="ico">↑</span>Exportação</button>` : ''}
          ${adm ? `<button class="link ${state.view === 'outbox' ? 'active' : ''}" data-nav="outbox"><span class="ico">✉</span>Outbox</button>` : ''}
        </div>
        <div class="group">
          <div class="group-title">Ajuda</div>
          <button class="link" id="cmdkLink"><span class="ico">⌘</span>Paleta (⌘K)</button>
          <button class="link" id="temaLink"><span class="ico" id="temaIco">◑</span>Tema</button>
          <a class="link" href="/declaracao-acessibilidade.html"><span class="ico">♿</span>Acessibilidade</a>
        </div>
        <div class="bottom">
          <div class="av">${initials(user.nome)}</div>
          <div class="nm">
            <strong>${esc(user.nome.split(' ').slice(0, 2).join(' '))}</strong>
            <span>${esc(papelLbl)}${user.totp_ativo ? ' · 2FA' : ''}</span>
          </div>
          <button class="ico" id="logoutBtn" aria-label="Terminar sessão" style="background:none;border:none;color:#cdd5e3;cursor:pointer;margin-left:auto" title="Terminar sessão">⎋</button>
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

  // Atualiza o ícone do tema
  const t = state.tema;
  const ti = document.getElementById('temaIco');
  if (ti) ti.textContent = t === 'escuro' ? '☾' : t === 'alto-contraste' ? '◐' : t === 'claro' ? '☀' : '◑';
}
