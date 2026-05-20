// views/dashboard.js — Dashboard PF + dashboard SGGOV (com drill-down).
//
// As KPIs do SGGOV são clicáveis e disparam navegação para a lista com
// filtro pré-aplicado (item #6 do plano de melhorias).

import { state, isSggov } from '../state.js';
import { ESTADOS_LBL } from '../constants.js';
import { esc, fmtData, badge, tag } from '../utils.js';
import { gabSigla } from '../state.js';
import { loadFpls, loadDashboard } from '../data.js';
import { setView } from '../router.js';

export async function viewDashboard() {
  await loadFpls();
  await loadDashboard();
  if (isSggov()) return viewDashboardSggov();

  const fpls = state.fpls;
  const ativas = fpls.filter(f => !['PUBLICADO', 'ARQUIVADO'].includes(f.estado_workflow));
  const publicadas = fpls.filter(f => f.estado_workflow === 'PUBLICADO');
  const recentes = [...fpls].sort((a, b) => (b.data_criacao || '').localeCompare(a.data_criacao || '')).slice(0, 5);
  return `
    <div class="page-head">
      <div>
        <div class="page-title">Bem-vindo, ${esc(state.user.nome.split(' ')[0])}.</div>
        <div class="page-sub">${ativas.length} FPL ativas · ${publicadas.length} publicadas em 2026</div>
      </div>
      <button class="btn primary" data-nav="nova">+ Nova FPL</button>
    </div>
    <div class="kpis">
      <button class="kpi kpi-btn" onclick="window.filtrarLista({})" aria-label="Ver todas as FPL">
        <div class="lbl">FPL ativas</div><div class="val">${ativas.length}</div>
        <div class="kpi-hint">Ver lista →</div>
      </button>
      <button class="kpi kpi-btn" onclick="window.filtrarLista({estado:'EM_RSE'})" aria-label="Ver FPL em RSE">
        <div class="lbl">Em RSE / CM</div>
        <div class="val" style="color:var(--warning)">${fpls.filter(f => ['EM_RSE', 'EM_CM'].includes(f.estado_workflow)).length}</div>
        <div class="kpi-hint">Filtrar →</div>
      </button>
      <button class="kpi kpi-btn" onclick="window.filtrarLista({estado:'PUBLICADO'})" aria-label="Ver FPL publicadas">
        <div class="lbl">Publicadas</div>
        <div class="val" style="color:var(--success)">${publicadas.length}</div>
        <div class="kpi-hint">Filtrar →</div>
      </button>
      <button class="kpi kpi-btn" onclick="window.filtrarLista({estado:'EM_REVISAO_QA'})" aria-label="Ver FPL em revisão QA">
        <div class="lbl">Em revisão QA</div>
        <div class="val" style="color:var(--danger)">${fpls.filter(f => f.estado_workflow === 'EM_REVISAO_QA').length}</div>
        <div class="kpi-hint">Filtrar →</div>
      </button>
    </div>
    <div class="card">
      <div class="card-head"><h3>FPL recentes</h3><a onclick="setView('lista')">Ver todas →</a></div>
      <table class="tbl">
        <thead><tr><th>Diploma</th><th>Tipo</th><th>Estado</th><th>M0</th><th>M1</th></tr></thead>
        <tbody>
        ${recentes.length === 0 ? '<tr><td colspan="5" class="card-empty">Sem FPL ainda. Crie a primeira.</td></tr>' :
        recentes.map(f => `
          <tr onclick="setView('detalhe',{fplId:'${f.id}'})">
            <td class="cell-titulo">${esc(f.titulo_curto || f.titulo.substring(0, 80))}<span class="num">${esc(f.numero_processo)} · ${gabSigla(f.gabinete_id)}</span></td>
            <td>${tag(f.tipo_diploma)}</td>
            <td>${badge(f.estado_workflow)}</td>
            <td class="muted small">${fmtData(f.m0_validado_em) || '—'}</td>
            <td class="muted small">${fmtData(f.m1_validado_em) || '—'}</td>
          </tr>
        `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

export function viewDashboardSggov() {
  const d = state.dashboard;
  if (!d) return '<div class="card-empty">Sem dados</div>';
  const max = Math.max(...d.por_estado.map(x => x.n));

  return `
    <div class="page-head">
      <div><div class="page-title">Dashboard SGGOV</div><div class="page-sub">Visão consolidada do regime de Pegada Legislativa</div></div>
      <a class="btn" href="/api/export/datasets/fpl.csv" target="_blank" rel="noopener">↓ Exportar CSV</a>
    </div>
    <div class="kpis">
      <button class="kpi kpi-btn" onclick="setView('lista')" aria-label="Ver todas as FPL">
        <div class="lbl">Total FPL</div><div class="val">${d.total}</div>
        <div class="kpi-hint">Ver todas →</div>
      </button>
      <button class="kpi kpi-btn" onclick="window.filtrarLista({estado:'PUBLICADO'})" aria-label="Ver FPL publicadas">
        <div class="lbl">Publicadas</div><div class="val" style="color:var(--success)">${d.publicadas}</div>
        <div class="kpi-hint">Filtrar publicadas →</div>
      </button>
      <div class="kpi"><div class="lbl">Comprovativos emitidos</div><div class="val">${d.comprovativos ?? '—'}</div></div>
      <button class="kpi kpi-btn" onclick="window.filtrarLista({estado:'EM_REVISAO_QA'})" aria-label="Ver FPL em revisão QA">
        <div class="lbl">Em revisão QA</div><div class="val" style="color:var(--warning)">${d.em_revisao}</div>
        <div class="kpi-hint">Filtrar em revisão →</div>
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
        <div class="card-head"><h3>Top ministérios</h3></div>
        <table class="tbl">
          <thead><tr><th>Ministério</th><th class="txt-right">FPL</th></tr></thead>
          <tbody>
            ${d.top_gabinetes.map(g => `
              <tr onclick="window.filtrarLista({gabinete:'${g.id || ''}'})" style="cursor:pointer">
                <td>${g.sigla}</td><td class="txt-right"><strong>${g.n}</strong></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
    ${d.timeline_marcos ? `
      <div class="card mt-12">
        <div class="card-head"><h3>Marcos validados — últimos 12 meses</h3></div>
        <div class="card-body">${renderTimelineMarcos(d.timeline_marcos)}</div>
      </div>` : ''}
    <div class="card mt-12">
      <div class="card-head"><h3>Top entidades RTRI mais interlocutadas</h3></div>
      <table class="tbl">
        <thead><tr><th>Entidade</th><th>RTRI</th><th class="txt-right">Interações</th></tr></thead>
        <tbody>
          ${d.top_entidades.map(e => `<tr><td>${esc(e.entidade)}</td><td>${e.rtri_id || '<em>—</em>'}</td><td class="txt-right"><strong>${e.n}</strong></td></tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// Timeline mensal (12 meses) com barras empilhadas por marco bloqueante.
// Cada item: { mes: '2026-01', M0: n, M1: n, M4: n, M5: n }
function renderTimelineMarcos(timeline) {
  if (!timeline?.length) return '<div class="card-empty">Sem dados de marcos.</div>';
  const max = Math.max(1, ...timeline.map(t => (t.M0||0)+(t.M1||0)+(t.M4||0)+(t.M5||0)));
  const cores = { M0: '#0a3161', M1: '#3b66c4', M4: '#86610a', M5: '#1a7f3c' };
  return `<div class="timeline-marcos">
    <div class="tm-bars">
      ${timeline.map(t => {
        const total = (t.M0||0)+(t.M1||0)+(t.M4||0)+(t.M5||0);
        return `<div class="tm-col" title="${t.mes} · ${total} marcos">
          <div class="tm-bar" style="height:${total/max*100}%;display:flex;flex-direction:column-reverse">
            ${['M0','M1','M4','M5'].map(m => t[m] ? `<div style="background:${cores[m]};height:${(t[m]/total)*100}%" title="${m}: ${t[m]}"></div>` : '').join('')}
          </div>
          <div class="tm-lbl">${t.mes.slice(5)}</div>
        </div>`;
      }).join('')}
    </div>
    <div class="tm-legend">${['M0','M1','M4','M5'].map(m => `<span><i style="background:${cores[m]}"></i>${m}</span>`).join('')}</div>
  </div>`;
}

// Atalho: navega para a lista com filtros pré-aplicados.
window.filtrarLista = (filtros) => {
  state.filtrosLista = { ...state.filtrosLista, ...filtros };
  setView('lista');
};
