// views/lista.js — Lista de FPL com pesquisa global, filtros, chips de
// filtros ativos e ordenação por coluna (sortable).

import { state, isSggov, gabSigla } from '../state.js';
import { ESTADOS_LBL, TIPOS } from '../constants.js';
import { esc, fmtData, badge, tag } from '../utils.js';
import { loadFpls, loadGabinetes } from '../data.js';
import { renderRoot } from '../render.js';

const COLS_SORTABLE = {
  numero_processo: 'N.º Processo',
  tipo_diploma:    'Tipo',
  titulo:          'Título',
  gabinete_id:     'Gabinete',
  estado_workflow: 'Estado',
  m0_validado_em:  'M0',
  m3_validado_em:  'M3',
  m5_validado_em:  'M5',
};

export async function viewLista() {
  await loadFpls();
  await loadGabinetes();
  const f = state.filtrosLista;
  const filtradas = aplicarFiltros(state.fpls, f);
  const ordenadas = aplicarOrdenacao(filtradas, state.listaSort);

  const ESTADOS = Object.keys(ESTADOS_LBL);
  const filtroAtivo = !!(f.q || f.estado || f.gabinete || f.tipo);
  const chips = construirChips(f);
  const sort = state.listaSort;

  return `
    <div class="page-head">
      <div>
        <div class="page-title">${isSggov() ? 'Todas as FPL' : 'As minhas FPL'}</div>
        <div class="page-sub">${ordenadas.length} de ${state.fpls.length} fichas${filtroAtivo ? ' (filtrado)' : ''}</div>
      </div>
      ${isSggov() ? '' : '<button class="btn primary" data-nav="nova">+ Nova FPL</button>'}
    </div>

    <div class="filtros-bar" role="search" aria-label="Filtros e pesquisa">
      <div class="filtros-grid">
        <div class="filtro-campo grow">
          <label for="fListaQ" class="visually-hidden">Pesquisar</label>
          <input id="fListaQ" type="search" placeholder="Pesquisar por número, título, gabinete…"
                 value="${esc(f.q)}" aria-label="Pesquisar FPL" autocomplete="off">
        </div>
        <div class="filtro-campo">
          <label for="fListaEstado" class="visually-hidden">Estado</label>
          <select id="fListaEstado" aria-label="Filtrar por estado">
            <option value="">Todos os estados</option>
            ${ESTADOS.map(e => `<option value="${e}" ${f.estado === e ? 'selected' : ''}>${ESTADOS_LBL[e].lbl}</option>`).join('')}
          </select>
        </div>
        <div class="filtro-campo">
          <label for="fListaGab" class="visually-hidden">Gabinete</label>
          <select id="fListaGab" aria-label="Filtrar por gabinete">
            <option value="">Todos os gabinetes</option>
            ${state.gabinetes.map(g => `<option value="${g.id}" ${f.gabinete === g.id ? 'selected' : ''}>${esc(g.nome)}</option>`).join('')}
          </select>
        </div>
        <div class="filtro-campo">
          <label for="fListaTipo" class="visually-hidden">Tipo de diploma</label>
          <select id="fListaTipo" aria-label="Filtrar por tipo">
            <option value="">Todos os tipos</option>
            ${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${f.tipo === k ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
        </div>
        <button class="btn ghost sm" id="fListaLimpar" ${filtroAtivo ? '' : 'disabled'}>Limpar filtros</button>
      </div>
    </div>

    ${chips.length ? `<div class="chips" aria-label="Filtros ativos">${chips.map(c => `
      <span class="chip">${esc(c.lbl)}<button class="x" type="button" data-clear="${c.key}" aria-label="Remover filtro ${esc(c.lbl)}">×</button></span>
    `).join('')}</div>` : ''}

    <div class="card">
      <table class="tbl tbl-sortable">
        <thead><tr>
          ${Object.entries(COLS_SORTABLE).map(([col, lbl]) => `
            <th data-sort="${col}" class="${sort.col === col ? 'sort-' + sort.dir : ''}">${lbl}</th>
          `).join('')}
        </tr></thead>
        <tbody>
          ${ordenadas.length === 0 ? `<tr><td colspan="8" class="card-empty">${filtroAtivo ? 'Nenhuma FPL corresponde aos filtros.' : 'Sem FPL. Crie a primeira.'}</td></tr>` : ordenadas.map(f => `
            <tr onclick="setView('detalhe',{fplId:'${f.id}'})">
              <td><strong>${esc(f.numero_processo)}</strong></td>
              <td>${tag(f.tipo_diploma)}</td>
              <td class="cell-titulo">${esc(f.titulo_curto || f.titulo)}</td>
              <td>${gabSigla(f.gabinete_id)}</td>
              <td>${badge(f.estado_workflow)}</td>
              <td class="muted small">${fmtData(f.m0_validado_em) || '—'}</td>
              <td class="muted small">${fmtData(f.m3_validado_em) || '—'}</td>
              <td class="muted small">${fmtData(f.m5_validado_em) || '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function aplicarFiltros(fpls, f) {
  const q = (f.q || '').toLowerCase();
  return fpls.filter(x => {
    if (f.estado && x.estado_workflow !== f.estado) return false;
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

function aplicarOrdenacao(fpls, sort) {
  const { col, dir } = sort;
  const m = dir === 'asc' ? 1 : -1;
  return [...fpls].sort((a, b) => {
    let av = a[col] ?? '', bv = b[col] ?? '';
    // Datas e strings comparam-se lexicograficamente (ISO 8601 ordena bem)
    if (av < bv) return -1 * m;
    if (av > bv) return  1 * m;
    return 0;
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

  // Chips: remover filtro individual
  document.querySelectorAll('.chip [data-clear]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.filtrosLista[btn.dataset.clear] = '';
      renderRoot();
    });
  });

  // Sortable: clique no cabeçalho cicla dir; clique noutra coluna fica em desc
  document.querySelectorAll('.tbl-sortable th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (state.listaSort.col === col) {
        state.listaSort.dir = state.listaSort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        state.listaSort = { col, dir: 'desc' };
      }
      renderRoot();
    });
  });
}
