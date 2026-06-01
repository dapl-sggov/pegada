// views/detalhe-painel.js — Vista de detalhe da FPL no estilo "painel" do
// design handoff: cabeçalho com breadcrumb + título + estado + stepper
// horizontal de marcos, body em grelha 2-colunas com pc-cards por bloco.

import { api } from '../api.js';
import { state, isSggov, userOwns, gabSigla, gabNome } from '../state.js';
import { ESTADOS_LBL, TIPOS, ORIGEM_LBL, AUDICAO_ESTADO_LBL, FORMA_LBL, MARCOS_LBL } from '../constants.js';
import { esc, fmtData, fmtDH, toast } from '../utils.js';
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
  return painelHead(f, sub) + (sub === 'cronograma' ? painelCronograma(f) : painelDetalhe(f));
}

// ---------------------------------------------------------------------------
// Próximo marco (lógica simétrica à do backend workflow.js)
// ---------------------------------------------------------------------------
const MARCOS_ORD = ['M0', 'M2', 'M3', 'M4', 'M5'];

function proximoMarco(f) {
  if (!f.m0_em) return 'M0';
  if (f.estado === 'EM_RSE' && !f.m2_em) return 'M2';
  if (f.estado === 'EM_CONSULTA_PUBLICA' && !f.m3_em) return 'M3';
  if (f.estado === 'EM_CONSULTA_PUBLICA' && f.m3_em && !f.m4_em) return 'M4';
  if (f.estado === 'EM_CM') return 'APROVAR'; // botão "Aprovar em CM"
  if (f.estado === 'APROVADO' && !f.m5_em) return 'M5';
  return null;
}

