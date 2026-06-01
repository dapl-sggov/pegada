// views/dashboard.js — Dashboard PF (cards "próxima ação" por FPL ativa) +
// dashboard SGGOV (KPIs + distribuição + top gabinetes).

import { state, isSggov, gabSigla } from '../state.js';
import { ESTADOS_LBL, MARCOS_LBL } from '../constants.js';
import { esc, fmtData, badge, tag } from '../utils.js';
import { loadFpls, loadDashboard } from '../data.js';
import { setView } from '../router.js';

const PROXIMA_ACAO = {
  RASCUNHO:            { marco: 'M0', verbo: 'Validar M0 · Abertura', urg: 'normal' },
  EM_RSE:              { marco: 'M2', verbo: 'Validar M2 · Abertura da CP', urg: 'normal' },
  EM_CONSULTA_PUBLICA: { marco: 'M4', verbo: 'Validar M4 · Pré-CM (após encerrar CP)', urg: 'normal' },
  EM_CM:               { marco: 'APROVAR', verbo: 'Aguardar aprovação CM', urg: 'aguardar' },
  APROVADO:            { marco: 'M5', verbo: 'Validar M5 · Publicação', urg: 'pronto' },
};

export async function viewDashboard() {
  await loadFpls();
  await loadDashboard();
  if (isSggov()) return viewDashboardSggov();

  const fpls = state.fpls;
  const ativas = fpls.filter(f => !['PUBLICADO', 'ARQUIVADO'].includes(f.estado));
  const publicadas = fpls.filter(f => f.estado === 'PUBLICADO');

  return `
    <div class="page-head">
      <div>
        <div class="page-title">Bem-vindo, ${esc(state.user.nome.split(' ')[0])}.</div>
        <div class="page-sub">${ativas.length} FPL ativas · ${publicadas.length} publicadas</div>
      </div>
      <button class="btn primary" data-nav="nova">+ Nova FPL</button>
    </div>

    <div class="kpis">
      <button class="kpi kpi-btn" onclick="window.filtrarLista({})">
        <div class="lbl">FPL ativas</div><div class="val">${ativas.length}</div>
        <div class="kpi-hint">Ver lista →</div>
      </button>
      <button class="kpi kpi-btn" onclick="window.filtrarLista({estado:'EM_RSE'})">
        <div class="lbl">Em RSE</div>
        <div class="val" style="color:var(--warning)">${fpls.filter(f => f.estado === 'EM_RSE').length}</div>
        <div class="kpi-hint">Filtrar →</div>
      </button>
      <button class="kpi kpi-btn" onclick="window.filtrarLista({estado:'EM_CONSULTA_PUBLICA'})">
        <div class="lbl">Em consulta</div>
        <div class="val" style="color:var(--info,#3b66c4)">${fpls.filter(f => f.estado === 'EM_CONSULTA_PUBLICA').length}</div>
        <div class="kpi-hint">Filtrar →</div>
      </button>
      <button class="kpi kpi-btn" onclick="window.filtrarLista({estado:'PUBLICADO'})">
        <div class="lbl">Publicadas</div>
        <div class="val" style="color:var(--success)">${publicadas.length}</div>
        <div class="kpi-hint">Filtrar →</div>
      </button>
    </div>

    ${ativas.length === 0 ? `
      <div class="card" style="margin-top:18px">
        <div class="card-body" style="text-align:center;padding:48px 20px">
          <p style="color:var(--text-muted);margin-bottom:16px">Sem FPL ativas. Crie a primeira para começar.</p>
          <button class="btn primary" data-nav="nova">+ Nova FPL</button>
        </div>
      </div>
    ` : `
      <div class="card" style="margin-top:18px">
        <div class="card-head"><h3>Próximas ações</h3><a onclick="setView('lista')">Ver todas →</a></div>
        <div class="card-body" style="padding:0">
          ${ativas.slice(0, 8).map(f => renderProximaAcaoCard(f)).join('')}
        </div>
      </div>
    `}
  `;
}

function renderProximaAcaoCard(f) {
  const acao = PROXIMA_ACAO[f.estado] || { marco: '—', verbo: 'Aguardar', urg: 'aguardar' };
  const corPorUrgencia = {
    normal: 'var(--gov-blue)',
    aguardar: 'var(--text-muted)',
    pronto: 'var(--success)',
  }[acao.urg];
  return `
    <div onclick="setView('detalhe',{fplId:'${f.id}'})" style="display:grid;grid-template-columns:auto 1fr auto;gap:14px;padding:14px 18px;border-bottom:1px solid var(--border-hair);cursor:pointer" onmouseover="this.style.background='var(--bg-soft)'" onmouseout="this.style.background=''">
      <div style="width:42px;height:42px;border-radius:6px;background:${corPorUrgencia};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-family:var(--font-mono);font-size:13px">${acao.marco}</div>
      <div style="min-width:0">
        <div style="font-size:14px;font-weight:600;color:var(--text);line-height:1.3">${esc(f.titulo_curto || (f.titulo || '').substring(0, 80))}</div>
        <div style="font-size:11.5px;color:var(--text-muted);margin-top:2px">${esc(f.numero_processo)} · ${gabSigla(f.gabinete_id)} · ${badge(f.estado)}</div>
        <div style="font-size:12px;color:${corPorUrgencia};margin-top:4px;font-weight:600">→ ${esc(acao.verbo)}</div>
      </div>
      <div style="display:flex;align-items:center;color:var(--text-faint);font-size:18px">›</div>
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
      <button class="kpi kpi-btn" onclick="setView('lista')">
        <div class="lbl">Total FPL</div><div class="val">${d.total}</div>
        <div class="kpi-hint">Ver todas →</div>
      </button>
      <button class="kpi kpi-btn" onclick="window.filtrarLista({estado:'PUBLICADO'})">
        <div class="lbl">Publicadas</div>
        <div class="val" style="color:var(--success)">${d.por_estado.find(e => e.estado === 'PUBLICADO')?.n || 0}</div>
        <div class="kpi-hint">Filtrar →</div>
      </button>
      <button class="kpi kpi-btn" onclick="window.filtrarLista({estado:'EM_CONSULTA_PUBLICA'})">
        <div class="lbl">Em consulta</div>
        <div class="val" style="color:var(--info,#3b66c4)">${d.por_estado.find(e => e.estado === 'EM_CONSULTA_PUBLICA')?.n || 0}</div>
        <div class="kpi-hint">Filtrar →</div>
      </button>
      <button class="kpi kpi-btn" onclick="window.filtrarLista({estado:'EM_CM'})">
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
