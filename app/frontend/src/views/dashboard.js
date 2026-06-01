// views/dashboard.js — Dashboard PF + dashboard SGGOV (simplificado v2.0).
// KPIs clicáveis com drill-down para a lista filtrada.

import { state, isSggov, gabSigla } from '../state.js';
import { ESTADOS_LBL } from '../constants.js';
import { esc, fmtData, badge, tag } from '../utils.js';
import { loadFpls, loadDashboard } from '../data.js';
import { setView } from '../router.js';

export async function viewDashboard() {
  await loadFpls();
  await loadDashboard();
  if (isSggov()) return viewDashboardSggov();

  const fpls = state.fpls;
  const ativas = fpls.filter(f => !['PUBLICADO', 'ARQUIVADO'].includes(f.estado));
  const publicadas = fpls.filter(f => f.estado === 'PUBLICADO');
  const recentes = [...fpls].sort((a, b) => (b.data_criacao || '').localeCompare(a.data_criacao || '')).slice(0, 5);
  return `
    <div class="page-head">
      <div>
        <div class="page-title">Bem-vindo, ${esc(state.user.nome.split(' ')[0])}.</div>
        <div class="page-sub">${ativas.length} FPL ativas · ${publicadas.length} publicadas</div>
      </div>
      <button class="btn primary" data-nav="nova">+ Nova FPL</button>
    </div>
    <div class="kpis">
      <button class="kpi kpi-btn" onclick="window.filtrarLista({})" aria-label="Ver todas as FPL">
        <div class="lbl">FPL ativas</div><div class="val">${ativas.length}</div>
        <div class="kpi-hint">Ver lista →</div>
      </button>
      <button class="kpi kpi-btn" onclick="window.filtrarLista({estado:'EM_RSE'})" aria-label="Ver FPL em RSE">
        <div class="lbl">Em RSE</div>
        <div class="val" style="color:var(--warning)">${fpls.filter(f => f.estado === 'EM_RSE').length}</div>
        <div class="kpi-hint">Filtrar →</div>
      </button>
      <button class="kpi kpi-btn" onclick="window.filtrarLista({estado:'EM_CONSULTA_PUBLICA'})" aria-label="Ver FPL em CP">
        <div class="lbl">Em CP</div>
        <div class="val" style="color:var(--info)">${fpls.filter(f => f.estado === 'EM_CONSULTA_PUBLICA').length}</div>
        <div class="kpi-hint">Filtrar →</div>
      </button>
      <button class="kpi kpi-btn" onclick="window.filtrarLista({estado:'PUBLICADO'})" aria-label="Ver FPL publicadas">
        <div class="lbl">Publicadas</div>
        <div class="val" style="color:var(--success)">${publicadas.length}</div>
        <div class="kpi-hint">Filtrar →</div>
      </button>
    </div>
    <div class="card">
      <div class="card-head"><h3>FPL recentes</h3><a onclick="setView('lista')">Ver todas →</a></div>
      <table class="tbl">
        <thead><tr><th>Diploma</th><th>Tipo</th><th>Estado</th><th>M0</th><th>M5</th></tr></thead>
        <tbody>
        ${recentes.length === 0 ? '<tr><td colspan="5" class="card-empty">Sem FPL ainda. Crie a primeira.</td></tr>' :
        recentes.map(f => `
          <tr onclick="setView('detalhe',{fplId:'${f.id}'})">
            <td class="cell-titulo">${esc(f.titulo_curto || (f.titulo || '').substring(0, 80))}<span class="num">${esc(f.numero_processo)} · ${gabSigla(f.gabinete_id)}</span></td>
            <td>${tag(f.tipo_diploma)}</td>
            <td>${badge(f.estado)}</td>
            <td class="muted small">${fmtData(f.m0_em) || '—'}</td>
            <td class="muted small">${fmtData(f.m5_em) || '—'}</td>
          </tr>
        `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function viewDashboardSggov() {
  const d = state.dashboard;
  if (!d) return '<div class="card-empty">Sem dados</div>';
  const max = Math.max(1, ...d.por_estado.map(x => x.n));

  return `
    <div class="page-head">
      <div><div class="page-title">Dashboard SGGOV</div><div class="page-sub">Visão consolidada do regime de Pegada Legislativa</div></div>
      <button class="btn" data-nav="admin">Ferramentas SGGOV →</button>
    </div>
    <div class="kpis">
      <button class="kpi kpi-btn" onclick="setView('lista')" aria-label="Ver todas as FPL">
        <div class="lbl">Total FPL</div><div class="val">${d.total}</div>
        <div class="kpi-hint">Ver todas →</div>
      </button>
      <button class="kpi kpi-btn" onclick="window.filtrarLista({estado:'PUBLICADO'})" aria-label="Ver FPL publicadas">
        <div class="lbl">Publicadas</div>
        <div class="val" style="color:var(--success)">${d.por_estado.find(e => e.estado === 'PUBLICADO')?.n || 0}</div>
        <div class="kpi-hint">Filtrar →</div>
      </button>
      <button class="kpi kpi-btn" onclick="window.filtrarLista({estado:'EM_CONSULTA_PUBLICA'})" aria-label="Ver FPL em CP">
        <div class="lbl">Em consulta</div>
        <div class="val" style="color:var(--info)">${d.por_estado.find(e => e.estado === 'EM_CONSULTA_PUBLICA')?.n || 0}</div>
        <div class="kpi-hint">Filtrar →</div>
      </button>
      <button class="kpi kpi-btn" onclick="window.filtrarLista({estado:'EM_CM'})" aria-label="Ver FPL em CM">
        <div class="lbl">Em CM</div>
        <div class="val" style="color:var(--warning)">${d.por_estado.find(e => e.estado === 'EM_CM')?.n || 0}</div>
        <div class="kpi-hint">Filtrar →</div>
      </button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px">
      <div class="card">
        <div class="card-head"><h3>Distribuição por estado</h3></div>
        <div class="card-body">
          ${d.por_estado.map(e => {
            const lbl = ESTADOS_LBL[e.estado]?.lbl || e.estado;
            return `<button class="dist-row" onclick="window.filtrarLista({estado:'${e.estado}'})" aria-label="Filtrar por ${lbl}">
              <div class="dist-lbl">${lbl}</div>
              <div class="dist-bar"><div class="dist-fill" style="width:${e.n / max * 100}%">${e.n}</div></div>
            </button>`;
          }).join('')}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Top gabinetes</h3></div>
        <table class="tbl">
          <thead><tr><th>Sigla</th><th class="txt-right">FPL</th></tr></thead>
          <tbody>
            ${d.top_gabinetes.map(g => `
              <tr onclick="window.filtrarLista({gabinete:'${g.id || ''}'})" style="cursor:pointer">
                <td>${g.sigla}</td><td class="txt-right"><strong>${g.n}</strong></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

window.filtrarLista = (filtros) => {
  state.filtrosLista = { ...state.filtrosLista, ...filtros };
  setView('lista');
};
