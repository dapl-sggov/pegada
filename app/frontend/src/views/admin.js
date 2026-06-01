// views/admin.js — Ferramentas SGGOV em 4 separadores
//   · Estado do sistema  · Audit log global  · Integridade  · Utilizadores

import { api } from '../api.js';
import { isSggov, isAdmin } from '../state.js';
import { esc, fmtDH, toast } from '../utils.js';

let abaActiva = 'estado';
let ultimaVerificacao = null;
let filtroEventoTipo = '';

export async function renderAdmin() {
  if (!isSggov()) {
    document.getElementById('main').innerHTML =
      `<div class="card-empty">Acesso reservado à SGGOV.</div>`;
    return;
  }

  document.getElementById('main').innerHTML = `
    <div class="page-head">
      <div>
        <div class="page-title">Administração SGGOV</div>
        <div class="page-sub">Estado, auditoria, integridade e utilizadores do FPL Ponte</div>
      </div>
    </div>
    <div class="admin-tabs">
      ${tabBtn('estado',       'Estado do sistema')}
      ${tabBtn('eventos',      'Audit log')}
      ${tabBtn('integridade',  'Integridade')}
      ${tabBtn('utilizadores', 'Utilizadores')}
    </div>
    <div id="adminPanel"></div>
  `;

  document.querySelectorAll('.admin-tabs button').forEach(b => {
    b.addEventListener('click', () => { abaActiva = b.dataset.tab; renderAdmin(); });
  });

  const panel = document.getElementById('adminPanel');
  panel.innerHTML = '<div class="card-empty"><div class="spinner-big" style="margin:0 auto 8px"></div>A carregar...</div>';

  try {
    if (abaActiva === 'estado')       panel.innerHTML = await renderEstado();
    else if (abaActiva === 'eventos') panel.innerHTML = await renderEventos();
    else if (abaActiva === 'integridade') panel.innerHTML = renderIntegridade();
    else if (abaActiva === 'utilizadores') panel.innerHTML = await renderUtilizadores();
    bindAdminPanel();
  } catch (e) {
    panel.innerHTML = `<div class="alert danger"><div><span class="at">Erro</span>${esc(e.message)}</div></div>`;
  }
}

function tabBtn(id, lbl) {
  return `<button data-tab="${id}" class="tab-button ${abaActiva === id ? 'active' : ''}">${esc(lbl)}</button>`;
}

