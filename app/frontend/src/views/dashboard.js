// views/dashboard.js — Dashboard PF (cards "próxima ação") + dashboard SGGOV.

import { state, isSggov, gabSigla } from '../state.js';
import { ESTADOS_LBL } from '../constants.js';
import { esc, badge } from '../utils.js';
import { loadFpls, loadDashboard } from '../data.js';
import { setView } from '../router.js';

const PROXIMA_ACAO = {
  RASCUNHO:            { marco: 'M0', verbo: 'Validar M0 · Abertura',                    urg: 'normal' },
  EM_RSE:              { marco: 'M2', verbo: 'Abrir consulta pública (validar M2)',      urg: 'normal' },
  EM_CONSULTA_PUBLICA: { marco: 'M4', verbo: 'Encerrar CP e validar M4 · Pré-CM',        urg: 'normal' },
  EM_CM:               { marco: '⋯',  verbo: 'Aguardar decisão do Conselho de Ministros', urg: 'aguardar' },
  APROVADO:            { marco: 'M5', verbo: 'Publicar (validar M5)',                    urg: 'pronto' },
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
      </button>
      <button class="kpi kpi-btn" onclick="window.filtrarLista({estado:'EM_CONSULTA_PUBLICA'})">
        <div class="lbl">Em consulta</div>
        <div class="val" style="color:var(--gov-blue)">${fpls.filter(f => f.estado === 'EM_CONSULTA_PUBLICA').length}</div>
      </button>
      <button class="kpi kpi-btn" onclick="window.filtrarLista({estado:'PUBLICADO'})">
        <div class="lbl">Publicadas</div>
        <div class="val" style="color:var(--success)">${publicadas.length}</div>
      </button>
    </div>

    ${ativas.length === 0 ? `
      <div class="card mt-12">
        <div class="card-body" style="text-align:center;padding:48px 20px">
          <p class="muted mb-12">Sem FPL ativas. Crie a primeira para começar.</p>
          <button class="btn primary" data-nav="nova">+ Nova FPL</button>
        </div>
      </div>
    ` : `
      <div class="card mt-12">
        <div class="card-head"><h3>Próximas ações</h3><a onclick="setView('lista')">Ver todas →</a></div>
        <div class="card-body" style="padding:0">
          ${ativas.slice(0, 8).map(renderProximaAcao).join('')}
        </div>
      </div>
    `}
  `;
}

function renderProximaAcao(f) {
  const acao = PROXIMA_ACAO[f.estado] || { marco: '—', verbo: 'Aguardar', urg: 'aguardar' };
  return `
    <div class="proxima-acao-row" onclick="setView('detalhe',{fplId:'${f.id}'})">
      <div class="marco ${acao.urg}">${acao.marco}</div>
      <div class="corpo">
        <div class="ttl">${esc(f.titulo_curto || (f.titulo || '').substring(0, 90))}</div>
        <div class="meta">
          <span class="mono small">${esc(f.numero_processo)}</span>
          <span>${gabSigla(f.gabinete_id)}</span>
          ${badge(f.estado)}
        </div>
        <div class="verbo ${acao.urg}">→ ${esc(acao.verbo)}</div>
      </div>
      <div class="chev">›</div>
    </div>
  `;
}

function viewDashboardSggov() {
  const d = state.dashboard;
  if (!d) return '<div class="card-empty">Sem dados</div>';
  const max = Math.max(1, ...d.por_estado.map(x => x.n));

  return `
    <div class="page-head">
      <div>
        <div class="page-title">Dashboard SGGOV</div>
        <div class="page-sub">Visão consolidada do regime de Pegada Legislativa</div>
      </div>
      <button class="btn" data-nav="admin">Ferramentas SGGOV →</button>
    </div>
    <div class="kpis">
      <button class="kpi kpi-btn" onclick="setView('lista')">
        <div class="lbl">Total FPL</div><div class="val">${d.total}</div>
      </button>
      <button class="kpi kpi-btn" onclick="window.filtrarLista({estado:'PUBLICADO'})">
        <div class="lbl">Publicadas</div>
        <div class="val" style="color:var(--success)">${d.por_estado.find(e => e.estado === 'PUBLICADO')?.n || 0}</div>
      </button>
      <button class="kpi kpi-btn" onclick="window.filtrarLista({estado:'EM_CONSULTA_PUBLICA'})">
        <div class="lbl">Em consulta</div>
        <div class="val" style="color:var(--gov-blue)">${d.por_estado.find(e => e.estado === 'EM_CONSULTA_PUBLICA')?.n || 0}</div>
      </button>
      <button class="kpi kpi-btn" onclick="window.filtrarLista({estado:'EM_CM'})">
        <div class="lbl">Em CM</div>
        <div class="val" style="color:var(--warning)">${d.por_estado.find(e => e.estado === 'EM_CM')?.n || 0}</div>
      </button>
    </div>
    <div class="grid-2col mt-12">
      <div class="card">
        <div class="card-head"><h3>Distribuição por estado</h3></div>
        <div class="card-body">
          ${d.por_estado.map(e => {
            const lbl = ESTADOS_LBL[e.estado]?.lbl || e.estado;
            return `<button class="dist-row" onclick="window.filtrarLista({estado:'${e.estado}'})">
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
                <td><strong>${g.sigla}</strong></td><td class="txt-right">${g.n}</td>
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
