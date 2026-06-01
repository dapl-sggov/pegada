// views/admin.js — Ferramentas SGGOV: 4 separadores
//   · Estado do sistema  (saúde geral, último backup, atividade recente)
//   · Audit log global   (todas as ações de todos os utilizadores)
//   · Integridade        (recalcular hash SHA-256 das FPLs publicadas)
//   · Utilizadores       (lista + gestão básica de papéis)

import { api } from '../api.js';
import { state, isSggov, isAdmin } from '../state.js';
import { esc, fmtDH, toast } from '../utils.js';

let abaActiva = 'estado';

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
    <div class="admin-tabs" style="display:flex;gap:0;border-bottom:2px solid var(--border);margin-bottom:18px">
      ${tabBtn('estado',       'Estado do sistema')}
      ${tabBtn('eventos',      'Audit log')}
      ${tabBtn('integridade',  'Integridade')}
      ${tabBtn('utilizadores', 'Utilizadores')}
    </div>
    <div id="adminPanel"></div>
  `;

  document.querySelectorAll('[data-tab]').forEach(b => {
    b.addEventListener('click', () => { abaActiva = b.dataset.tab; renderAdmin(); });
  });

  const panel = document.getElementById('adminPanel');
  panel.innerHTML = '<div class="card-empty"><div class="spinner-big" style="margin:0 auto 8px"></div>A carregar...</div>';

  try {
    if (abaActiva === 'estado')       panel.innerHTML = await renderEstado();
    else if (abaActiva === 'eventos') panel.innerHTML = await renderEventos();
    else if (abaActiva === 'integridade') panel.innerHTML = await renderIntegridade();
    else if (abaActiva === 'utilizadores') panel.innerHTML = await renderUtilizadores();
    bindAdminPanel();
  } catch (e) {
    panel.innerHTML = `<div class="alert danger"><div><span class="ttl">Erro</span>${esc(e.message)}</div></div>`;
  }
}

function tabBtn(id, lbl) {
  const ativo = abaActiva === id;
  return `<button data-tab="${id}" style="
    padding:11px 18px;font-size:13px;font-weight:${ativo ? '700' : '500'};
    color:${ativo ? 'var(--gov-blue)' : 'var(--text-muted)'};
    border:none;background:none;cursor:pointer;
    border-bottom:2px solid ${ativo ? 'var(--gov-blue)' : 'transparent'};
    margin-bottom:-2px;
  ">${lbl}</button>`;
}

