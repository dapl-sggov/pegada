// diff-viewer.js — Visualizador de diferenças entre versões da FPL.
//
// Cada versão guarda um snapshot JSON. O viewer:
//   1. Aplaina os snapshots em pares "campo → valor" comparáveis
//   2. Para cada campo: igual / adicionado / removido / alterado
//   3. Renderiza side-by-side com highlight (estilo GitHub)
//
// Os snapshots vêm de /api/fpl/:id/versoes/:numero (a expor — fallback
// usa a string do `descricao` se o endpoint não existir).

import { api } from './api.js';
import { state } from './state.js';
import { esc, openModal, closeModal, fmtDH, toast } from './utils.js';

window.abrirDiffVersoes = async () => {
  if (!state.versoes || state.versoes.length < 2) {
    return toast('São precisas pelo menos duas versões para comparar.', 'info');
  }
  const versoes = state.versoes; // já vêm ordenadas DESC
  const ultimaId = versoes[0].id;
  const penultimaId = versoes[1].id;

  openModal(`
    <div class="modal-head">
      <h3>Comparar versões</h3>
      <button class="btn ghost sm" onclick="closeModal()" aria-label="Fechar">✕</button>
    </div>
    <div class="modal-body">
      <div class="flex gap-12 mb-12">
        <div class="field" style="flex:1"><label>Versão A (anterior)</label>
          <select id="diffA">${versoes.map(v => `<option value="${v.id}" ${v.id === penultimaId ? 'selected' : ''}>v${v.numero} · ${esc(v.marco_validado || '')} · ${fmtDH(v.timestamp)}</option>`).join('')}</select>
        </div>
        <div class="field" style="flex:1"><label>Versão B (mais recente)</label>
          <select id="diffB">${versoes.map(v => `<option value="${v.id}" ${v.id === ultimaId ? 'selected' : ''}>v${v.numero} · ${esc(v.marco_validado || '')} · ${fmtDH(v.timestamp)}</option>`).join('')}</select>
        </div>
        <div class="field" style="align-self:flex-end"><button class="btn primary" id="diffComparar">Comparar</button></div>
      </div>
      <div id="diffArea"><div class="card-empty">Selecione duas versões e clique em "Comparar".</div></div>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal()">Fechar</button>
    </div>
  `);

  document.getElementById('diffComparar').addEventListener('click', async () => {
    const aId = document.getElementById('diffA').value;
    const bId = document.getElementById('diffB').value;
    if (aId === bId) { toast('Selecione versões diferentes.', 'warning'); return; }
    const area = document.getElementById('diffArea');
    area.innerHTML = '<div class="card-empty"><div class="spinner-big" style="margin:0 auto 8px"></div>A carregar…</div>';
    try {
      const [a, b] = await Promise.all([
        api(`/fpl/${state.fpl.id}/versoes/${aId}`).catch(() => null),
        api(`/fpl/${state.fpl.id}/versoes/${bId}`).catch(() => null),
      ]);
      if (!a || !b) {
        area.innerHTML = '<div class="alert warning"><div>Snapshot indisponível para uma das versões. Reveja o histórico para o resumo de cada alteração.</div></div>';
        return;
      }
      area.innerHTML = renderDiff(a.snapshot || a, b.snapshot || b);
    } catch (e) {
      area.innerHTML = `<div class="alert danger"><div>Erro: ${esc(e.message)}</div></div>`;
    }
  });
};

function renderDiff(snapA, snapB) {
  const A = aplainar(snapA);
  const B = aplainar(snapB);
  const todasChaves = [...new Set([...Object.keys(A), ...Object.keys(B)])].sort();

  const linhas = todasChaves.map(k => {
    const va = A[k], vb = B[k];
    const eq = JSON.stringify(va) === JSON.stringify(vb);
    if (eq) return null; // só mostra diferenças
    const tipo = va === undefined ? 'add' : vb === undefined ? 'rem' : 'mod';
    return { k, va, vb, tipo };
  }).filter(Boolean);

  if (linhas.length === 0) {
    return '<div class="alert info"><div><span class="ttl">Sem diferenças relevantes</span>As duas versões têm o mesmo conteúdo nos campos comparáveis.</div></div>';
  }

  return `
    <div class="diff-summary">${linhas.length} diferença(s) encontrada(s)</div>
    <table class="diff-tbl">
      <thead><tr><th style="width:30%">Campo</th><th style="width:35%">Antes</th><th style="width:35%">Depois</th></tr></thead>
      <tbody>
        ${linhas.map(l => `
          <tr class="diff-row diff-${l.tipo}">
            <td class="diff-key">${esc(l.k)}</td>
            <td class="diff-val ${l.tipo === 'add' ? 'empty' : 'rem'}">${l.tipo === 'add' ? '<em>—</em>' : renderVal(l.va)}</td>
            <td class="diff-val ${l.tipo === 'rem' ? 'empty' : 'add'}">${l.tipo === 'rem' ? '<em>—</em>' : renderVal(l.vb)}</td>
          </tr>`).join('')}
      </tbody>
    </table>
  `;
}

// Achata um snapshot para { 'campo.subcampo[i]': valor }
function aplainar(obj, prefix = '', out = {}) {
  if (obj == null) { out[prefix || '(raiz)'] = obj; return out; }
  if (typeof obj !== 'object') { out[prefix || '(raiz)'] = obj; return out; }
  if (Array.isArray(obj)) {
    if (obj.length === 0) { out[prefix] = '[]'; return out; }
    obj.forEach((v, i) => aplainar(v, `${prefix}[${i}]`, out));
    return out;
  }
  for (const k of Object.keys(obj)) {
    aplainar(obj[k], prefix ? `${prefix}.${k}` : k, out);
  }
  return out;
}

function renderVal(v) {
  if (v == null) return '<em>vazio</em>';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  if (s.length > 200) return `<details><summary>${esc(s.slice(0, 200))}…</summary><pre>${esc(s)}</pre></details>`;
  return esc(s);
}