// ---------------------------------------------------------------------------
// Cabeçalho (painel-head)
// ---------------------------------------------------------------------------
function painelHead(f, sub) {
  const podeEditar = userOwns(f) || isSggov();
  const podeAprovarCM = isSggov() && f.estado === 'EM_CM';
  const pm = proximoMarco(f);
  const est = ESTADOS_LBL[f.estado] || { lbl: f.estado, cls: 'criado' };
  const nAud = (f.audicoes || []).length;
  const nIntegra = (f.integra || []).length;
  const versao = f.versao_atual || 1;

  // Estado por marco
  const marcos = MARCOS_ORD.map(id => {
    const em = f[`${id.toLowerCase()}_em`];
    return { id, lbl: MARCOS_LBL[id], em };
  });
  let curIdx = marcos.findIndex(m => !m.em);
  if (curIdx === -1) curIdx = marcos.length;
  marcos.forEach((m, i) => {
    m.estado = m.em ? 'done' : (i === curIdx && pm === m.id ? 'current' : 'todo');
  });

  return `
    <div class="painel-detalhe">
      <header class="painel-head">
        <div class="painel-bcrumb">
          <button onclick="setView('lista')">FPL</button> / ${esc(f.numero_processo)}
        </div>
        <div class="painel-title-row">
          <h1 class="painel-title">${esc(f.titulo)}</h1>
          <span class="painel-estado s-${esc(est.cls)}">● ${esc(est.lbl)}</span>
        </div>
        <div class="painel-meta">
          <span class="pill-tag">${esc(TIPOS[f.tipo_diploma] || f.tipo_diploma)}</span>
          <span class="pill-tag">${esc(gabSigla(f.gabinete_id))}</span>
          <span>Versão v${versao}</span>
          <span class="sep">·</span>
          <span>Criada ${fmtData(f.data_criacao)}</span>
          <span class="sep">·</span>
          <span>${nAud} ${nAud === 1 ? 'audição' : 'audições'}</span>
          ${nIntegra ? `<span class="sep">·</span><span>${nIntegra} INTEGRA</span>` : ''}
          ${podeAprovarCM ? `<button class="btn sm primary" id="btnAprovarCM" style="margin-left:10px">Marcar aprovado em CM</button>` : ''}
          ${f.estado === 'PUBLICADO' ? `<a class="btn sm" href="/api/fpl/${f.id}/ficha-publica" target="_blank" rel="noopener" style="margin-left:8px">Ver ficha pública</a>` : ''}
          ${podeEditar ? `<button class="btn sm" id="btnExportCanon" style="margin-left:8px">↓ JSON canónico</button>` : ''}

          <div class="painel-toggle" role="tablist" aria-label="Vista da FPL">
            <button data-sub="detalhe"    role="tab" aria-selected="${sub === 'detalhe'}">Detalhe</button>
            <button data-sub="cronograma" role="tab" aria-selected="${sub === 'cronograma'}">Cronograma</button>
          </div>
        </div>
        <div class="painel-stepper" style="grid-template-columns:repeat(5,1fr)">
          ${marcos.map(m => `
            <div class="painel-step ${m.estado}" data-card-target="${cardDoMarco(m.id)}" role="button" tabindex="0"
                 aria-label="${m.id} ${m.lbl} — ir para a secção">
              <div class="dot">${m.estado === 'done' ? '✓' : m.id.replace('M', '')}</div>
              <div>
                <div class="lbl">${m.id} · ${esc(m.lbl)}</div>
                <div class="sub">${m.em ? fmtData(m.em) : (m.estado === 'current' ? 'a validar' : '—')}</div>
                ${m.estado === 'current' && podeEditar && pm === m.id ? `
                  <button class="cta" data-validar-marco="${m.id}" onclick="event.stopPropagation()">Validar ${m.id}</button>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </header>
  `;
}

function cardDoMarco(id) {
  return { M0: 'card-A', M2: 'card-E', M3: 'card-E', M4: 'card-D1', M5: 'card-A' }[id] || 'card-A';
}

// ---------------------------------------------------------------------------
// Body Detalhe (pc-cards em grelha 2 colunas)
// ---------------------------------------------------------------------------
function painelDetalhe(f) {
  const podeEditar = userOwns(f) || isSggov();
  return `
    <div class="painel-body">
      ${pcA(f)}
      ${pcB(f, podeEditar)}
      ${pcD1(f, podeEditar)}
      ${pcD2(f, podeEditar)}
      ${pcD3(f, podeEditar)}
      ${pcE(f, podeEditar)}
      ${pcHistorico()}
    </div>
    </div>
  `;
}

function pcA(f) {
  return `
    <div class="pc-card" id="card-A">
      <div class="pc-card-head">
        <div class="pc-letter">A</div>
        <div><div class="ttl">Identificação</div><div class="sub">Bloco A</div></div>
        <span class="ok" style="margin-left:auto">✓ completo</span>
      </div>
      <div class="pc-card-body">
        <div class="pc-kv">
          <div class="k">Tipo</div><div class="v">${esc(TIPOS[f.tipo_diploma] || f.tipo_diploma)}</div>
          <div class="k">Processo</div><div class="v mono">${esc(f.numero_processo)}</div>
          <div class="k">Gabinete</div><div class="v">${esc(gabNome(f.gabinete_id))}</div>
          <div class="k">Criação</div><div class="v">${fmtDH(f.data_criacao)}</div>
        </div>
      </div>
    </div>
  `;
}

function pcB(f, podeEditar) {
  const len = (f.sintese_problema || '').length;
  const completo = len >= 200 && !!f.tipo_origem;
  return `
    <div class="pc-card" id="card-B">
      <div class="pc-card-head">
        <div class="pc-letter">B</div>
        <div><div class="ttl">Enquadramento</div><div class="sub">Bloco B</div></div>
        ${completo ? '<span class="ok" style="margin-left:auto">✓ completo</span>' :
                     `<span class="warn" style="margin-left:auto">⚠ ${len < 200 ? 'síntese curta' : 'origem em falta'}</span>`}
        ${podeEditar ? `<button class="more" id="btnEditarBlocoB">Editar</button>` : ''}
      </div>
      <div class="pc-card-body">
        <div class="pc-kv">
          <div class="k">Origem</div><div class="v ${!f.tipo_origem ? 'empty' : ''}">${ORIGEM_LBL[f.tipo_origem] || 'Por preencher'}</div>
          <div class="k">Referência</div><div class="v ${!f.referencia_origem ? 'empty' : ''}">${esc(f.referencia_origem || '—')}</div>
          <div class="k">Aval. impacto</div><div class="v">${f.avaliacao_previa === 1 ? '✓ Sim' : f.avaliacao_previa === 0 ? 'Não' : '<span class="empty">Não indicada</span>'}</div>
          <div class="k">Síntese</div><div class="v ${!f.sintese_problema ? 'empty' : ''}" style="font-size:11.5px;line-height:1.55">${esc((f.sintese_problema || '').slice(0, 280))}${len > 280 ? '…' : ''}${!f.sintese_problema ? ' (mín. 200 c)' : ''}</div>
        </div>
      </div>
    </div>
  `;
}

function pcD1(f, podeEditar) {
  const lista = (f.audicoes || []).filter(a => a.categoria === 'OBRIGATORIA');
  return audicoesCard(f, lista, podeEditar, 'D₁', 'card-D1',
    'Audições obrigatórias', 'Entidades exigidas pela lei para este diploma',
    'OBRIGATORIA');
}

function pcD2(f, podeEditar) {
  const lista = (f.audicoes || []).filter(a => a.categoria === 'GSEPCM');
  return audicoesCard(f, lista, podeEditar, 'D₂', 'card-D2',
    'Audições do GSEPCM', 'Audições discricionárias durante o processo legislativo',
    'GSEPCM');
}

function audicoesCard(f, lista, podeEditar, letra, id, ttl, sub, categoria) {
  const n = lista.length;
  const comDecisao = lista.filter(a => a.estado === 'RESPONDEU' && a.decisao_incorporacao).length;
  const pendentes = lista.filter(a => a.estado === 'RESPONDEU' && !a.decisao_incorporacao).length;
  const badge = n === 0 ? '<span class="count" style="margin-left:auto">vazio</span>'
              : pendentes > 0 ? `<span class="warn" style="margin-left:auto">⚠ ${pendentes} sem decisão</span>`
              : `<span class="count" style="margin-left:auto">${n}</span>`;
  return `
    <div class="pc-card wide" id="${id}">
      <div class="pc-card-head">
        <div class="pc-letter d">${letra}</div>
        <div><div class="ttl">${esc(ttl)}</div><div class="sub">${esc(sub)}</div></div>
        ${badge}
        ${podeEditar ? `<button class="more" data-nova-aud="${categoria}">+ Nova</button>` : ''}
      </div>
      <div class="pc-card-body">
        ${lista.length === 0 ? '<div class="pc-empty">Sem registos.</div>' :
          lista.map(a => audicaoMini(a, podeEditar)).join('')}
      </div>
    </div>
  `;
}

function audicaoMini(a, podeEditar) {
  const decisao = a.decisao_incorporacao ? a.decisao_incorporacao.toUpperCase() : 'PENDENTE';
  return `
    <div class="pc-mini">
      <div class="pc-mini-date">${fmtData(a.data_pedido) || '—'}</div>
      <div>
        <div class="pc-mini-ent">${esc(a.entidade)}</div>
        ${a.base_legal ? `<div class="pc-mini-sub">${esc(a.base_legal)}</div>` : ''}
        <div class="pc-mini-sub">
          <span class="pc-dec ${esc(decisao)}">${AUDICAO_ESTADO_LBL[a.estado] || a.estado}</span>
          ${a.forma ? ` · ${FORMA_LBL[a.forma] || a.forma}` : ''}
        </div>
        ${a.sintese_posicao ? `<div class="pc-quote" style="margin-top:6px">${esc(a.sintese_posicao.slice(0, 220))}${a.sintese_posicao.length > 220 ? '…' : ''}</div>` : ''}
      </div>
      ${podeEditar ? `
        <div style="display:flex;gap:4px;align-items:flex-start">
          <button class="btn-icon" data-edit-aud="${a.id}" data-cat="${a.categoria}" title="Editar">✎</button>
          <button class="btn-icon" data-del-aud="${a.id}" title="Eliminar" style="color:var(--danger)">×</button>
        </div>
      ` : ''}
    </div>
  `;
}

function pcD3(f, podeEditar) {
  const lista = f.integra || [];
  const n = lista.length;
  return `
    <div class="pc-card wide" id="card-D3">
      <div class="pc-card-head">
        <div class="pc-letter d">D₃</div>
        <div>
          <div class="ttl">Interações INTEGRA (pré-processo)</div>
          <div class="sub">Contexto histórico — read-only</div>
        </div>
        <span class="count" style="margin-left:auto">${n}</span>
        ${podeEditar ? `<button class="more" id="btnImportIntegra">+ Importar JSON</button>` : ''}
      </div>
      <div class="pc-card-body">
        ${n === 0 ? '<div class="pc-empty">Sem interações INTEGRA ingeridas. Use "Importar JSON" para carregar o ficheiro exportado pela UnIT.</div>' :
          `<div class="pc-mini-sub" style="margin-bottom:8px">${n} ${n === 1 ? 'interação registada' : 'interações registadas'} no INTEGRA antes da entrada em processo legislativo.</div>
          ${lista.map(i => {
            let p = {}; try { p = typeof i.payload === 'string' ? JSON.parse(i.payload) : (i.payload || {}); } catch {}
            return `<div class="pc-mini">
              <div class="pc-mini-date">${fmtData(i.data_interacao) || '—'}</div>
              <div>
                <div class="pc-mini-ent">${esc(i.entidade || p.entidade || '—')}</div>
                <div class="pc-mini-sub">gabinete ${esc(i.gabinete_origem)}${p.objeto ? ' · ' + esc(p.objeto) : ''}</div>
                ${p.sintese ? `<div class="pc-quote" style="margin-top:6px">${esc(p.sintese.slice(0, 200))}${p.sintese.length > 200 ? '…' : ''}</div>` : ''}
              </div>
              <div></div>
            </div>`;
          }).join('')}`}
      </div>
    </div>
  `;
}

function pcE(f, podeEditar) {
  const len = (f.cl_sintese || '').length;
  const completo = !!f.cl_link && len >= 200;
  return `
    <div class="pc-card wide" id="card-E">
      <div class="pc-card-head">
        <div class="pc-letter">E</div>
        <div><div class="ttl">Consulta pública</div><div class="sub">Bloco E · ConsultaLex</div></div>
        ${completo ? '<span class="ok" style="margin-left:auto">✓ completo</span>' :
          (f.cl_link ? '<span class="warn" style="margin-left:auto">⚠ síntese curta</span>'
                     : '<span class="count" style="margin-left:auto">vazio</span>')}
        ${podeEditar ? `<button class="more" id="btnEditarBlocoE">Editar</button>` : ''}
      </div>
      <div class="pc-card-body">
        <div class="pc-kv">
          <div class="k">Link ConsultaLex</div>
          <div class="v ${!f.cl_link ? 'empty' : ''}">
            ${f.cl_link ? `<a href="${esc(f.cl_link)}" target="_blank" rel="noopener">${esc(f.cl_link)}</a>` : 'Por preencher'}
          </div>
          <div class="k">N.º contributos</div>
          <div class="v ${f.cl_n_contributos == null ? 'empty' : ''}">${f.cl_n_contributos ?? '—'}</div>
          <div class="k">Síntese e decisão</div>
          <div class="v ${!f.cl_sintese ? 'empty' : ''}" style="font-size:11.5px;line-height:1.55">${esc((f.cl_sintese || '').slice(0, 320))}${len > 320 ? '…' : ''}${!f.cl_sintese ? ' (mín. 200 c)' : ''}</div>
        </div>
      </div>
    </div>
  `;
}

function pcHistorico() {
  const eventos = state.eventos || [];
  if (eventos.length === 0) return '';
  return `
    <div class="pc-card wide">
      <div class="pc-card-head">
        <div class="pc-letter f">H</div>
        <div><div class="ttl">Histórico</div><div class="sub">Audit log da FPL</div></div>
        <span class="count" style="margin-left:auto">${eventos.length}</span>
      </div>
      <div class="pc-card-body">
        ${eventos.slice(0, 15).map(e => `
          <div class="pc-mini">
            <div class="pc-mini-date">${fmtDH(e.timestamp)}</div>
            <div>
              <div class="pc-mini-ent">${esc(traducaoTipoEvento(e.tipo))}</div>
              <div class="pc-mini-sub">${esc(e.autor_nome || '—')}</div>
            </div>
            <div></div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function traducaoTipoEvento(t) {
  const map = {
    FPL_CRIADA: 'FPL criada',
    BLOCO_B_ATUALIZADO: 'Bloco B atualizado',
    BLOCO_E_ATUALIZADO: 'Bloco E atualizado',
    AUDICAO_ADICIONADA: 'Audição adicionada',
    AUDICAO_ATUALIZADA: 'Audição atualizada',
    AUDICAO_ELIMINADA: 'Audição eliminada',
    INTEGRA_INGERIDO: 'INTEGRA ingerido',
    M0_VALIDADO: 'M0 · Abertura validada',
    M2_VALIDADO: 'M2 · Abertura CP',
    M3_VALIDADO: 'M3 · Encerramento CP',
    M4_VALIDADO: 'M4 · Pré-CM',
    M5_VALIDADO: 'M5 · Publicação',
    APROVADO_CM: 'Aprovado em CM',
    CORRECAO_PEDIDA: 'Correção pedida (SGGOV)',
  };
  return map[t] || t;
}

// ---------------------------------------------------------------------------
// Cronograma
// ---------------------------------------------------------------------------
function painelCronograma(f) {
  const marcos = MARCOS_ORD.map(id => ({
    id,
    lbl: MARCOS_LBL[id],
    em: f[`${id.toLowerCase()}_em`],
    por: f[`${id.toLowerCase()}_por`],
  }));
  return `
      <div class="painel-body" style="grid-template-columns:1fr">
        <div class="pc-card wide">
          <div class="pc-card-head">
            <div class="pc-letter">⏱</div>
            <div><div class="ttl">Cronograma de marcos</div><div class="sub">M0 → M5</div></div>
          </div>
          <div class="pc-card-body">
            <ol style="list-style:none;padding:0;margin:0">
              ${marcos.map(m => `
                <li style="display:grid;grid-template-columns:56px 1fr;gap:14px;padding:14px 0;border-bottom:1px solid var(--border-hair)">
                  <div style="width:48px;height:48px;border-radius:50%;background:${m.em ? 'var(--gov-blue)' : 'var(--border-hair)'};color:${m.em ? '#fff' : 'var(--text-faint)'};display:flex;align-items:center;justify-content:center;font-weight:700;font-family:var(--font-mono)">${m.em ? '✓' : m.id.replace('M', '')}</div>
                  <div>
                    <div style="font-size:14px;font-weight:600">${m.id} · ${esc(m.lbl)}</div>
                    <div class="pc-mini-sub">${m.em ? 'Validado ' + fmtDH(m.em) : 'Por validar'}</div>
                  </div>
                </li>
              `).join('')}
            </ol>
            ${f.referencia_dr ? `
              <div class="alert info" style="margin-top:14px">
                <div><span class="at">Publicação em DR</span>${esc(f.referencia_dr)}</div>
                ${f.hash_publicacao ? `<div style="margin-top:6px;font-family:var(--font-mono);font-size:10px;color:var(--text-muted);word-break:break-all">SHA-256: ${esc(f.hash_publicacao)}</div>` : ''}
              </div>` : ''}
          </div>
        </div>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Bindings
// ---------------------------------------------------------------------------
export function bindDetalhePainel() {
  // Toggle Detalhe ↔ Cronograma
  document.querySelectorAll('.painel-toggle [data-sub]').forEach(b => {
    b.addEventListener('click', () => {
      const sub = b.dataset.sub;
      try { sessionStorage.setItem('fpl.detailView.' + state.fpl.id, sub); } catch {}
      setView('detalhe', { fplId: state.fpl.id, sub });
    });
  });

  // Stepper — scroll para o card relacionado
  document.querySelectorAll('.painel-step[data-card-target]').forEach(step => {
    step.addEventListener('click', (e) => {
      if (e.target.closest('.cta')) return;
      const target = step.dataset.cardTarget;
      const el = document.getElementById(target);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.classList.add('highlight');
        setTimeout(() => el.classList.remove('highlight'), 1300);
      }
    });
  });

  // Validar marco (botão CTA no stepper)
  document.querySelectorAll('[data-validar-marco]').forEach(b => {
    b.addEventListener('click', async () => {
      const marco = b.dataset.validarMarco;
      try {
        const r = await api(`/fpl/${state.fpl.id}/marcos/${marco}/validar`, { method: 'POST', body: {} });
        if (r.ok) {
          toast(`${marco} validado`, 'success');
          setView('detalhe', { fplId: state.fpl.id });
        } else {
          mostrarPendencias(marco, r.pendencias);
        }
      } catch (err) {
        if (err.data?.pendencias) mostrarPendencias(marco, err.data.pendencias);
        else toast('Falha: ' + err.message, 'error');
      }
    });
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
    const ref = prompt('Referência do Diário da República (ex.: DR 1.ª série, n.º 123, 2026-06-15):');
    if (ref === null) return;
    try {
      await api(`/fpl/${state.fpl.id}/aprovar-cm`, { method: 'POST', body: { referencia_dr: ref || null } });
      toast('Aprovado em CM', 'success');
      setView('detalhe', { fplId: state.fpl.id });
    } catch (e) { toast('Falha: ' + e.message, 'error'); }
  });

  document.getElementById('btnEditarBlocoB')?.addEventListener('click', () => abrirEditorBlocoB());
  document.getElementById('btnEditarBlocoE')?.addEventListener('click', () => abrirEditorBlocoE());
  document.getElementById('btnImportIntegra')?.addEventListener('click', () => abrirImportarIntegra());

  document.querySelectorAll('[data-nova-aud]').forEach(b => {
    b.addEventListener('click', () => abrirNovaAudicao(b.dataset.novaAud));
  });
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
}

function mostrarPendencias(marco, pendencias) {
  const msg = (pendencias || []).map(p => '· ' + p.detalhe).join('\n');
  toast(`${marco} bloqueado:\n${msg}`, 'error');
}

// ---------------------------------------------------------------------------
// Editores inline
// ---------------------------------------------------------------------------
function abrirEditorBlocoB() {
  const f = state.fpl;
  abrirModalBack(`
    <h2 style="margin-bottom:14px">Editar Bloco B · Enquadramento</h2>
    <form>
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
        <textarea name="sintese_problema" rows="7">${esc(f.sintese_problema || '')}</textarea>
      </div>
      <div class="field"><label>Avaliação prévia de impacto</label>
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
  `, async (fd) => {
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
  abrirModalBack(`
    <h2 style="margin-bottom:14px">Editar Bloco E · Consulta pública</h2>
    <form>
      <div class="field"><label>Link ConsultaLex</label>
        <input type="url" name="cl_link" value="${esc(f.cl_link || '')}" placeholder="https://consulta.lex.pt/processos/...">
      </div>
      <div class="field"><label>N.º de contributos recebidos</label>
        <input type="number" name="cl_n_contributos" min="0" value="${f.cl_n_contributos ?? ''}">
      </div>
      <div class="field"><label>Síntese e decisão de incorporação (mín. 200 c)</label>
        <textarea name="cl_sintese" rows="9">${esc(f.cl_sintese || '')}</textarea>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" data-cancel>Cancelar</button>
        <button type="submit" class="btn primary">Guardar</button>
      </div>
    </form>
  `, async (fd) => {
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
  back.innerHTML = `<div class="modal lg" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(back);
  back.querySelector('[data-cancel]')?.addEventListener('click', () => back.remove());
  back.addEventListener('click', e => { if (e.target === back) back.remove(); });
  back.querySelector('form')?.addEventListener('submit', async e => {
    e.preventDefault();
    try { await onSubmit(new FormData(e.currentTarget)); back.remove(); }
    catch (err) { toast('Erro: ' + (err.message || ''), 'error'); }
  });
}
