// shell.js — Layout permanente: skip-link, banner, topbar, sidebar, footer.
// Também aloja o badge de notificações e o atalho do tema.

import { state, isSggov, isAdmin, myGabinete, gabSigla } from './state.js';
import { esc, initials } from './utils.js';
import { setView } from './router.js';

export function renderShell() {
  const user = state.user;
  const sggov = isSggov();
  const adm = isAdmin();
  const papelLbl = sggov
    ? 'SGGOV'
    : (user.papeis.find(p => p.gabinete_id) ? 'Ponto Focal · ' + gabSigla(myGabinete()) : 'Utilizador');
  const bellCount = state.notificacoes?.nao_lidas || 0;
  const tema = state.tema;

  document.getElementById('root').innerHTML = `
    <a href="#main" class="skip-link">Saltar para o conteúdo principal</a>
    <div class="demo-banner" role="banner">DEMONSTRAÇÃO · FPL Ponte v1.0-rc · Sistema funcional ligado a SQLite real</div>
    <header class="topbar" role="banner">
      <div class="brand">
        <div class="crest" aria-hidden="true">RP</div>
        <div class="brand-text">
          <span class="t1">República Portuguesa · Governo</span>
          <span class="t2">FPL — Pegada Legislativa</span>
        </div>
      </div>
      <nav aria-label="Navegação principal">
        <button data-nav="dashboard" aria-current="${state.view === 'dashboard' ? 'page' : 'false'}" class="${state.view === 'dashboard' ? 'active' : ''}">Início</button>
        <button data-nav="lista" aria-current="${state.view === 'lista' ? 'page' : 'false'}" class="${state.view === 'lista' ? 'active' : ''}">FPL</button>
        ${sggov ? `<button data-nav="entidades" aria-current="${state.view === 'entidades' ? 'page' : 'false'}" class="${state.view === 'entidades' ? 'active' : ''}">Entidades RTRI</button>` : ''}
        ${sggov ? `<button data-nav="auditoria" aria-current="${state.view === 'auditoria' ? 'page' : 'false'}" class="${state.view === 'auditoria' ? 'active' : ''}">Auditoria QA</button>` : ''}
        ${adm ? `<button data-nav="outbox" aria-current="${state.view === 'outbox' ? 'page' : 'false'}" class="${state.view === 'outbox' ? 'active' : ''}">Outbox</button>` : ''}
      </nav>
      <div class="right">
        <button class="btn ghost sm" id="cmdkBtn" aria-label="Abrir paleta de comandos (Ctrl+K)" title="Paleta de comandos (Ctrl+K)">⌘K</button>
        <button class="btn ghost sm" id="temaBtn" aria-label="Alterar tema visual" title="Tema atual: ${tema}">${tema === 'escuro' ? '☾' : tema === 'alto-contraste' ? '◐' : tema === 'claro' ? '☀' : '◑'}</button>
        <button class="bell" aria-label="Notificações${bellCount > 0 ? ' (' + bellCount + ' não lidas)' : ''}" onclick="abrirNotificacoes()">
          <span aria-hidden="true">🔔</span>
          ${bellCount > 0 ? `<span class="bell-badge" aria-hidden="true">${bellCount}</span>` : ''}
        </button>
        <button class="user" onclick="setView('perfil')" aria-label="Abrir o meu perfil">
          <div class="avatar" aria-hidden="true">${initials(user.nome)}</div>
          <div class="meta"><span class="n">${esc(user.nome)}</span><span class="r">${esc(papelLbl)}${user.totp_ativo ? ' · 2FA' : ''}</span></div>
        </button>
        <button class="logout-btn" onclick="logout()" aria-label="Terminar sessão">Sair</button>
      </div>
    </header>
    <div class="shell">
      <aside class="sidebar" aria-label="Menu lateral">
        <div class="side-section">
          <div class="side-title" id="sec-trab">Trabalho</div>
          <nav aria-labelledby="sec-trab">
            <a class="side-link ${state.view === 'dashboard' ? 'active' : ''}" data-nav="dashboard" tabindex="0" role="link" aria-current="${state.view === 'dashboard' ? 'page' : 'false'}">Início</a>
            <a class="side-link ${state.view === 'lista' ? 'active' : ''}" data-nav="lista" tabindex="0" role="link">${sggov ? 'Todas as FPL' : 'As minhas FPL'}</a>
            ${!sggov ? '<a class="side-link" data-nav="nova" tabindex="0" role="link">+ Nova FPL</a>' : ''}
            <a class="side-link ${state.view === 'perfil' ? 'active' : ''}" data-nav="perfil" tabindex="0" role="link">O meu perfil &amp; 2FA</a>
          </nav>
        </div>
        ${sggov ? `
        <div class="side-section">
          <div class="side-title" id="sec-sg">SGGOV</div>
          <nav aria-labelledby="sec-sg">
            <a class="side-link ${state.view === 'entidades' ? 'active' : ''}" data-nav="entidades" tabindex="0" role="link">Entidades RTRI</a>
            <a class="side-link ${state.view === 'auditoria' ? 'active' : ''}" data-nav="auditoria" tabindex="0" role="link">Auditoria QA</a>
            ${adm ? `<a class="side-link ${state.view === 'outbox' ? 'active' : ''}" data-nav="outbox" tabindex="0" role="link">Outbox de email</a>` : ''}
          </nav>
        </div>` : ''}
        ${sggov ? `
        <div class="side-section">
          <div class="side-title" id="sec-res">Exportação · Portal do Governo</div>
          <nav aria-labelledby="sec-res">
            <a class="side-link ${state.view === 'exportacao' ? 'active' : ''}" data-nav="exportacao" tabindex="0" role="link">Painel de exportação</a>
            <a class="side-link" href="/api/export/datasets/fpl.json" target="_blank" rel="noopener">Dataset JSON</a>
            <a class="side-link" href="/api/export/datasets/fpl.csv" target="_blank" rel="noopener">Dataset CSV</a>
            <a class="side-link" href="/api/export/datasets/fpl.jsonld" target="_blank" rel="noopener">JSON-LD (vocabulário OCDE)</a>
          </nav>
        </div>` : ''}
      </aside>
      <main class="main" id="main" tabindex="-1"></main>
    </div>
    <footer class="footer" role="contentinfo">
      FPL Ponte · SGGOV · Lei n.º 5-A/2026 · Demonstração
      · <a href="/declaracao-acessibilidade.html">Declaração de Acessibilidade</a>
    </footer>
  `;
  // Bindings: navegação data-nav (botões + side-links) — clique e teclado
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', () => setView(el.dataset.nav));
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setView(el.dataset.nav); } });
  });
  // Botão da paleta de comandos
  document.getElementById('cmdkBtn')?.addEventListener('click', () => window.abrirCmdK?.());
  // Botão do tema (cicla)
  document.getElementById('temaBtn')?.addEventListener('click', () => window.alternarTema?.());
}
