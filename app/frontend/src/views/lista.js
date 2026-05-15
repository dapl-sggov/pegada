// views/lista.js — Lista de FPL com pesquisa global + filtros (item #5).
//
// Os filtros são guardados em `state.filtrosLista` para que o utilizador
// possa navegar para uma FPL e voltar à lista mantendo o contexto.

import { state, isSggov, gabSigla } from '../state.js';
import { ESTADOS_LBL, TIPOS } from '../constants.js';
import { esc, fmtData, badge, tag } from '../utils.js';
import { loadFpls, loadGabinetes } from '../data.js';
import { renderRoot } from '../render.js';

export async function viewLista() {
  await loadFpls();
  await loadGabinetes();
  const f = state.filtrosLista;
  const filtradas = aplicarFiltros(state.fpls, f);

  const ESTADOS = Object.keys(ESTADOS_LBL);
  const filtroAtivo = !!(f.q || f.estado || f.gabinete || f.tipo);

  return `
    <div class="page-head">
      <div>
        <div class="page-title">${isSggov() ? 'Todas as FPL' : 'As minhas FPL'}</div>
        <div class="page-sub">${filtradas.length} de ${state.fpls.length} fichas${filtroAtivo ? ' (filtrado)' : ''}</div>
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

    <div class="card">
      <table class="tbl tbl-sortable">
        <thead><tr>
          <th>N.º Processo</th><th>Tipo</th><th>Título</th><th>Gabinete</th><th>Estado</th><th>M0</th><th>M3</th><th>M5</th>
        </tr></thead>
        <tbody>
          ${filtradas.length === 0 ? `<tr><td colspan="8" class="card-empty">${filtroAtivo ? 'Nenhuma FPL corresponde aos filtros.' : 'Sem FPL. Crie a primeira.'}</td></tr>` : filtradas.map(f => `
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

export function bindLista() {
  const re = (id) => document.getElementById(id);
  let timer;
  re('fListaQ')?.addEventListener('input', e => {
    state.filtrosLista.q = e.target.value;
    clearTimeout(timer); timer = setTimeout(() => renderRoot(), 200);
  });
  re('fListaEstado')?.addEventListener('change', e => { state.filtrosLista.estado = e.target.value; renderRoot(); });
  re('fListaGab')?.addEventListener('change', e => { state.filtrosLista.gabinete = e.target.value; renderRoot(); });
  re('fListaTipo')?.addEventListener('change', e => { state.filtrosLista.tipo = e.target.value; renderRoot(); });
  re('fListaLimpar')?.addEventListener('click', () => {
    state.filtrosLista = { q: '', estado: '', gabinete: '', tipo: '' };
    renderRoot();
  });
}
