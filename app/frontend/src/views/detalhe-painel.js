// views/detalhe-painel.js — Vista de detalhe de uma FPL (v2.0).
//
// Duas sub-vistas: 'detalhe' (cards verticais com blocos A/B/D1/D2/D3/E)
// e 'cronograma' (linha temporal dos marcos M0/M2/M3/M4/M5). A escolha
// persiste em sessionStorage por FPL.

import { api } from '../api.js';
import { state, isSggov, userOwns, gabSigla, gabNome, isQa } from '../state.js';
import { ESTADOS_LBL, TIPOS, ORIGEM_LBL, AUDICAO_ESTADO_LBL, FORMA_LBL, MARCOS_LBL } from '../constants.js';
import { esc, fmtData, fmtDH, badge, tag, toast } from '../utils.js';
import { loadFpl } from '../data.js';
import { setView } from '../router.js';
import { abrirNovaAudicao, abrirImportarIntegra, eliminarAudicao } from '../wizard-audicoes.js';

// ---------------------------------------------------------------------------
// Render dispatcher
// ---------------------------------------------------------------------------
export async function viewDetalhePainel() {
  if (!state.fplId) return '<div class="card-empty">FPL não selecionada.</div>';
  await loadFpl(state.fplId);
  const f = state.fpl;
  if (!f) return '<div class="card-empty">FPL não encontrada.</div>';

  const sub = sessionStorage.getItem('fpl.detailView.' + f.id) || 'detalhe';
  return `
    <div class="painel-detalhe">
      ${renderCab(f, sub)}
      <div class="detalhe-body">
        ${sub === 'cronograma' ? renderCronograma(f) : renderDetalhe(f)}
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Cabeçalho com toggle Detalhe ↔ Cronograma
// ---------------------------------------------------------------------------
function renderCab(f, sub) {
  const podeEditar = userOwns(f) || isSggov();
  const podeAprovarCM = isSggov() && f.estado === 'EM_CM';
  return `
    <header class="detalhe-cab">
      <div class="detalhe-cab-top">
        <button class="btn ghost sm" data-nav="lista">← Voltar à lista</button>
        <div class="detalhe-acoes">
          ${podeEditar ? `<button class="btn sm" id="btnGerarFicha">Ver ficha pública</button>` : ''}
          ${podeEditar ? `<button class="btn sm" id="btnExportCanon">Exportar JSON canónico</button>` : ''}
          ${podeAprovarCM ? `<button class="btn primary sm" id="btnAprovarCM">Aprovar em CM</button>` : ''}
        </div>
      </div>
      <div class="detalhe-titulo-row">
        <div>
          <div class="detalhe-numero">${esc(f.numero_processo)} · ${tag(f.tipo_diploma)} · ${badge(f.estado)}</div>
          <h1 class="detalhe-titulo">${esc(f.titulo)}</h1>
          <div class="detalhe-meta">${esc(gabNome(f.gabinete_id))} · Criada em ${fmtData(f.data_criacao)} · Versão ${f.versao_atual}</div>
        </div>
      </div>
      <nav class="detalhe-toggle" role="tablist" aria-label="Vista">
        <button role="tab" aria-selected="${sub === 'detalhe' ? 'true' : 'false'}"
                class="${sub === 'detalhe' ? 'active' : ''}" data-sub="detalhe">Detalhe</button>
        <button role="tab" aria-selected="${sub === 'cronograma' ? 'true' : 'false'}"
                class="${sub === 'cronograma' ? 'active' : ''}" data-sub="cronograma">Cronograma</button>
      </nav>
    </header>
  `;
}

// ---------------------------------------------------------------------------
// Sub-vista: Detalhe (cards verticais)
// ---------------------------------------------------------------------------
function renderDetalhe(f) {
  const podeEditar = userOwns(f) || isSggov();
  return `
    ${blocoA(f)}
    ${blocoB(f, podeEditar)}
    ${blocoD1(f, podeEditar)}
    ${blocoD2(f, podeEditar)}
    ${blocoD3(f, podeEditar)}
    ${blocoE(f, podeEditar)}
    ${blocoAcoesMarcos(f, podeEditar)}
    ${blocoHistorico(f)}
  `;
}

function blocoA(f) {
  return `
    <section class="bloco-section">
      <div class="bloco-head"><div class="ttl"><div class="letra">A</div><div><h3>Identificação</h3></div></div></div>
      <div class="bloco-body">
        <div class="field-grid">
          <div class="field"><label>Número de processo</label><div class="val">${esc(f.numero_processo)}</div></div>
          <div class="field"><label>Tipo</label><div class="val">${TIPOS[f.tipo_diploma] || f.tipo_diploma}</div></div>
          <div class="field full"><label>Título</label><div class="val">${esc(f.titulo)}</div></div>
          <div class="field"><label>Gabinete proponente</label><div class="val">${esc(gabNome(f.gabinete_id))}</div></div>
          <div class="field"><label>Estado</label><div class="val">${badge(f.estado)}</div></div>
        </div>
      </div>
    </section>
  `;
}

function blocoB(f, podeEditar) {
  return `
    <section class="bloco-section">
      <div class="bloco-head">
        <div class="ttl"><div class="letra">B</div><div><h3>Enquadramento</h3></div></div>
        ${podeEditar ? `<button class="btn ghost sm" id="btnEditarBlocoB">Editar</button>` : ''}
      </div>
      <div class="bloco-body" id="blocoBBody">
        <div class="field-grid">
          <div class="field"><label>Tipo de origem</label><div class="val">${ORIGEM_LBL[f.tipo_origem] || f.tipo_origem || '<em>—</em>'}</div></div>
          <div class="field"><label>Referência</label><div class="val">${esc(f.referencia_origem || '—')}</div></div>
          <div class="field full"><label>Síntese do problema</label><div class="val long">${esc(f.sintese_problema || '<em>(por preencher)</em>')}</div></div>
          <div class="field"><label>Avaliação prévia</label><div class="val">${f.avaliacao_previa === 1 ? 'Sim' : f.avaliacao_previa === 0 ? 'Não' : '—'}</div></div>
        </div>
      </div>
    </section>
  `;
}

function blocoD1(f, podeEditar) {
  const lista = (f.audicoes || []).filter(a => a.categoria === 'OBRIGATORIA');
  return `
    <section class="bloco-section">
      <div class="bloco-head">
        <div class="ttl"><div class="letra">D₁</div><div>
          <h3>Audições obrigatórias</h3>
          <div class="sub">Entidades que a lei impõe ouvir para este diploma</div>
        </div></div>
        ${podeEditar ? `<button class="btn sm" id="btnNovaD1">+ Nova audição</button>` : ''}
      </div>
      <div class="bloco-body">
        ${lista.length === 0 ? '<div class="card-empty">Sem audições obrigatórias registadas.</div>' :
          `<ul class="audicoes-list">${lista.map(a => renderAudicao(a, podeEditar)).join('')}</ul>`}
      </div>
    </section>
  `;
}

function blocoD2(f, podeEditar) {
  const lista = (f.audicoes || []).filter(a => a.categoria === 'GSEPCM');
  return `
    <section class="bloco-section">
      <div class="bloco-head">
        <div class="ttl"><div class="letra">D₂</div><div>
          <h3>Audições promovidas pelo GSEPCM</h3>
          <div class="sub">Audições discricionárias durante o processo legislativo</div>
        </div></div>
        ${podeEditar ? `<button class="btn sm" id="btnNovaD2">+ Nova audição</button>` : ''}
      </div>
      <div class="bloco-body">
        ${lista.length === 0 ? '<div class="card-empty">Sem audições GSEPCM registadas.</div>' :
          `<ul class="audicoes-list">${lista.map(a => renderAudicao(a, podeEditar)).join('')}</ul>`}
      </div>
    </section>
  `;
}

function blocoD3(f, podeEditar) {
  const lista = f.integra || [];
  return `
    <section class="bloco-section">
      <div class="bloco-head">
        <div class="ttl"><div class="letra">D₃</div><div>
          <h3>Interações INTEGRA (pré-processo)</h3>
          <div class="sub">Contexto histórico do INTEGRA da UnIT · read-only</div>
        </div></div>
        ${podeEditar ? `<button class="btn sm ghost" id="btnImportIntegra">Importar JSON</button>` : ''}
      </div>
      <div class="bloco-body">
        ${lista.length === 0 ? '<div class="card-empty">Sem interações INTEGRA ingeridas para esta FPL.</div>' : `
          <div class="integra-info">${lista.length} interaç${lista.length === 1 ? 'ão' : 'ões'} registadas pelo INTEGRA antes da entrada em processo legislativo.</div>
          <ul class="integra-list">
            ${lista.map(i => {
              let p = {}; try { p = typeof i.payload === 'string' ? JSON.parse(i.payload) : (i.payload || {}); } catch {}
              return `<li>
                <div class="entidade">${esc(i.entidade || p.entidade || '—')}</div>
                <div class="data muted small">${fmtData(i.data_interacao)} · gabinete ${esc(i.gabinete_origem)}</div>
                ${p.objeto ? `<div class="objeto">${esc(p.objeto)}</div>` : ''}
                ${p.sintese ? `<div class="sintese">${esc(p.sintese)}</div>` : ''}
              </li>`;
            }).join('')}
          </ul>`}
      </div>
    </section>
  `;
}

function renderAudicao(a, podeEditar) {
  return `
    <li class="audicao-item">
      <div class="audicao-head">
        <div>
          <div class="entidade">${esc(a.entidade)}</div>
          ${a.base_legal ? `<div class="base-legal">${esc(a.base_legal)}</div>` : ''}
          <div class="meta">
            <span class="estado-pill estado-${esc(a.estado || 'PEDIDA')}">${AUDICAO_ESTADO_LBL[a.estado] || a.estado}</span>
            ${a.forma ? `<span class="forma muted">${FORMA_LBL[a.forma] || a.forma}</span>` : ''}
            ${a.data_pedido ? `<span class="data muted">Pedida ${fmtData(a.data_pedido)}</span>` : ''}
            ${a.data_resposta ? `<span class="data muted">Resposta ${fmtData(a.data_resposta)}</span>` : ''}
          </div>
        </div>
        ${podeEditar ? `
          <div class="acoes">
            <button class="btn ghost sm" data-edit-aud="${a.id}" data-cat="${a.categoria}">Editar</button>
            <button class="btn ghost sm danger" data-del-aud="${a.id}">×</button>
          </div>` : ''}
      </div>
      ${a.sintese_posicao ? `<div class="sintese"><strong>Síntese:</strong> ${esc(a.sintese_posicao)}</div>` : ''}
      ${a.decisao_incorporacao ? `<div class="decisao"><strong>Decisão:</strong> ${esc(a.decisao_incorporacao)}</div>` : ''}
      ${a.justificacao_decisao ? `<div class="justificacao"><strong>Justificação:</strong> ${esc(a.justificacao_decisao)}</div>` : ''}
    </li>
  `;
}

function blocoE(f, podeEditar) {
  return `
    <section class="bloco-section">
      <div class="bloco-head">
        <div class="ttl"><div class="letra">E</div><div>
          <h3>Consulta pública</h3>
          <div class="sub">Link ConsultaLex · n.º de contributos · síntese e decisão</div>
        </div></div>
        ${podeEditar ? `<button class="btn ghost sm" id="btnEditarBlocoE">Editar</button>` : ''}
      </div>
      <div class="bloco-body" id="blocoEBody">
        <div class="field-grid">
          <div class="field full"><label>Link ConsultaLex</label>
            <div class="val">${f.cl_link ? `<a href="${esc(f.cl_link)}" target="_blank" rel="noopener">${esc(f.cl_link)}</a>` : '<em>—</em>'}</div>
          </div>
          <div class="field"><label>N.º de contributos</label>
            <div class="val">${f.cl_n_contributos ?? '<em>—</em>'}</div>
          </div>
          <div class="field full"><label>Síntese e decisão de incorporação</label>
            <div class="val long">${esc(f.cl_sintese || '<em>(por preencher)</em>')}</div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function blocoAcoesMarcos(f, podeEditar) {
  if (!podeEditar) return '';
  const proximo = proximoMarco(f);
  if (!proximo) return '';
  return `
    <section class="bloco-section bloco-acoes">
      <div class="bloco-head">
        <div class="ttl"><div class="letra">⇨</div><div><h3>Próximo passo</h3></div></div>
      </div>
      <div class="bloco-body">
        <p>Próximo marco: <strong>${proximo} · ${MARCOS_LBL[proximo]}</strong>.</p>
        <button class="btn primary" id="btnValidarMarco" data-marco="${proximo}">Validar ${proximo}</button>
      </div>
    </section>
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

function blocoHistorico(f) {
  const eventos = state.eventos || [];
  if (eventos.length === 0) return '';
  return `
    <section class="bloco-section">
      <div class="bloco-head"><div class="ttl"><div class="letra">📜</div><div><h3>Histórico</h3></div></div></div>
      <div class="bloco-body">
        <ul class="historico-list">
          ${eventos.slice(0, 20).map(e => `
            <li>
              <div class="data muted small">${fmtDH(e.timestamp)}</div>
              <div class="tipo">${esc(e.tipo)}</div>
              <div class="autor muted">${esc(e.autor_nome || '—')}</div>
            </li>
          `).join('')}
        </ul>
      </div>
    </section>
  `;
}

// ---------------------------------------------------------------------------
// Sub-vista: Cronograma
// ---------------------------------------------------------------------------
function renderCronograma(f) {
  const marcos = [
    { id: 'M0', em: f.m0_em, por: f.m0_por },
    { id: 'M2', em: f.m2_em },
    { id: 'M3', em: f.m3_em },
    { id: 'M4', em: f.m4_em, por: f.m4_por },
    { id: 'M5', em: f.m5_em, por: f.m5_por },
  ];
  return `
    <div class="cronograma">
      <ol class="crono-list">
        ${marcos.map(m => `
          <li class="crono-item ${m.em ? 'feito' : 'pendente'}">
            <div class="crono-marker">${m.id}</div>
            <div class="crono-body">
              <div class="crono-titulo">${MARCOS_LBL[m.id]}</div>
              ${m.em
                ? `<div class="crono-data">${fmtDH(m.em)}</div>`
                : `<div class="crono-data muted">Por validar</div>`}
            </div>
          </li>
        `).join('')}
      </ol>
      ${f.referencia_dr ? `
        <div class="crono-publicacao">
          <strong>Diário da República:</strong> ${esc(f.referencia_dr)}<br>
          ${f.hash_publicacao ? `<code class="hash">SHA-256: ${esc(f.hash_publicacao)}</code>` : ''}
        </div>
      ` : ''}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Bindings
// ---------------------------------------------------------------------------
export function bindDetalhePainel() {
  // Toggle Detalhe ↔ Cronograma
  document.querySelectorAll('.detalhe-toggle [data-sub]').forEach(b => {
    b.addEventListener('click', () => {
      const sub = b.dataset.sub;
      try { sessionStorage.setItem('fpl.detailView.' + state.fpl.id, sub); } catch {}
      setView('detalhe', { fplId: state.fpl.id, sub });
    });
  });

  document.getElementById('btnGerarFicha')?.addEventListener('click', () => {
    window.open(`/api/fpl/${state.fpl.id}/ficha-publica`, '_blank');
  });

  document.getElementById('btnExportCanon')?.addEventListener('click', async () => {
    try {
      const j = await api(`/fpl/${state.fpl.id}/canonico`);
      const blob = new Blob([JSON.stringify(j, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fpl-${state.fpl.numero_processo.replace(/\//g, '_')}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast('Falha: ' + e.message, 'error'); }
  });

  document.getElementById('btnAprovarCM')?.addEventListener('click', async () => {
    const ref = prompt('Referência do Diário da República (opcional):');
    if (ref === null) return;
    try {
      await api(`/fpl/${state.fpl.id}/aprovar-cm`, { method: 'POST', body: { referencia_dr: ref || null } });
      toast('Aprovado em CM', 'success');
      setView('detalhe', { fplId: state.fpl.id });
    } catch (e) { toast('Falha: ' + e.message, 'error'); }
  });

  document.getElementById('btnEditarBlocoB')?.addEventListener('click', () => abrirEditorBlocoB());
  document.getElementById('btnEditarBlocoE')?.addEventListener('click', () => abrirEditorBlocoE());

  document.getElementById('btnNovaD1')?.addEventListener('click', () => abrirNovaAudicao('OBRIGATORIA'));
  document.getElementById('btnNovaD2')?.addEventListener('click', () => abrirNovaAudicao('GSEPCM'));
  document.getElementById('btnImportIntegra')?.addEventListener('click', () => abrirImportarIntegra());

  document.querySelectorAll('[data-edit-aud]').forEach(b => {
    b.addEventListener('click', () => {
      const id = b.dataset.editAud;
      const a = (state.fpl.audicoes || []).find(x => x.id === id);
      if (a) abrirNovaAudicao(a.categoria, a);
    });
  });
  document.querySelectorAll('[data-del-aud]').forEach(b => {
    b.addEventListener('click', () => eliminarAudicao(b.dataset.delAud));
  });

  document.getElementById('btnValidarMarco')?.addEventListener('click', async (e) => {
    const marco = e.currentTarget.dataset.marco;
    try {
      const r = await api(`/fpl/${state.fpl.id}/marcos/${marco}/validar`, { method: 'POST', body: {} });
      if (r.ok) {
        toast(`${marco} validado`, 'success');
        setView('detalhe', { fplId: state.fpl.id });
      } else {
        const detalhes = (r.pendencias || []).map(p => '· ' + p.detalhe).join('\n');
        toast(`${marco} bloqueado:\n${detalhes}`, 'error');
      }
    } catch (err) {
      const data = err.data;
      if (data?.pendencias) {
        const detalhes = data.pendencias.map(p => '· ' + p.detalhe).join('\n');
        toast(`${marco} bloqueado:\n${detalhes}`, 'error');
      } else {
        toast('Falha: ' + err.message, 'error');
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Editores inline (Bloco B + E)
// ---------------------------------------------------------------------------
function abrirEditorBlocoB() {
  const f = state.fpl;
  const html = `
    <h2 style="margin-bottom:14px">Editar Bloco B · Enquadramento</h2>
    <form id="formBlocoB">
      <div class="field"><label>Tipo de origem</label>
        <select name="tipo_origem">
          <option value="">—</option>
          ${Object.entries(ORIGEM_LBL).map(([k, v]) => `<option value="${k}" ${f.tipo_origem === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Referência da origem</label>
        <input type="text" name="referencia_origem" value="${esc(f.referencia_origem || '')}" placeholder="Ex.: Diretiva (UE) 2024/884">
      </div>
      <div class="field"><label>Síntese do problema (mín. 200 c)</label>
        <textarea name="sintese_problema" rows="6">${esc(f.sintese_problema || '')}</textarea>
      </div>
      <div class="field"><label>Avaliação prévia</label>
        <select name="avaliacao_previa">
          <option value="">—</option>
          <option value="1" ${f.avaliacao_previa === 1 ? 'selected' : ''}>Sim</option>
          <option value="0" ${f.avaliacao_previa === 0 ? 'selected' : ''}>Não</option>
        </select>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" data-cancel>Cancelar</button>
        <button type="submit" class="btn primary">Guardar</button>
      </div>
    </form>
  `;
  abrirModalBack(html, async (fd) => {
    const body = {
      tipo_origem: fd.get('tipo_origem') || null,
      referencia_origem: fd.get('referencia_origem') || null,
      sintese_problema: fd.get('sintese_problema') || null,
      avaliacao_previa: fd.get('avaliacao_previa') === '' ? null : parseInt(fd.get('avaliacao_previa'), 10),
    };
    await api(`/fpl/${f.id}/bloco-b`, { method: 'PATCH', body });
    toast('Bloco B atualizado', 'success');
    setView('detalhe', { fplId: f.id });
  });
}

function abrirEditorBlocoE() {
  const f = state.fpl;
  const html = `
    <h2 style="margin-bottom:14px">Editar Bloco E · Consulta pública</h2>
    <form id="formBlocoE">
      <div class="field"><label>Link ConsultaLex</label>
        <input type="url" name="cl_link" value="${esc(f.cl_link || '')}" placeholder="https://consulta.lex.pt/processos/...">
      </div>
      <div class="field"><label>N.º de contributos recebidos</label>
        <input type="number" name="cl_n_contributos" min="0" value="${f.cl_n_contributos ?? ''}">
      </div>
      <div class="field"><label>Síntese e decisão de incorporação (mín. 200 c)</label>
        <textarea name="cl_sintese" rows="8">${esc(f.cl_sintese || '')}</textarea>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" data-cancel>Cancelar</button>
        <button type="submit" class="btn primary">Guardar</button>
      </div>
    </form>
  `;
  abrirModalBack(html, async (fd) => {
    const n = fd.get('cl_n_contributos');
    const body = {
      cl_link: fd.get('cl_link') || null,
      cl_n_contributos: n === '' ? null : parseInt(n, 10),
      cl_sintese: fd.get('cl_sintese') || null,
    };
    await api(`/fpl/${f.id}/bloco-e`, { method: 'PATCH', body });
    toast('Bloco E atualizado', 'success');
    setView('detalhe', { fplId: f.id });
  });
}

function abrirModalBack(html, onSubmit) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(back);
  back.querySelector('[data-cancel]')?.addEventListener('click', () => back.remove());
  back.addEventListener('click', e => { if (e.target === back) back.remove(); });
  back.querySelector('form')?.addEventListener('submit', async e => {
    e.preventDefault();
    try { await onSubmit(new FormData(e.currentTarget)); back.remove(); }
    catch (err) { toast('Erro: ' + (err.message || ''), 'error'); }
  });
}
