// views/detalhe-painel.js — Vista de detalhe da FPL no estilo painel do
// design handoff: painel-head (breadcrumb + título + estado + stepper),
// painel-body em grelha 2-colunas com pc-cards por bloco.

import { api } from '../api.js';
import { state, isSggov, userOwns, gabSigla, gabNome } from '../state.js';
import { ESTADOS_LBL, TIPOS, ORIGEM_LBL, AUDICAO_ESTADO_LBL, FORMA_LBL, MARCOS_LBL } from '../constants.js';
import { esc, fmtData, fmtDH, toast, openModal, closeModal } from '../utils.js';
import { loadFpl } from '../data.js';
import { renderRoot } from '../render.js';
import { setView } from '../router.js';
import { abrirNovaAudicao, abrirImportarIntegra, eliminarAudicao } from '../wizard-audicoes.js';

const MARCOS_ORD = ['M0', 'M2', 'M3', 'M4', 'M5'];

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
export async function viewDetalhePainel() {
  if (!state.fplId) return '<div class="card-empty">FPL não selecionada.</div>';
  await loadFpl(state.fplId);
  const f = state.fpl;
  if (!f) return '<div class="card-empty">FPL não encontrada.</div>';

  const sub = sessionStorage.getItem('fpl.detailView.' + f.id) || 'detalhe';
  return painelHead(f, sub) + (sub === 'cronograma' ? painelCronograma(f) : painelDetalhe(f));
}

function proximoMarco(f) {
  if (!f.m0_em) return 'M0';
  if (f.estado === 'EM_RSE' && !f.m2_em) return 'M2';
  if (f.estado === 'EM_CONSULTA_PUBLICA' && !f.m3_em) return 'M3';
  if (f.estado === 'EM_CONSULTA_PUBLICA' && f.m3_em && !f.m4_em) return 'M4';
  if (f.estado === 'EM_CM') return 'APROVAR';
  if (f.estado === 'APROVADO' && !f.m5_em) return 'M5';
  return null;
}