// ---------------------------------------------------------------------------
// Aba 1 — Estado do sistema
// ---------------------------------------------------------------------------
async function renderEstado() {
  const e = await api('/admin/estado');
  const dbKb = Math.round(e.db.bytes / 1024);
  const dbSize = dbKb < 1024 ? dbKb + ' KB' : (dbKb / 1024).toFixed(1) + ' MB';

  return `
    <div class="kpis mb-12">
      <div class="kpi"><div class="lbl">FPL totais</div><div class="val">${e.contagens.fpl}</div></div>
      <div class="kpi"><div class="lbl">Audições</div><div class="val">${e.contagens.audicoes}</div></div>
      <div class="kpi"><div class="lbl">Interações INTEGRA</div><div class="val">${e.contagens.integra}</div></div>
      <div class="kpi"><div class="lbl">Eventos auditados</div><div class="val">${e.contagens.eventos}</div></div>
    </div>

    <div class="grid-2col">
      <div class="card">
        <div class="card-head"><h3>Base de dados</h3></div>
        <div class="card-body">
          <div class="pc-kv">
            <div class="k">Ficheiro</div>
            <div class="v mono small">${esc(e.db.path)}</div>
            <div class="k">Tamanho</div>
            <div class="v">${dbSize}</div>
            <div class="k">Driver</div>
            <div class="v">SQLite (WAL)</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h3>Último backup</h3>
          ${isAdmin() ? `<button class="btn sm" id="btnForcarBackup">Forçar agora</button>` : ''}
        </div>
        <div class="card-body">
          ${e.backup ? `
            <div class="pc-kv">
              <div class="k">Pasta</div><div class="v mono">${esc(e.backup.dia)}</div>
              <div class="k">Gerado em</div><div class="v">${fmtDH(e.backup.gerado_em)}</div>
              <div class="k">FPLs incluídas</div><div class="v"><strong>${e.backup.total}</strong></div>
            </div>
            <p class="small muted mt-12">
              Backup automático corre a cada 24h. Em produção a pasta sincroniza
              com SharePoint via cliente OneDrive na VM.
            </p>
          ` : `
            <div class="alert warning">
              <div>
                <span class="at">Sem backup detectado</span>
                O backup periódico ainda não correu. Em DEV pode forçar com o botão.
              </div>
            </div>
          `}
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Sessões e utilizadores</h3></div>
        <div class="card-body">
          <div class="pc-kv">
            <div class="k">Sessões ativas</div><div class="v"><strong>${e.contagens.sessoes_ativas}</strong></div>
            <div class="k">Utilizadores</div><div class="v">${e.contagens.utilizadores} ativos</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Distribuição por estado</h3></div>
        <div class="card-body">
          ${e.por_estado.length === 0 ? '<div class="pc-empty">Sem FPLs.</div>' :
            e.por_estado.map(p => `
              <div class="flex" style="justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:1px solid var(--border-hair)">
                <span>${esc(p.estado)}</span><strong>${p.n}</strong>
              </div>
            `).join('')}
        </div>
      </div>
    </div>

    <div class="card mt-12">
      <div class="card-head"><h3>Atividade recente</h3></div>
      <div class="card-body" style="padding:0">
        ${e.eventos_recentes.length === 0 ? '<div class="card-empty">Sem atividade recente.</div>' :
          `<table class="tbl">
            <thead><tr><th>Quando</th><th>Evento</th><th>Autor</th><th>FPL</th></tr></thead>
            <tbody>
              ${e.eventos_recentes.map(ev => `
                <tr ${ev.fpl_id ? `onclick="setView('detalhe',{fplId:'${ev.fpl_id}'})" style="cursor:pointer"` : ''}>
                  <td class="muted small mono">${fmtDH(ev.timestamp)}</td>
                  <td><strong>${esc(ev.tipo)}</strong></td>
                  <td>${esc(ev.autor || '—')}</td>
                  <td class="mono small">${esc(ev.numero || '—')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>`}
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Aba 2 — Audit log
// ---------------------------------------------------------------------------
async function renderEventos() {
  const url = '/admin/eventos?limit=200' + (filtroEventoTipo ? `&tipo=${encodeURIComponent(filtroEventoTipo)}` : '');
  const { items, tipos } = await api(url);

  return `
    <div class="filtros-bar mb-12">
      <div class="filtros-grid">
        <div class="filtro-campo grow">
          <select id="fEventoTipo">
            <option value="">Todos os tipos (${items.length})</option>
            ${tipos.map(t => `<option value="${esc(t.tipo)}" ${filtroEventoTipo === t.tipo ? 'selected' : ''}>${esc(t.tipo)} · ${t.n}</option>`).join('')}
          </select>
        </div>
        <button class="btn ghost sm" id="fEventoLimpar" ${filtroEventoTipo ? '' : 'disabled'}>Limpar filtro</button>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <h3>Audit log${filtroEventoTipo ? ` · ${esc(filtroEventoTipo)}` : ''}</h3>
        <span class="muted small">${items.length} eventos (mais recentes primeiro)</span>
      </div>
      <div class="card-body" style="padding:0;max-height:65vh;overflow:auto">
        ${items.length === 0 ? '<div class="card-empty">Sem eventos para mostrar.</div>' :
          `<table class="tbl">
            <thead><tr><th>Timestamp</th><th>Tipo</th><th>Autor</th><th>FPL</th><th>IP</th></tr></thead>
            <tbody>
              ${items.map(e => `
                <tr ${e.fpl_id ? `onclick="setView('detalhe',{fplId:'${e.fpl_id}'})" style="cursor:pointer"` : ''}>
                  <td class="muted small mono" style="white-space:nowrap">${fmtDH(e.timestamp)}</td>
                  <td><strong>${esc(e.tipo)}</strong></td>
                  <td>${esc(e.autor || '—')}<div class="muted small">${esc(e.autor_email || '')}</div></td>
                  <td class="mono small">${esc(e.numero || '—')}</td>
                  <td class="muted small mono">${esc(e.ip || '—')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>`}
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Aba 3 — Integridade
// ---------------------------------------------------------------------------
function renderIntegridade() {
  return `
    <div class="card">
      <div class="card-head"><h3>Verificação de integridade</h3></div>
      <div class="card-body">
        <p>
          Esta verificação recalcula o <strong>hash SHA-256</strong> do JSON canónico
          de cada FPL publicada e compara com o hash gravado em M5. Se um valor
          divergir, significa que os dados foram alterados após a publicação
          (corrupção da BD, edição direta, ou ação maliciosa).
        </p>
        <p class="small muted mb-12">
          Operação só de leitura — não altera dados nem regenera hashes.
        </p>
        <button class="btn primary" id="btnVerificar">Verificar agora</button>
      </div>
    </div>

    ${ultimaVerificacao ? renderResultadoIntegridade(ultimaVerificacao) : ''}
  `;
}

function renderResultadoIntegridade(r) {
  const tipo = r.divergentes === 0 ? 'success' : 'danger';
  const titulo = r.divergentes === 0 ? '✓ Tudo correto' : `⚠ ${r.divergentes} divergência(s) detectada(s)`;
  return `
    <div class="card mt-12">
      <div class="card-head"><h3>Resultado</h3></div>
      <div class="card-body">
        <div class="alert ${tipo}">
          <div>
            <span class="at">${titulo}</span>
            ${r.verificadas} FPL${r.verificadas === 1 ? '' : 's'} verificada${r.verificadas === 1 ? '' : 's'} · ${r.ok} OK · ${r.divergentes} divergente${r.divergentes === 1 ? '' : 's'}
          </div>
        </div>
        ${r.resultados.length === 0 ? '<p class="muted mt-12">Não há FPLs publicadas para verificar.</p>' :
          `<div class="card mt-12" style="border-radius:6px">
            ${r.resultados.map(x => `
              <div class="integ-row ${x.coincide ? '' : 'divergente'}">
                <div><strong>${esc(x.numero_processo)}</strong></div>
                <div>${x.coincide ? '<span class="ok-pill">✓ OK</span>' : '<span class="ko-pill">✗ DIVERGE</span>'}</div>
                <div class="hash">${esc((x.hash_gravado || '—').slice(0, 32))}…</div>
              </div>
            `).join('')}
          </div>`}
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Aba 4 — Utilizadores
// ---------------------------------------------------------------------------
async function renderUtilizadores() {
  const lista = await api('/admin/utilizadores');
  return `
    <div class="card">
      <div class="card-head">
        <h3>Utilizadores autorizados</h3>
        <span class="muted small">${lista.length} contas · ${lista.filter(u => u.ativo).length} ativas</span>
      </div>
      <div class="card-body" style="padding:0">
        <table class="tbl">
          <thead><tr><th>Nome</th><th>Email</th><th>Papéis</th><th>Criado em</th></tr></thead>
          <tbody>
            ${lista.map(u => `
              <tr style="${u.ativo ? '' : 'opacity:.55'}">
                <td><strong>${esc(u.nome_completo)}</strong></td>
                <td class="mono small">${esc(u.email)}</td>
                <td>${u.papeis.map(p => `<span class="tag" style="margin-right:4px">${esc(p.papel)}${p.gabinete_sigla ? ' · ' + esc(p.gabinete_sigla) : ''}</span>`).join('') || '<span class="muted small">sem papéis</span>'}</td>
                <td class="muted small">${fmtDH(u.criado_em)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="alert info mt-12">
      <div>
        <span class="at">Como funciona em produção</span>
        Em modo Entra, os utilizadores são provisionados just-in-time no primeiro login
        via Microsoft 365 do Governo. O papel é atribuído automaticamente pelo domínio
        do email (<code>nome@&lt;sigla&gt;.gov.pt</code> → PONTO_FOCAL desse gabinete) ou
        por configuração explícita em <code>ENTRA_ADMIN_MAP</code>. Edição manual de
        papéis está disponível apenas em modo demonstração.
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Bindings
// ---------------------------------------------------------------------------
function bindAdminPanel() {
  document.getElementById('btnForcarBackup')?.addEventListener('click', async () => {
    try {
      const r = await api('/admin/backup', { method: 'POST' });
      toast(`Backup OK — ${r.total} FPL em ${r.pasta}`, 'success');
      renderAdmin();
    } catch (e) { toast('Falha: ' + e.message, 'error'); }
  });

  document.getElementById('fEventoTipo')?.addEventListener('change', e => {
    filtroEventoTipo = e.target.value;
    renderAdmin();
  });
  document.getElementById('fEventoLimpar')?.addEventListener('click', () => {
    filtroEventoTipo = '';
    renderAdmin();
  });

  document.getElementById('btnVerificar')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnVerificar');
    btn.disabled = true; btn.textContent = 'A verificar...';
    try {
      ultimaVerificacao = await api('/admin/verificar-integridade', { method: 'POST' });
      renderAdmin();
    } catch (e) {
      toast('Falha: ' + e.message, 'error');
      btn.disabled = false; btn.textContent = 'Verificar agora';
    }
  });
}