// ---------------------------------------------------------------------------
// Aba 1 — Estado do sistema
// ---------------------------------------------------------------------------
async function renderEstado() {
  const e = await api('/admin/estado');
  const dbKb = Math.round(e.db.bytes / 1024);
  return `
    <div class="kpis" style="margin-bottom:18px">
      <div class="kpi"><div class="lbl">FPL totais</div><div class="val">${e.contagens.fpl}</div></div>
      <div class="kpi"><div class="lbl">Audições</div><div class="val">${e.contagens.audicoes}</div></div>
      <div class="kpi"><div class="lbl">Interações INTEGRA</div><div class="val">${e.contagens.integra}</div></div>
      <div class="kpi"><div class="lbl">Eventos auditados</div><div class="val">${e.contagens.eventos}</div></div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px">
      <div class="card">
        <div class="card-head"><h3>Base de dados</h3></div>
        <div class="card-body">
          <div class="pc-kv">
            <div class="k">Ficheiro</div>
            <div class="v mono" style="font-size:11px;word-break:break-all">${esc(e.db.path)}</div>
            <div class="k">Tamanho</div>
            <div class="v">${dbKb < 1024 ? dbKb + ' KB' : (dbKb / 1024).toFixed(1) + ' MB'}</div>
            <div class="k">Driver</div>
            <div class="v">SQLite (WAL)</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Último backup</h3>
          ${isAdmin() ? `<button class="btn sm" id="btnForcarBackup">Forçar agora</button>` : ''}
        </div>
        <div class="card-body">
          ${e.backup ? `
            <div class="pc-kv">
              <div class="k">Pasta</div><div class="v mono">${esc(e.backup.dia)}</div>
              <div class="k">Gerado em</div><div class="v">${fmtDH(e.backup.gerado_em)}</div>
              <div class="k">FPLs incluídas</div><div class="v"><strong>${e.backup.total}</strong></div>
            </div>
            <div class="pc-mini-sub" style="margin-top:10px">
              Backup automático corre a cada 24h. Em produção a pasta sincroniza com SharePoint via cliente OneDrive na VM.
            </div>
          ` : `
            <div class="alert warning">
              <div><span class="at">Sem backup detectado</span>O backup periódico ainda não correu (arranca 1 minuto após o servidor). Ou a pasta <code>${esc(e.backup?.dir || 'data/backup')}</code> está vazia.</div>
            </div>
            ${isAdmin() ? '<p style="font-size:12px;color:var(--text-muted);margin-top:8px">Use "Forçar agora" para criar o primeiro backup imediatamente.</p>' : ''}
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
              <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:13px">
                <span>${esc(p.estado)}</span><strong>${p.n}</strong>
              </div>
            `).join('')}
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:18px">
      <div class="card-head"><h3>Atividade recente</h3></div>
      <div class="card-body" style="padding:0">
        ${e.eventos_recentes.length === 0 ? '<div class="card-empty">Sem atividade recente.</div>' :
          `<table class="tbl">
            <thead><tr><th>Quando</th><th>Evento</th><th>Autor</th><th>FPL</th></tr></thead>
            <tbody>
              ${e.eventos_recentes.map(ev => `
                <tr ${ev.fpl_id ? `onclick="setView('detalhe',{fplId:'${ev.fpl_id}'})" style="cursor:pointer"` : ''}>
                  <td class="muted small">${fmtDH(ev.timestamp)}</td>
                  <td>${esc(ev.tipo)}</td>
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
// Aba 2 — Audit log global
// ---------------------------------------------------------------------------
let filtroEventoTipo = '';

async function renderEventos() {
  const { items, tipos } = await api('/admin/eventos?limit=200' + (filtroEventoTipo ? `&tipo=${encodeURIComponent(filtroEventoTipo)}` : ''));
  return `
    <div class="filtros-bar" style="margin-bottom:14px">
      <div class="filtros-grid">
        <div class="filtro-campo grow">
          <select id="fEventoTipo">
            <option value="">Todos os tipos (${items.length})</option>
            ${tipos.map(t => `<option value="${esc(t.tipo)}" ${filtroEventoTipo === t.tipo ? 'selected' : ''}>${esc(t.tipo)} · ${t.n}</option>`).join('')}
          </select>
        </div>
        <div class="filtro-campo">
          <button class="btn ghost sm" id="fEventoLimpar" ${filtroEventoTipo ? '' : 'disabled'}>Limpar</button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <h3>Audit log${filtroEventoTipo ? ` · ${filtroEventoTipo}` : ''}</h3>
        <span class="muted small">${items.length} eventos (mais recentes primeiro)</span>
      </div>
      <div class="card-body" style="padding:0;max-height:70vh;overflow:auto">
        ${items.length === 0 ? '<div class="card-empty">Sem eventos.</div>' :
          `<table class="tbl">
            <thead><tr><th>Timestamp</th><th>Tipo</th><th>Autor</th><th>FPL</th><th>IP</th></tr></thead>
            <tbody>
              ${items.map(e => `
                <tr ${e.fpl_id ? `onclick="setView('detalhe',{fplId:'${e.fpl_id}'})" style="cursor:pointer"` : ''}>
                  <td class="muted small mono" style="white-space:nowrap">${fmtDH(e.timestamp)}</td>
                  <td><strong>${esc(e.tipo)}</strong></td>
                  <td>${esc(e.autor || '—')}<br><span class="muted small">${esc(e.autor_email || '')}</span></td>
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
// Aba 3 — Verificação de integridade
// ---------------------------------------------------------------------------
let ultimaVerificacao = null;

async function renderIntegridade() {
  return `
    <div class="card">
      <div class="card-head"><h3>Verificação de integridade</h3></div>
      <div class="card-body">
        <p style="margin-bottom:12px;font-size:13.5px;line-height:1.55">
          Esta verificação <strong>recalcula o hash SHA-256</strong> do JSON canónico
          de cada FPL publicada e compara com o hash gravado em M5. Se um valor
          divergir, significa que <strong>os dados foram alterados após a publicação</strong>
          (corrupção da BD, edição direta, ou ação maliciosa).
        </p>
        <button class="btn primary" id="btnVerificar">Verificar agora</button>
      </div>
    </div>

    ${ultimaVerificacao ? renderResultadoIntegridade(ultimaVerificacao) : ''}
  `;
}

function renderResultadoIntegridade(r) {
  const cor = r.divergentes === 0 ? 'success' : 'danger';
  return `
    <div class="card" style="margin-top:14px">
      <div class="card-head"><h3>Resultado</h3></div>
      <div class="card-body">
        <div class="alert ${cor}">
          <div>
            <span class="at">${r.divergentes === 0 ? '✓ Tudo correto' : '⚠ ' + r.divergentes + ' divergência(s) detectada(s)'}</span>
            ${r.verificadas} FPL${r.verificadas === 1 ? '' : 's'} publicada${r.verificadas === 1 ? '' : 's'} verificada${r.verificadas === 1 ? '' : 's'} · ${r.ok} OK · ${r.divergentes} divergente${r.divergentes === 1 ? '' : 's'}
          </div>
        </div>
        ${r.resultados.length === 0 ? '<p class="muted">Não há FPLs publicadas para verificar.</p>' :
          `<table class="tbl" style="margin-top:12px">
            <thead><tr><th>FPL</th><th>Estado</th><th>Hash gravado (M5)</th></tr></thead>
            <tbody>
              ${r.resultados.map(x => `
                <tr ${x.coincide ? '' : 'style="background:var(--danger-bg,#fde8e8)"'}>
                  <td><strong>${esc(x.numero_processo)}</strong></td>
                  <td>${x.coincide ? '<span style="color:var(--success);font-weight:700">✓ OK</span>' : '<span style="color:var(--danger);font-weight:700">✗ DIVERGE</span>'}</td>
                  <td class="mono small" style="word-break:break-all;font-size:10px">${esc((x.hash_gravado || '').slice(0, 32))}…</td>
                </tr>
              `).join('')}
            </tbody>
          </table>`}
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

    <div class="alert info" style="margin-top:14px">
      <div>
        <span class="at">Gestão de utilizadores</span>
        Em produção (driver Entra), os utilizadores são provisionados just-in-time no primeiro login via Microsoft 365 do Governo. O papel é atribuído automaticamente pelo domínio do email (<code>@&lt;sigla&gt;.gov.pt</code> → PONTO_FOCAL desse gabinete) ou por configuração explícita em <code>ENTRA_ADMIN_MAP</code>. Edição manual de papéis nesta vista é só para o modo de demonstração.
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Bindings das abas
// ---------------------------------------------------------------------------
function bindAdminPanel() {
  // Aba Estado
  document.getElementById('btnForcarBackup')?.addEventListener('click', async () => {
    try {
      const r = await api('/admin/backup', { method: 'POST' });
      toast(`Backup OK — ${r.total} FPL em ${r.pasta}`, 'success');
      renderAdmin();
    } catch (e) { toast('Falha: ' + e.message, 'error'); }
  });

  // Aba Audit log
  document.getElementById('fEventoTipo')?.addEventListener('change', e => {
    filtroEventoTipo = e.target.value;
    renderAdmin();
  });
  document.getElementById('fEventoLimpar')?.addEventListener('click', () => {
    filtroEventoTipo = '';
    renderAdmin();
  });

  // Aba Integridade
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