// ---------------------------------------------------------------------------
// Cabeçalho
// ---------------------------------------------------------------------------
function painelHead(f, sub) {
  const podeEditar = userOwns(f) || isSggov();
  const podeAprovarCM = isSggov() && f.estado === 'EM_CM';
  const pm = proximoMarco(f);
  const est = ESTADOS_LBL[f.estado] || { lbl: f.estado, cls: 'criado' };
  const nAud = (f.audicoes || []).length;
  const nIntegra = (f.integra || []).length;

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
          <button onclick="setView('lista')">FPL</button> / <span class="mono">${esc(f.numero_processo)}</span>
        </div>
        <div class="painel-title-row">
          <h1 class="painel-title">${esc(f.titulo)}</h1>
          <span class="painel-estado s-${esc(est.cls)}">● ${esc(est.lbl)}</span>
        </div>
        <div class="painel-meta">
          <span class="pill-tag">${esc(TIPOS[f.tipo_diploma] || f.tipo_diploma)}</span>
          <span class="pill-tag">${esc(gabSigla(f.gabinete_id))}</span>
          <span>Versão v${f.versao_atual || 1}</span>
          <span class="sep">·</span>
          <span>Criada ${fmtData(f.data_criacao)}</span>
          <span class="sep">·</span>
          <span>${nAud} ${nAud === 1 ? 'audição' : 'audições'}</span>
          ${nIntegra ? `<span class="sep">·</span><span>${nIntegra} INTEGRA</span>` : ''}

          <div class="spacer"></div>

          ${podeAprovarCM ? `<button class="btn sm primary" id="btnAprovarCM">Marcar aprovado em CM</button>` : ''}
          ${f.estado === 'PUBLICADO' ? `<a class="btn sm" href="/api/fpl/${f.id}/ficha-publica" target="_blank" rel="noopener">Ver ficha pública</a>` : ''}
          ${podeEditar ? `<button class="btn sm ghost" id="btnExportCanon">↓ JSON canónico</button>` : ''}

          <div class="painel-toggle" role="tablist" aria-label="Vista da FPL">
            <button data-sub="detalhe"    role="tab" aria-selected="${sub === 'detalhe'}">Detalhe</button>
            <button data-sub="cronograma" role="tab" aria-selected="${sub === 'cronograma'}">Cronograma</button>
          </div>
        </div>
        <div class="painel-stepper" style="grid-template-columns:repeat(5,1fr)">
          ${marcos.map(m => `
            <div class="painel-step ${m.estado}" data-card-target="${cardDoMarco(m.id)}" role="button" tabindex="0"
                 aria-label="${m.id} ${m.lbl}">
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
// Body Detalhe
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
        <span class="ok">✓ completo</span>
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
        ${completo ? '<span class="ok">✓ completo</span>' :
                     `<span class="warn">⚠ ${len < 200 ? 'síntese curta' : 'origem em falta'}</span>`}
        ${podeEditar ? `<button class="more" id="btnEditarBlocoB">Editar</button>` : ''}
      </div>
      <div class="pc-card-body">
        <div class="pc-kv">
          <div class="k">Origem</div><div class="v ${!f.tipo_origem ? 'empty' : ''}">${ORIGEM_LBL[f.tipo_origem] || 'Por preencher'}</div>
          <div class="k">Referência</div><div class="v ${!f.referencia_origem ? 'empty' : ''}">${esc(f.referencia_origem || '—')}</div>
          <div class="k">Aval. impacto</div><div class="v">${f.avaliacao_previa === 1 ? '✓ Sim' : f.avaliacao_previa === 0 ? 'Não' : '<span class="empty">Não indicada</span>'}</div>
          <div class="k">Síntese</div><div class="v ${!f.sintese_problema ? 'empty' : ''}">${esc((f.sintese_problema || '').slice(0, 280))}${len > 280 ? '…' : ''}${!f.sintese_problema ? ' (mín. 200 c)' : ''}</div>
        </div>
      </div>
    </div>
  `;
}

function pcD1(f, podeEditar) {
  const lista = (f.audicoes || []).filter(a => a.categoria === 'OBRIGATORIA');
  return audicoesCard(lista, podeEditar, 'D₁', 'card-D1',
    'Audições obrigatórias', 'Exigidas por lei para este diploma', 'OBRIGATORIA');
}

function pcD2(f, podeEditar) {
  const lista = (f.audicoes || []).filter(a => a.categoria === 'GSEPCM');
  return audicoesCard(lista, podeEditar, 'D₂', 'card-D2',
    'Audições do GSEPCM', 'Discricionárias durante o processo', 'GSEPCM');
}

function audicoesCard(lista, podeEditar, letra, id, ttl, sub, categoria) {
  const n = lista.length;
  const pendentes = lista.filter(a => a.estado === 'RESPONDEU' && !a.decisao_incorporacao).length;
  const badge = n === 0 ? '<span class="count">vazio</span>'
              : pendentes > 0 ? `<span class="warn">⚠ ${pendentes} sem decisão</span>`
              : `<span class="count">${n}</span>`;
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
          <span class="pc-dec ${esc(decisao.replace(/[^A-Z_]/g, ''))}">${AUDICAO_ESTADO_LBL[a.estado] || a.estado}</span>
          ${a.forma ? ` · ${FORMA_LBL[a.forma] || a.forma}` : ''}
        </div>
        ${a.sintese_posicao ? `<div class="pc-quote">${esc(a.sintese_posicao.slice(0, 220))}${a.sintese_posicao.length > 220 ? '…' : ''}</div>` : ''}
      </div>
      ${podeEditar ? `
        <div class="flex gap-8">
          <button class="btn-icon" data-edit-aud="${a.id}" data-cat="${a.categoria}" title="Editar">✎</button>
          <button class="btn-icon" data-del-aud="${a.id}" title="Eliminar">✕</button>
        </div>
      ` : '<div></div>'}
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
        <span class="count">${n}</span>
        ${podeEditar ? `<button class="more" id="btnImportIntegra">+ Importar JSON</button>` : ''}
      </div>
      <div class="pc-card-body">
        ${n === 0 ? '<div class="pc-empty">Sem interações INTEGRA ingeridas. Em produção, são lidas automaticamente da pasta OneDrive da UnIT.</div>' :
          `<div class="pc-mini-sub mb-12">${n} ${n === 1 ? 'interação registada' : 'interações registadas'} no INTEGRA antes da entrada em processo legislativo.</div>
          ${lista.map(i => {
            let p = {}; try { p = typeof i.payload === 'string' ? JSON.parse(i.payload) : (i.payload || {}); } catch {}
            return `<div class="pc-mini">
              <div class="pc-mini-date">${fmtData(i.data_interacao) || '—'}</div>
              <div>
                <div class="pc-mini-ent">${esc(i.entidade || p.entidade || '—')}</div>
                <div class="pc-mini-sub">gabinete ${esc(i.gabinete_origem)}${p.objeto ? ' · ' + esc(p.objeto) : ''}</div>
                ${p.sintese ? `<div class="pc-quote">${esc(p.sintese.slice(0, 200))}${p.sintese.length > 200 ? '…' : ''}</div>` : ''}
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
        ${completo ? '<span class="ok">✓ completo</span>' :
          (f.cl_link ? '<span class="warn">⚠ síntese curta</span>'
                     : '<span class="count">vazio</span>')}
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
          <div class="k">Síntese</div>
          <div class="v ${!f.cl_sintese ? 'empty' : ''}">${esc((f.cl_sintese || '').slice(0, 320))}${len > 320 ? '…' : ''}${!f.cl_sintese ? ' (mín. 200 c)' : ''}</div>
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
        <span class="count">${eventos.length}</span>
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
  };
  return map[t] || t;
}

// ---------------------------------------------------------------------------
// Cronograma — calendário mensal + lista lateral de agenda consolidada
// ---------------------------------------------------------------------------
// Estado local da vista: offset de mês relativo ao actual.
let _cronoOffset = 0;
// Cache de agenda consolidada (carrega assincronamente quando se entra na vista).
let _agendaCache = { ts: 0, eventos: [] };

const MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
                  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS_PT = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];

function eventosDaFpl(f) {
  // Constrói eventos para esta FPL, indexáveis por data 'YYYY-MM-DD'
  const ev = [];
  const ref = { fpl_id: f.id, numero: f.numero_processo };
  for (const id of MARCOS_ORD) {
    const lo = id.toLowerCase();
    const real = f[`${lo}_em`];
    const prev = f[`${lo}_prevista`];
    if (real) ev.push({ ...ref, kind: id, tipo: 'real', data: real.slice(0, 10), titulo_ev: `${id} · ${MARCOS_LBL[id]}` });
    if (prev && !real) ev.push({ ...ref, kind: id, tipo: 'prev', data: prev, titulo_ev: `${id} · ${MARCOS_LBL[id]} (prev.)` });
  }
  if (f.cl_inicio) ev.push({ ...ref, kind: 'CP', tipo: 'periodo', data: f.cl_inicio, titulo_ev: 'Abre CP' });
  if (f.cl_fim) ev.push({ ...ref, kind: 'CP', tipo: 'periodo', data: f.cl_fim, titulo_ev: 'Encerra CP' });
  for (const a of (f.audicoes || [])) {
    if (a.data_pedido) ev.push({ ...ref, kind: 'INTER', tipo: 'audicao', data: a.data_pedido, titulo_ev: `Audição · ${a.entidade}` });
    if (a.data_resposta && a.data_resposta !== a.data_pedido) ev.push({ ...ref, kind: 'INTER', tipo: 'audicao', data: a.data_resposta, titulo_ev: `Resposta · ${a.entidade}` });
  }
  return ev;
}

function buildCalendarGrid(year, month, eventos) {
  // month 0-11. Devolve array de células (6 semanas × 7 dias = 42)
  // com flags { day, ym, dim, today, eventos:[] }
  const first = new Date(year, month, 1);
  // Semana começa Segunda (ISO). getDay: 0=dom..6=sab → offset:
  const dowSeg = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - dowSeg);
  const today = todayISO();
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const ym = isoDate(d);
    cells.push({
      day: d.getDate(),
      ym,
      dim: d.getMonth() !== month,
      today: ym === today,
      eventos: eventos.filter(e => e.data === ym),
    });
  }
  return cells;
}

