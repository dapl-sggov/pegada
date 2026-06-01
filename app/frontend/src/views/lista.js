// views/lista.js — Lista de FPL: cards com mini-cronograma.

import { state, isSggov, gabSigla } from '../state.js';
import { ESTADOS_LBL, TIPOS } from '../constants.js';
import { esc, fmtData, badge, tag } from '../utils.js';
import { loadFpls, loadGabinetes } from '../data.js';
import { renderRoot } from '../render.js';

const MARCOS_VISTA = ['M0', 'M2', 'M3', 'M4', 'M5'];

export async function viewLista() {
  await loadFpls();
  await loadGabinetes();
  const f = state.filtrosLista;
  const filtradas = aplicarFiltros(state.fpls, f);
  const ordenadas = [...filtradas].sort((a, b) =>
    (b.data_criacao || '').localeCompare(a.data_criacao || ''));

  const ESTADOS = Object.keys(ESTADOS_LBL);
  const filtroAtivo = !!(f.q || f.estado || f.gabinete || f.tipo);
  const chips = construirChips(f);

  return `
    <div class="page-head">
      <div>
        <div class="page-title">${isSggov() ? 'Todas as FPL' : 'As minhas FPL'}</div>
        <div class="page-sub">${ordenadas.length} de ${state.fpls.length} fichas${filtroAtivo ? ' (filtrado)' : ''}</div>
      </div>
      ${isSggov() ? '' : '<button class="btn primary" data-nav="nova">+ Nova FPL</button>'}
    </div>

    <div class="filtros-bar" role="search" aria-label="Filtros">
      <div class="filtros-grid">
        <div class="filtro-campo grow">
          <input id="fListaQ" type="search" placeholder="Pesquisar por número, título, gabinete…"
                 value="${esc(f.q)}" aria-label="Pesquisar FPL" autocomplete="off">
        </div>
        <div class="filtro-campo">
          <select id="fListaEstado" aria-label="Filtrar por estado">
            <option value="">Todos os estados</option>
            ${ESTADOS.map(e => `<option value="${e}" ${f.estado === e ? 'selected' : ''}>${ESTADOS_LBL[e].lbl}</option>`).join('')}
          </select>
        </div>
        <div class="filtro-campo">
          <select id="fListaGab" aria-label="Filtrar por gabinete">
            <option value="">Todos os gabinetes</option>
            ${state.gabinetes.map(g => `<option value="${g.id}" ${f.gabinete === g.id ? 'selected' : ''}>${esc(g.nome)}</option>`).join('')}
          </select>
        </div>
        <div class="filtro-campo">
          <select id="fListaTipo" aria-label="Filtrar por tipo">
            <option value="">Todos os tipos</option>
            ${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${f.tipo === k ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
        </div>
        <button class="btn ghost sm" id="fListaLimpar" ${filtroAtivo ? '' : 'disabled'}>Limpar filtros</button>
      </div>
    </div>

    ${chips.length ? `<div class="chips" aria-label="Filtros ativos">${chips.map(c => `
      <span class="chip">${esc(c.lbl)}<button class="x" type="button" data-clear="${c.key}" aria-label="Remover">×</button></span>
    `).join('')}</div>` : ''}

    ${ordenadas.length === 0 ? `
      <div class="card-empty mt-12">${filtroAtivo ? 'Nenhuma FPL corresponde aos filtros.' : 'Sem FPL. Crie a primeira.'}</div>
    ` : `
      <div class="lista-fpl">
        ${ordenadas.map(renderFplRow).join('')}
      </div>
    `}
  `;
}

function renderFplRow(f) {
  return `
    <div class="fpl-row" onclick="setView('detalhe',{fplId:'${f.id}'})" role="link" tabindex="0">
      <div>
        <div class="top">
          <span class="num">${esc(f.numero_processo)}</span>
          ${tag(f.tipo_diploma)}
          ${badge(f.estado)}
          <span class="sigla">${gabSigla(f.gabinete_id)}</span>
        </div>
        <div class="ttl">${esc(f.titulo_curto || f.titulo)}</div>
      </div>
      ${renderMiniCronograma(f)}
    </div>
  `;
}

function renderMiniCronograma(f) {
  const cur = proximoMarco(f);
  return `
    <div class="mini-crono" title="Estado dos marcos">
      ${MARCOS_VISTA.map(m => {
        const done = !!f[`${m.toLowerCase()}_em`];
        const isCur = m === cur;
        const cls = done ? 'done' : isCur ? 'current' : 'todo';
        const tooltip = done
          ? `${m} · validado ${fmtData(f[`${m.toLowerCase()}_em`])}`
          : isCur ? `${m} · a validar` : `${m} · por validar`;
        return `<span class="pt ${cls}" title="${tooltip}">${m.replace('M', '')}</span>`;
      }).join('')}
    </div>
  `;
}

function proximoMarco(f) {
  if (!f.m0_em) return 'M0';
  if (f.estado === 'EM_RSE' && !f.m2_em) return 'M2';
  if (f.estado === 'EM_CONSULTA_PUBLICA' && !f.m3_em) return 'M3';
  if (f.estado === 'EM_CONSULTA_PUBLICA' && f.m3_em && !f.m4_em) return 'M4';
  if (f.estado === 'APROVADO' && !f.m5_em) return 'M5';
  return null;
}

function aplicarFiltros(fpls, f) {
  const q = (f.q || '').toLowerCase();
  return fpls.filter(x => {
    if (f.estado && x.estado !== f.estado) return false;
    if (f.gabinete && x.gabinete_id !== f.gabinete) return false;
    if (f.tipo && x.tipo_diploma !== f.tipo) return false;
    if (q) {
      const hay = [x.numero_processo, x.titulo, x.titulo_curto, gabSigla(x.gabinete_id)]
        .filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function construirChips(f) {
  const out = [];
  if (f.q)        out.push({ key: 'q',        lbl: `Pesquisa: "${f.q}"` });
  if (f.estado)   out.push({ key: 'estado',   lbl: `Estado: ${ESTADOS_LBL[f.estado]?.lbl || f.estado}` });
  if (f.gabinete) out.push({ key: 'gabinete', lbl: `Gabinete: ${gabSigla(f.gabinete)}` });
  if (f.tipo)     out.push({ key: 'tipo',     lbl: `Tipo: ${TIPOS[f.tipo] || f.tipo}` });
  return out;
}

export function bindLista() {
  const re = (id) => document.getElementById(id);
  let timer;
  re('fListaQ')?.addEventListener('input', e => {
    state.filtrosLista.q = e.target.value;
    clearTimeout(timer); timer = setTimeout(() => renderRoot(), 200);
  });
  re('fListaEstado')?.addEventListener('change', e => { state.filtrosLista.estado = e.target.value; renderRoot(); });
  re('fListaGab')?.addEventListener('change',    e => { state.filtrosLista.gabinete = e.target.value; renderRoot(); });
  re('fListaTipo')?.addEventListener('change',   e => { state.filtrosLista.tipo = e.target.value; renderRoot(); });
  re('fListaLimpar')?.addEventListener('click',  () => {
    state.filtrosLista = { q: '', estado: '', gabinete: '', tipo: '' };
    renderRoot();
  });

  document.querySelectorAll('.chip [data-clear]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.filtrosLista[btn.dataset.clear] = '';
      renderRoot();
    });
  });

  // Suporte Enter/Space para fpl-row (acessibilidade)
  document.querySelectorAll('.fpl-row[role="link"]').forEach(row => {
    row.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); row.click(); }
    });
  });
}