// Helpers de data evitando timezone shifts
function todayISO() {
  const d = new Date();
  return isoDate(d);
}
function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function painelCronograma(f) {
  const podeEditar = userOwns(f) || isSggov();
  const now = new Date();
  now.setMonth(now.getMonth() + _cronoOffset);
  const year = now.getFullYear();
  const month = now.getMonth();
  const eventos = eventosDaFpl(f);
  const cells = buildCalendarGrid(year, month, eventos);
  const monthLabel = MESES_PT[month] + ' ' + year;

  // Lista lateral: agenda consolidada (carregada async via /api/agenda)
  // Por agora mostra os eventos da FPL actual + placeholder para os consolidados
  const proximos = _agendaCache.eventos.filter(e => e.data && e.data >= todayISO()).slice(0, 30);

  return `
      <div class="crono-wrap">
        <div class="crono-cal">
          <div class="crono-toolbar">
            <div class="crono-nav">
              <button id="cronoPrev" title="Mês anterior">‹</button>
              <button id="cronoHoje" title="Hoje" style="width:auto;padding:0 10px;font-size:11px;font-weight:600">Hoje</button>
              <button id="cronoNext" title="Mês seguinte">›</button>
            </div>
            <div class="crono-month">${esc(monthLabel)}</div>
            <div class="crono-legend">
              <span><i style="background:var(--p-blue)"></i>Marcos</span>
              <span><i style="background:var(--p-gold)"></i>Previstos</span>
              <span><i style="background:var(--p-success)"></i>Publicação</span>
              <span><i style="background:var(--p-red)"></i>CM/RSE</span>
              <span><i style="background:var(--p-text-mute)"></i>CP</span>
              <span><i style="background:var(--p-text-faint)"></i>Interações</span>
            </div>
            ${podeEditar ? `<button class="btn sm" id="btnEditarDatas" style="margin-left:8px">✎ Editar datas</button>` : ''}
          </div>
          <div class="crono-weekhead">
            ${DIAS_PT.map(d => `<div>${d}</div>`).join('')}
          </div>
          <div class="crono-grid">
            ${cells.map(c => `
              <div class="crono-cell ${c.dim ? 'dim' : ''} ${c.today ? 'today' : ''}">
                <div class="crono-num">${c.day}</div>
                ${c.eventos.slice(0, 4).map(ev => {
                  const tipo = ev.tipo === 'prev' ? ' (prev.)' : '';
                  return `<div class="crono-ev k-${esc(ev.kind)}" title="${esc(ev.titulo_ev)}${tipo}">${esc(ev.titulo_ev)}</div>`;
                }).join('')}
                ${c.eventos.length > 4 ? `<div class="crono-num" style="text-align:left;color:var(--p-gold)">+${c.eventos.length - 4}</div>` : ''}
              </div>
            `).join('')}
          </div>
        </div>

        <div class="crono-side">
          <div class="crono-side-hdr">Agenda consolidada</div>
          ${proximos.length === 0 ? `
            <div class="pc-empty">
              ${_agendaCache.ts === 0 ? 'A carregar agenda...' : 'Sem próximos prazos.'}
            </div>
          ` : proximos.map(ev => {
            const d = new Date(ev.data + 'T12:00:00');
            const mes = MESES_PT[d.getMonth()].slice(0, 3).toUpperCase();
            const dia = String(d.getDate()).padStart(2, '0');
            const corClasse = ev.kind === 'M5' || ev.kind === 'DR' ? 'k-M5' :
                              ev.kind === 'M3' || ev.kind === 'M4' ? 'k-M4' :
                              ev.kind === 'CP' ? 'k-CP' : 'k-M0';
            return `<div class="up-row">
              <div class="up-date" style="background:${corDoKind(ev.kind)}">
                <div class="up-month">${mes}</div>
                <div class="up-day">${dia}</div>
              </div>
              <div>
                <div class="up-title">${esc(ev.titulo_ev)}</div>
                <div class="up-sub">
                  <span class="up-tag ${corClasse}">${esc(ev.kind)}</span>
                  <a onclick="setView('detalhe',{fplId:'${ev.fpl_id}'})" style="cursor:pointer">${esc(ev.numero)}</a>
                  ${ev.fpl_id === f.id ? '<strong> · esta FPL</strong>' : ''}
                </div>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>
  `;
}

function corDoKind(k) {
  if (k === 'M5' || k === 'DR') return 'var(--p-success)';
  if (k === 'M3' || k === 'M4') return 'var(--p-gold)';
  if (k === 'RSE' || k === 'CM') return 'var(--p-red)';
  if (k === 'CP') return 'var(--p-text-mute)';
  if (k === 'INTER') return 'var(--p-text-faint)';
  return 'var(--p-blue)';
}

// ---------------------------------------------------------------------------
// Bindings
// ---------------------------------------------------------------------------
export function bindDetalhePainel() {
  document.querySelectorAll('.painel-toggle [data-sub]').forEach(b => {
    b.addEventListener('click', () => {
      const sub = b.dataset.sub;
      try { sessionStorage.setItem('fpl.detailView.' + state.fpl.id, sub); } catch {}
      setView('detalhe', { fplId: state.fpl.id, sub });
    });
  });

  document.querySelectorAll('.painel-step[data-card-target]').forEach(step => {
    step.addEventListener('click', (e) => {
      if (e.target.closest('.cta')) return;
      const el = document.getElementById(step.dataset.cardTarget);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.classList.add('highlight');
        setTimeout(() => el.classList.remove('highlight'), 1300);
      }
    });
  });

  // Cronograma — navegação mensal
  document.getElementById('cronoPrev')?.addEventListener('click', () => {
    _cronoOffset -= 1;
    renderRoot();
  });
  document.getElementById('cronoNext')?.addEventListener('click', () => {
    _cronoOffset += 1;
    renderRoot();
  });
  document.getElementById('cronoHoje')?.addEventListener('click', () => {
    _cronoOffset = 0;
    renderRoot();
  });
  document.getElementById('btnEditarDatas')?.addEventListener('click', () => abrirEditorDatas());

  // Carregar agenda consolidada apenas quando estamos na vista de cronograma
  if (document.querySelector('.crono-wrap')) {
    carregarAgenda();
  }

  document.querySelectorAll('[data-validar-marco]').forEach(b => {
    b.addEventListener('click', async () => {
      const marco = b.dataset.validarMarco;
      try {
        const r = await api(`/fpl/${state.fpl.id}/marcos/${marco}/validar`, { method: 'POST', body: {} });
        if (r.ok) {
          toast(`${marco} validado`, 'success');
          await loadFpl(state.fpl.id);
          renderRoot();
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

  document.getElementById('btnAprovarCM')?.addEventListener('click', () => abrirModalAprovarCM());
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
  const lista = (pendencias || []).map(p => `<li>${esc(p.detalhe)}</li>`).join('');
  openModal(`
    <div class="modal-head">
      <div>
        <h3>${marco} bloqueado</h3>
        <div class="modal-subtitle">Pendências a resolver antes de validar</div>
      </div>
      <button class="btn-icon" onclick="closeModal()" aria-label="Fechar">✕</button>
    </div>
    <div class="modal-body">
      <div class="alert warning">
        <div>
          <span class="at">${pendencias?.length || 0} pendência(s)</span>
          <ul class="mt-12" style="margin-left:18px">${lista}</ul>
        </div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn primary" onclick="closeModal()">Entendido</button>
    </div>
  `);
}

async function carregarAgenda() {
  try {
    const r = await api('/agenda');
    _agendaCache = { ts: Date.now(), eventos: r.eventos || [] };
    // Re-renderizar apenas se ainda estamos na vista cronograma
    if (document.querySelector('.crono-wrap')) renderRoot();
  } catch (e) {
    _agendaCache = { ts: Date.now(), eventos: [] };
  }
}

// ---------------------------------------------------------------------------
// Editores em modal
// ---------------------------------------------------------------------------
function bindFormSubmit(onSubmit) {
  const form = document.querySelector('.modal-overlay form');
  if (!form) return;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    if (btn) btn.disabled = true;
    try { await onSubmit(new FormData(form)); closeModal(); }
    catch (err) { toast('Erro: ' + (err.message || ''), 'error'); if (btn) btn.disabled = false; }
  });
}

function abrirEditorBlocoB() {
  const f = state.fpl;
  openModal(`
    <div class="modal-head">
      <div>
        <h3>Editar Bloco B</h3>
        <div class="modal-subtitle">Enquadramento · Origem e síntese do problema</div>
      </div>
      <button class="btn-icon" onclick="closeModal()" aria-label="Fechar">✕</button>
    </div>
    <form id="formB">
      <div class="modal-body">
        <div class="field-grid">
          <div class="field"><label>Tipo de origem</label>
            <select name="tipo_origem">
              <option value="">—</option>
              ${Object.entries(ORIGEM_LBL).map(([k, v]) => `<option value="${k}" ${f.tipo_origem === k ? 'selected' : ''}>${v}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Referência da origem</label>
            <input type="text" name="referencia_origem" value="${esc(f.referencia_origem || '')}" placeholder="Ex.: Diretiva (UE) 2024/884">
          </div>
        </div>
        <div class="field"><label>Síntese do problema</label>
          <textarea name="sintese_problema" rows="7" placeholder="Descreva o problema e a solução proposta...">${esc(f.sintese_problema || '')}</textarea>
          <div class="help">Mínimo 200 caracteres para validar M0.</div>
        </div>
        <div class="field"><label>Avaliação prévia de impacto</label>
          <select name="avaliacao_previa">
            <option value="">Não indicada</option>
            <option value="1" ${f.avaliacao_previa === 1 ? 'selected' : ''}>Sim</option>
            <option value="0" ${f.avaliacao_previa === 0 ? 'selected' : ''}>Não</option>
          </select>
        </div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn ghost" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn primary">Guardar alterações</button>
      </div>
    </form>
  `);
  bindFormSubmit(async (fd) => {
    const body = {
      tipo_origem: fd.get('tipo_origem') || null,
      referencia_origem: fd.get('referencia_origem') || null,
      sintese_problema: fd.get('sintese_problema') || null,
      avaliacao_previa: fd.get('avaliacao_previa') === '' ? null : parseInt(fd.get('avaliacao_previa'), 10),
    };
    await api(`/fpl/${f.id}/bloco-b`, { method: 'PATCH', body });
    toast('Bloco B atualizado', 'success');
    await loadFpl(f.id);
    renderRoot();
  });
}

function abrirEditorBlocoE() {
  const f = state.fpl;
  openModal(`
    <div class="modal-head">
      <div>
        <h3>Editar Bloco E</h3>
        <div class="modal-subtitle">Consulta pública · ConsultaLex</div>
      </div>
      <button class="btn-icon" onclick="closeModal()" aria-label="Fechar">✕</button>
    </div>
    <form id="formE">
      <div class="modal-body">
        <div class="field"><label>Link ConsultaLex</label>
          <input type="url" name="cl_link" value="${esc(f.cl_link || '')}" placeholder="https://consulta.lex.pt/processos/...">
          <div class="help">URL público da consulta na ConsultaLex.</div>
        </div>
        <div class="field"><label>N.º de contributos recebidos</label>
          <input type="number" name="cl_n_contributos" min="0" value="${f.cl_n_contributos ?? ''}">
        </div>
        <div class="field"><label>Síntese e decisão sobre incorporação</label>
          <textarea name="cl_sintese" rows="9" placeholder="O que disseram os contributos? O que foi incorporado? O que não foi e porquê?">${esc(f.cl_sintese || '')}</textarea>
          <div class="help">Mínimo 200 caracteres. Texto humano — é o que o cidadão vai ler.</div>
        </div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn ghost" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn primary">Guardar alterações</button>
      </div>
    </form>
  `);
  bindFormSubmit(async (fd) => {
    const n = fd.get('cl_n_contributos');
    const body = {
      cl_link: fd.get('cl_link') || null,
      cl_n_contributos: n === '' ? null : parseInt(n, 10),
      cl_sintese: fd.get('cl_sintese') || null,
    };
    await api(`/fpl/${f.id}/bloco-e`, { method: 'PATCH', body });
    toast('Bloco E atualizado', 'success');
    await loadFpl(f.id);
    renderRoot();
  });
}

function abrirModalAprovarCM() {
  const f = state.fpl;
  openModal(`
    <div class="modal-head">
      <div>
        <h3>Marcar FPL como aprovada em CM</h3>
        <div class="modal-subtitle">Após esta acção, a FPL transita para "Aprovado" e fica pronta para M5</div>
      </div>
      <button class="btn-icon" onclick="closeModal()" aria-label="Fechar">✕</button>
    </div>
    <form id="formCM">
      <div class="modal-body">
        <div class="field"><label>Referência do Diário da República (opcional, mas obrigatória para M5)</label>
          <input type="text" name="referencia_dr" placeholder="Ex.: DR 1.ª série, n.º 123, 2026-06-15">
          <div class="help">Pode preencher agora ou mais tarde, antes de validar M5.</div>
        </div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn ghost" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn primary">Confirmar aprovação</button>
      </div>
    </form>
  `);
  bindFormSubmit(async (fd) => {
    await api(`/fpl/${f.id}/aprovar-cm`, { method: 'POST', body: { referencia_dr: fd.get('referencia_dr') || null } });
    toast('FPL aprovada em CM', 'success');
    await loadFpl(f.id);
    renderRoot();
  });
}

function abrirEditorDatas() {
  const f = state.fpl;
  const dateInput = (name, lbl, valor, help) => `
    <div class="field">
      <label>${esc(lbl)}</label>
      <input type="date" name="${name}" value="${esc(valor || '')}">
      ${help ? `<div class="help">${esc(help)}</div>` : ''}
    </div>
  `;
  openModal(`
    <div class="modal-head">
      <div>
        <h3>Editar datas do cronograma</h3>
        <div class="modal-subtitle">Datas previstas dos marcos + período da Consulta Pública</div>
      </div>
      <button class="btn-icon" onclick="closeModal()" aria-label="Fechar">✕</button>
    </div>
    <form id="formDatas">
      <div class="modal-body">
        <div class="alert info">
          <div>
            <span class="at">Como funcionam estas datas</span>
            As datas previstas dos marcos M0–M5 servem para planeamento — aparecem
            no calendário a dourado e só são substituídas pelas datas reais quando
            o marco é validado. O período da CP aparece como evento no calendário.
          </div>
        </div>

        <h4 style="font-family:var(--sans);font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--ink-3);margin:18px 0 8px">Marcos previstos</h4>
        <div class="field-grid">
          ${dateInput('m0_prevista', 'M0 · Abertura', f.m0_prevista, f.m0_em ? '✓ já validado a ' + (f.m0_em || '').slice(0, 10) : '')}
          ${dateInput('m2_prevista', 'M2 · Abertura CP', f.m2_prevista, f.m2_em ? '✓ já validado a ' + (f.m2_em || '').slice(0, 10) : '')}
          ${dateInput('m3_prevista', 'M3 · Encerramento CP', f.m3_prevista, f.m3_em ? '✓ já validado a ' + (f.m3_em || '').slice(0, 10) : '')}
          ${dateInput('m4_prevista', 'M4 · Pré-CM', f.m4_prevista, f.m4_em ? '✓ já validado a ' + (f.m4_em || '').slice(0, 10) : '')}
          ${dateInput('m5_prevista', 'M5 · Publicação', f.m5_prevista, f.m5_em ? '✓ já validado a ' + (f.m5_em || '').slice(0, 10) : '')}
        </div>

        <h4 style="font-family:var(--sans);font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--ink-3);margin:18px 0 8px">Período da Consulta Pública</h4>
        <div class="field-grid">
          ${dateInput('cl_inicio', 'Início CP', f.cl_inicio)}
          ${dateInput('cl_fim', 'Fim CP', f.cl_fim)}
        </div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn ghost" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn primary">Guardar datas</button>
      </div>
    </form>
  `);
  bindFormSubmit(async (fd) => {
    const body = {};
    for (const k of ['m0_prevista', 'm2_prevista', 'm3_prevista', 'm4_prevista', 'm5_prevista', 'cl_inicio', 'cl_fim']) {
      body[k] = fd.get(k) || null;
    }
    await api(`/fpl/${f.id}/datas`, { method: 'PATCH', body });
    toast('Datas atualizadas', 'success');
    // Reset cache de agenda para refletir as novas datas
    _agendaCache = { ts: 0, eventos: [] };
    await loadFpl(f.id);
    renderRoot();
  });
}
