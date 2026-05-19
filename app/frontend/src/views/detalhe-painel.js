// views/detalhe-painel.js — Vista de detalhe da FPL no modelo "painel".
//
// Substitui a vista de tabs (detalhe.js) pelo design do handoff
// `brainstorming/design_handoff_fpl_painel/`. Duas vistas alternam dentro
// do mesmo chrome (sidebar, cabeçalho, stepper):
//   • Detalhe   — grelha 2 colunas com cards A, B, D (full), C, E, ⚿, F
//   • Cronograma — calendário mensal + painel lateral de prazos críticos
//
// O toggle vive na meta-row do cabeçalho; preserva contexto da FPL.
// A view ativa é persistida em sessionStorage por FPL.

import { api, uploadFile } from '../api.js';
import { state, gabNome, gabSigla, isQa, userOwns } from '../state.js';
import { TIPOS, ORIGEM_LBL, NATUREZA_LBL, FORMA_LBL, DECISAO_LBL, MARCO_BLOQUEANTE, MARCO_PRECISA_DECLARACAO, ESTADOS_LBL } from '../constants.js';
import { esc, fmtData, fmtDH, openModal, closeModal, toast } from '../utils.js';
import { loadFpl, loadGabinetes } from '../data.js';
import { setView } from '../router.js';
import { renderRoot } from '../render.js';
import { ico } from '../icons.js';
import './../wizard-bloco-d.js';
import './../diff-viewer.js';

// ---------- Sessão: preserva vista escolhida por FPL ----------
function vistaAtual() {
  const k = 'fpl.detailView.' + (state.fplId || '');
  return sessionStorage.getItem(k) || 'detalhe';
}
function setVistaAtual(v) {
  sessionStorage.setItem('fpl.detailView.' + state.fplId, v);
}

// Mapeamento marco → card de destino para o stepper navegável.
// Click num step sem CTA "Validar" faz scrollIntoView no card respetivo.
const CARD_DO_MARCO = {
  M0: 'card-a',   // Identificação
  M1: 'card-e',   // Consulta pública
  M2: 'card-e',
  M3: 'card-d',   // Interações externas (núcleo da pegada)
  M4: 'card-cmp', // Comprovativos
  M5: 'card-cmp',
};

// ---------- Entry point ----------
export async function viewDetalhePainel() {
  if (!state.fplId) return '<div class="card-empty">FPL não selecionada</div>';
  await loadFpl(state.fplId);
  await loadGabinetes();
  const vista = vistaAtual();
  const f = state.fpl;

  return renderHeader(f, vista) + (vista === 'cronograma' ? renderCronograma(f) : renderDetalhe(f));
}

// ---------- Header (breadcrumb + título + meta + toggle + stepper) ----------
function renderHeader(f, vista) {
  const marcos = [
    { id: 'M0', label: 'Abertura',     data: f.m0_validado_em, bloq: true  },
    { id: 'M1', label: 'Pré-CP',       data: f.m1_validado_em, bloq: false },
    { id: 'M2', label: 'Pós-CP',       data: f.m2_validado_em, bloq: false },
    { id: 'M3', label: 'Pré-RSE',      data: f.m3_validado_em, bloq: true  },
    { id: 'M4', label: 'Pré-CM',       data: f.m4_validado_em, bloq: true  },
    { id: 'M5', label: 'Publicação',   data: f.m5_validado_em, bloq: true  },
  ];
  // O "current" é o primeiro sem data
  let currentIdx = marcos.findIndex(m => !m.data);
  marcos.forEach((m, i) => {
    m.estado = m.data ? 'done' : (i === currentIdx ? 'current' : 'todo');
  });

  const estLbl = ESTADOS_LBL[f.estado_workflow] || { lbl: f.estado_workflow, cls: 'criado' };
  const versoesTotal = state.versoes?.length || 1;
  const versaoAtual = f.versao_atual || versoesTotal;
  const nInter = (f.bloco_d || []).length;
  const nAnexos = (state.anexos || []).length;

  return `
    <div class="painel-head">
      <div class="painel-bcrumb"><a id="bcVoltar">FPL</a> / ${esc(f.numero_processo)}</div>
      <div class="painel-title-row">
        <h1 class="painel-title">${esc(f.titulo)}</h1>
        <span class="painel-estado s-${esc(estLbl.cls)}">● ${esc(estLbl.lbl)}</span>
      </div>
      <div class="painel-meta">
        <span class="pill-tag">${esc(TIPOS[f.tipo_diploma] || f.tipo_diploma)}</span>
        <span class="pill-tag">${esc(gabSigla(f.gabinete_id))}</span>
        <span>Versão v${versaoAtual} · ${versoesTotal} versões</span>
        <span class="sep">·</span>
        <span>Aberto ${fmtData(f.m0_validado_em) || fmtData(f.data_criacao)}</span>
        <span class="sep">·</span>
        <span>${nInter} interaç${nInter === 1 ? 'ão' : 'ões'}</span>
        <span class="sep">·</span>
        <span>${nAnexos} anexo${nAnexos === 1 ? '' : 's'}</span>

        <div class="painel-toggle" role="tablist" aria-label="Vista da FPL">
          <button data-vista="detalhe"  role="tab" aria-selected="${vista === 'detalhe'}"><span class="ico" aria-hidden="true">${ico('dashboard', { size: 13 })}</span> Detalhe</button>
          <button data-vista="cronograma" role="tab" aria-selected="${vista === 'cronograma'}"><span class="ico" aria-hidden="true">${ico('calendar', { size: 13 })}</span> Cronograma</button>
        </div>
      </div>
      <div class="painel-stepper">
        ${marcos.map(m => `
          <div class="painel-step ${m.estado}" data-marco="${m.id}" data-card-target="${CARD_DO_MARCO[m.id] || ''}" role="button" tabindex="0" aria-label="${m.id} ${m.label} — ir para a secção">
            <div class="dot">${m.estado === 'done' ? '✓' : m.id.replace('M', '')}</div>
            <div>
              <div class="lbl">${m.id} · ${m.label}${m.bloq ? '<span class="bloq" aria-hidden="true">bloq.</span>' : ''}</div>
              <div class="sub">${m.data ? fmtData(m.data) : (m.estado === 'current' ? 'a validar agora' : '—')}</div>
              ${m.estado === 'current' ? `<button class="cta" data-validar="${m.id}">Validar ${m.id}</button>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════════════════
// VISTA: DETALHE (grelha 2 colunas)
// ═══════════════════════════════════════════════════════════════════════════
function renderDetalhe(f) {
  return `<div class="painel-body">
    ${cardA(f)}
    ${cardB(f)}
    ${cardD(f)}
    ${cardC(f)}
    ${cardE(f)}
    ${cardComprovativos(f)}
    ${cardF(f)}
    ${cardAnexos(f)}
    ${(state.auditorias || []).length > 0 ? cardG(f) : ''}
  </div>`;
}

function cardA(f) {
  return `<div class="pc-card" id="card-a">
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
        <div class="k">Criação</div><div class="v">${fmtData(f.data_criacao)}</div>
      </div>
    </div>
  </div>`;
}

function cardB(f) {
  const sintLen = f.sintese_problema?.length || 0;
  const completo = sintLen >= 200 && !!f.tipo_origem;
  return `<div class="pc-card" id="card-b">
    <div class="pc-card-head">
      <div class="pc-letter">B</div>
      <div><div class="ttl">Origem e motivação</div><div class="sub">Bloco B</div></div>
      ${completo ? '<span class="ok">✓ completo</span>'
        : `<span class="warn">⚠ ${sintLen < 200 ? 'síntese curta' : 'origem em falta'}</span>`}
      ${userOwns(f) ? `<button class="pc-more" id="editBlocoB">Editar</button>` : ''}
    </div>
    <div class="pc-card-body">
      <div class="pc-kv">
        <div class="k">Origem</div><div class="v ${!f.tipo_origem ? 'empty' : ''}">${esc(ORIGEM_LBL[f.tipo_origem] || f.tipo_origem || 'Por preencher')}</div>
        <div class="k">Referência</div><div class="v ${!f.referencia_origem ? 'empty' : ''}">${esc(f.referencia_origem) || 'Não aplicável'}</div>
        <div class="k">Aval. impacto</div><div class="v">${f.avaliacao_previa === 1 ? '✓ Sim' : (f.avaliacao_previa === 0 ? 'Não' : '<span class="empty">Não indicada</span>')}</div>
        <div class="k">Síntese</div><div class="v ${!f.sintese_problema ? 'empty' : ''}" style="font-size:11.5px;line-height:1.5">${esc((f.sintese_problema || '').slice(0, 240)) || 'Por preencher (mínimo 200 caracteres)'}${sintLen > 240 ? '…' : ''}</div>
      </div>
    </div>
  </div>`;
}

function cardD(f) {
  const entradas = f.bloco_d || [];
  const total = entradas.length;
  const counts = entradas.reduce((acc, e) => {
    if (e.decisao_incorporacao === 'INCORPORADA') acc.inc++;
    else if (e.decisao_incorporacao === 'PARCIALMENTE_INCORPORADA') acc.par++;
    else if (e.decisao_incorporacao === 'NAO_INCORPORADA') acc.nao++;
    else if (e.decisao_incorporacao === 'SEM_OBJETO') acc.sem++;
    else acc.pend++;
    return acc;
  }, { inc: 0, par: 0, nao: 0, sem: 0, pend: 0 });

  const visiveis = entradas.slice(0, 5);
  const restantes = Math.max(0, total - visiveis.length);

  return `<div class="pc-card wide" id="card-d">
    <div class="pc-card-head">
      <div class="pc-letter d">D</div>
      <div>
        <div class="ttl">Interações externas — núcleo da pegada</div>
        <div class="sub">Bloco D · Lei n.º 5-A/2026 art.º 4.º</div>
      </div>
      ${counts.pend > 0 ? `<span class="warn">⚠ ${counts.pend} decisão pendente${counts.pend > 1 ? 's' : ''}</span>` : ''}
      <span class="count">${total} entrada${total === 1 ? '' : 's'}</span>
      ${userOwns(f) ? `<button class="pc-more" id="addEntradaD" style="margin-left:8px">+ Adicionar</button>` : ''}
    </div>
    <div class="pc-card-body">
      ${total > 0 ? `
        <div class="pc-bar">
          ${counts.inc > 0 ? `<div style="background:var(--success);width:${(counts.inc/total)*100}%"></div>` : ''}
          ${counts.par > 0 ? `<div style="background:var(--gold);width:${(counts.par/total)*100}%"></div>` : ''}
          ${counts.nao > 0 ? `<div style="background:var(--danger);width:${(counts.nao/total)*100}%"></div>` : ''}
        </div>
        <div class="pc-bar-legend">
          <span><strong style="color:var(--success)">${counts.inc}</strong> incorporadas</span>
          <span><strong style="color:var(--gold)">${counts.par}</strong> parciais</span>
          <span><strong style="color:var(--danger)">${counts.nao}</strong> não incorporada${counts.nao === 1 ? '' : 's'}</span>
          ${counts.sem > 0 ? `<span><strong>${counts.sem}</strong> sem objeto</span>` : ''}
          ${counts.pend > 0 ? `<span style="margin-left:auto"><strong>${counts.pend}</strong> pendente${counts.pend === 1 ? '' : 's'}</span>` : ''}
        </div>
        ${visiveis.map(e => `
          <div class="pc-mini">
            <div class="pc-mini-date">${fmtData(e.data)}</div>
            <div>
              <div class="pc-mini-ent">${esc(e.entidade_designacao)}</div>
              <div class="pc-mini-sub">${esc(FORMA_LBL[e.forma] || e.forma || '')} · ${e.rtri_id ? esc(e.rtri_id) : esc(NATUREZA_LBL[e.natureza_juridica] || e.natureza_juridica || '—')}</div>
            </div>
            <div>
              ${e.decisao_incorporacao
                ? `<span class="pc-dec ${esc(e.decisao_incorporacao)}">${esc(DECISAO_LBL[e.decisao_incorporacao])}</span>`
                : `<span class="pc-dec PENDENTE">⚠ Pendente</span>`}
            </div>
          </div>
        `).join('')}
        ${restantes > 0 ? `<button class="pc-more" id="verRestantesD">Ver as ${restantes} restantes →</button>` : ''}
      ` : '<div class="empty-hint" style="font-size:12px;color:var(--text-muted);font-style:italic">Sem interações externas registadas</div>'}
    </div>
  </div>`;
}

function cardC(f) {
  const lista = f.bloco_c || [];
  return `<div class="pc-card" id="card-c">
    <div class="pc-card-head">
      <div class="pc-letter">C</div>
      <div><div class="ttl">Contributos internos</div><div class="sub">Bloco C · pareceres formais</div></div>
      <span class="count">${lista.length}</span>
      ${userOwns(f) ? `<button class="pc-more" id="addEntradaC" style="margin-left:8px">+</button>` : ''}
    </div>
    <div class="pc-card-body">
      ${lista.length === 0
        ? '<div style="font-size:12px;color:var(--text-muted);font-style:italic">Sem contributos registados</div>'
        : lista.slice(0, 4).map(e => `
          <div class="pc-mini">
            <div class="pc-mini-date">${fmtData(e.data)}</div>
            <div>
              <div class="pc-mini-ent">${esc(e.entidade)}</div>
              <div class="pc-mini-sub">${esc(e.forma)}</div>
            </div>
          </div>
        `).join('')}
    </div>
  </div>`;
}

function cardE(f) {
  const tem = !!f.consulta_lex_ref;
  const total = f.consulta_lex_n_contributos || 0;
  return `<div class="pc-card" id="card-e">
    <div class="pc-card-head">
      <div class="pc-letter">E</div>
      <div><div class="ttl">Consulta pública</div><div class="sub">Bloco E · ConsultaLEX</div></div>
      ${tem && f.consulta_lex_fim ? '<span class="ok">✓ encerrada</span>' : tem ? '<span class="warn">em curso</span>' : ''}
      ${userOwns(f) ? `<button class="pc-more" id="editBlocoE" style="margin-left:8px">Editar</button>` : ''}
    </div>
    <div class="pc-card-body">
      ${tem ? `
        <div class="pc-kv">
          <div class="k">Referência</div><div class="v mono">${esc(f.consulta_lex_ref)}</div>
          <div class="k">Período</div><div class="v">${fmtData(f.consulta_lex_inicio)} → ${fmtData(f.consulta_lex_fim) || '—'}</div>
          <div class="k">Contributos</div><div class="v"><strong>${total}</strong> recebido${total === 1 ? '' : 's'}</div>
        </div>
      ` : '<div style="font-size:12px;color:var(--text-muted);font-style:italic">Sem consulta pública registada</div>'}
    </div>
  </div>`;
}

function cardComprovativos(f) {
  const cmps = state.comprovativos || [];
  const marcosBloq = ['M0', 'M3', 'M4', 'M5'];
  const emitidos = cmps.length;
  const pendentes = marcosBloq.filter(m => !cmps.find(c => c.marco === m));
  return `<div class="pc-card" id="card-cmp">
    <div class="pc-card-head">
      <div class="pc-letter cmp">⚿</div>
      <div><div class="ttl">Comprovativos</div><div class="sub">JWS Ed25519 · SmartLegis</div></div>
      <span class="count">${emitidos} / 4</span>
    </div>
    <div class="pc-card-body">
      ${emitidos > 0 ? cmps.slice(0, 2).map(c => `
        <div class="pc-mini">
          <div class="pc-mini-date">${fmtData(c.emitido_em)}</div>
          <div>
            <div class="pc-mini-ent">${esc(c.marco)} ✓</div>
            <div class="pc-mini-sub">${esc(c.validado_por || '')}</div>
          </div>
          <button class="pc-dec INCORPORADA pc-ver-cmp" data-jti="${esc(c.jti)}" style="cursor:pointer;border:none">EMITIDO</button>
        </div>
        <div class="pc-sig" title="${esc(c.jti)}">jti: ${esc(c.jti)} · kid: ${esc(c.kid || '')} · EdDSA<br>${esc((c.jws || '').slice(0, 80))}…</div>
      `).join('') : ''}
      ${pendentes.length > 0 ? `<div style="font-size:11.5px;color:var(--text-muted);margin-top:8px"><strong>${pendentes.length} pendente${pendentes.length === 1 ? '' : 's'}:</strong> ${pendentes.join(', ')}</div>` : ''}
    </div>
  </div>`;
}

function cardF(f) {
  const m3 = f.m3_validado_em ? '✓ M3 assinada' : 'M3 pendente';
  const m4 = f.m4_validado_em ? '✓ M4 assinada' : 'M4 pendente';
  const status = f.m3_validado_em && f.m4_validado_em ? 'ok' : 'warn';
  return `<div class="pc-card" id="card-f">
    <div class="pc-card-head">
      <div class="pc-letter f">F</div>
      <div><div class="ttl">Declaração</div><div class="sub">Bloco F · ponto focal</div></div>
      ${status === 'ok' ? '<span class="ok">✓ completas</span>' : `<span class="warn">${esc(!f.m3_validado_em ? m3 : m4)}</span>`}
    </div>
    <div class="pc-card-body">
      <div class="pc-quote">"Confirmo que a presente FPL reflete todas as interações ocorridas no perímetro do diploma e que os campos obrigatórios estão integralmente preenchidos."</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:10px">${m3} · ${m4}</div>
    </div>
  </div>`;
}

function cardAnexos(f) {
  const anexos = state.anexos || [];
  return `<div class="pc-card" id="card-anexos">
    <div class="pc-card-head">
      <div class="pc-letter anex">⎙</div>
      <div><div class="ttl">Anexos</div><div class="sub">PDFs e documentos</div></div>
      <span class="count">${anexos.length}</span>
      <button class="pc-more" id="addAnexo" style="margin-left:8px">+</button>
    </div>
    <div class="pc-card-body">
      ${anexos.length === 0
        ? '<div style="font-size:12px;color:var(--text-muted);font-style:italic">Sem anexos</div>'
        : anexos.slice(0, 3).map(a => `
          <div class="pc-mini">
            <div class="pc-mini-date">${fmtData(a.upload_em)}</div>
            <div>
              <div class="pc-mini-ent">${esc(a.nome_original)}</div>
              <div class="pc-mini-sub">${a.bloco} · ${(a.tamanho_bytes / 1024).toFixed(1)} KB · ${esc(a.antivirus_status || 'PENDENTE')}</div>
            </div>
            <a class="pc-dec INCORPORADA" href="/api/anexos/${esc(a.id)}" target="_blank" rel="noopener" style="text-decoration:none">↓</a>
          </div>
        `).join('')}
      ${anexos.length > 3 ? `<div style="font-size:11.5px;color:var(--text-muted);margin-top:6px">+ ${anexos.length - 3} mais</div>` : ''}
    </div>
  </div>`;
}

function cardG(f) {
  const lista = state.auditorias || [];
  const qa = isQa();
  return `<div class="pc-card" id="card-g">
    <div class="pc-card-head">
      <div class="pc-letter h">G</div>
      <div><div class="ttl">Auditoria QA</div><div class="sub">SGGOV · pontuação ${lista[0]?.pontuacao || '—'}/100</div></div>
      <span class="count">${lista.length}</span>
      ${qa ? `<button class="pc-more" id="addAud" style="margin-left:8px">+</button>` : ''}
    </div>
    <div class="pc-card-body">
      ${lista.slice(0, 2).map(a => `
        <div class="pc-mini">
          <div class="pc-mini-date">${fmtData(a.data_auditoria)}</div>
          <div>
            <div class="pc-mini-ent">${esc(a.auditor_nome || '')}</div>
            <div class="pc-mini-sub">${a.pedido_correcao ? `pedido de correção · ${esc(a.estado_correcao || 'PENDENTE')}` : 'sem correções'}</div>
          </div>
          <div class="pc-dec ${a.pedido_correcao && a.estado_correcao !== 'CONCLUIDA' ? 'PARCIALMENTE_INCORPORADA' : 'INCORPORADA'}">${a.pontuacao}</div>
        </div>
      `).join('')}
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// VISTA: CRONOGRAMA (calendário + lateral de prazos)
// ═══════════════════════════════════════════════════════════════════════════
function renderCronograma(f) {
  const hoje = new Date();
  const baseAno = hoje.getFullYear();
  const baseMes = hoje.getMonth();
  // Aplica offset (state.cronoMesOffset) — botões ‹/› e atalhos [/] navegam aqui.
  const dataAlvo = new Date(baseAno, baseMes + (state.cronoMesOffset || 0), 1);
  const ano = dataAlvo.getFullYear();
  const mesAtual = dataAlvo.getMonth();
  const grid = gerarGridMes(ano, mesAtual);
  const eventos = compilarEventos(f);
  const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const proximos = listarProximos(f, eventos);

  return `<div class="painel-crono">
    <div class="crono-cal">
      <div class="crono-toolbar">
        <div class="crono-nav">
          <button id="cronoPrev" aria-label="Mês anterior" title="Mês anterior · atalho [">‹</button>
          <button id="cronoHoje" aria-label="Hoje" title="Voltar a hoje" style="width:auto;padding:0 10px;font-size:11px;text-transform:uppercase;letter-spacing:.5px;font-weight:700">Hoje</button>
          <button id="cronoNext" aria-label="Mês seguinte" title="Mês seguinte · atalho ]">›</button>
        </div>
        <div class="crono-title">${meses[mesAtual]} ${ano}</div>
        <div class="crono-legend">
          <span><i style="background:#0a3161"></i>Marcos</span>
          <span><i style="background:#9aa5b6"></i>Interações</span>
          <span><i style="background:#c8102e"></i>RSE / CM</span>
          <span><i style="background:#1a7f3c"></i>Publicação</span>
        </div>
      </div>
      <div class="crono-weekhead">
        ${['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(d => `<div class="cell">${d}</div>`).join('')}
      </div>
      <div class="crono-grid">
        ${grid.map(day => {
          const isoDay = day.iso;
          const ev = eventos.get(isoDay) || [];
          const today = isoDay === isoHoje();
          return `<div class="crono-cell ${today ? 'today' : ''} ${day.dim ? 'dim' : ''}">
            <div class="num">${day.dia === 1 ? `${day.dia} ${meses[day.mes].slice(0,3)}` : day.dia}</div>
            ${ev.map(e => `<button class="crono-ev ${esc(e.k)}" data-marco="${esc(e.marco || '')}" title="${esc(e.lbl)}">${esc(e.lbl)}</button>`).join('')}
          </div>`;
        }).join('')}
      </div>
    </div>
    <aside class="crono-side">
      <div class="crono-side-hdr">Próximos prazos</div>
      ${proximos.length === 0 ? '<div style="font-size:12px;color:var(--text-muted);font-style:italic">Sem prazos próximos.</div>' : proximos.map(p => `
        <div class="crono-up-row">
          <div class="crono-up-date ${p.cor}">
            <div class="month">${p.mes}</div>
            <div class="day">${p.dia}</div>
          </div>
          <div>
            <div class="crono-up-title">${esc(p.titulo)}</div>
            <div class="crono-up-sub">${esc(p.sub)}</div>
            <div style="margin-top:6px">
              <span class="crono-up-tag ${esc(p.tag)}">${esc(p.tag)}</span>
              <span style="font-size:11px;color:var(--text-muted)">${esc(p.relativo)}</span>
            </div>
          </div>
        </div>
      `).join('')}
      ${state.dashboard?.timeline_marcos ? renderSla() : ''}
    </aside>
  </div>`;
}

function renderSla() {
  const m0 = state.fpl?.m0_validado_em;
  return `
    <div class="crono-side-hdr" style="margin-top:24px">SLA · médias 2026</div>
    <div class="crono-sla">
      M0→M3 mediano: <strong>72 dias</strong><br>
      M3→M5 mediano: <strong>34 dias</strong><br>
      Esta FPL · M0→hoje: <strong>${m0 ? diasDesde(m0) + ' dias' : '—'}</strong>
    </div>`;
}

function diasDesde(iso) {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

function isoHoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Gera 42 células (6 semanas) começando à segunda. ISO week.
function gerarGridMes(ano, mes) {
  const primeiro = new Date(ano, mes, 1);
  // JS getDay: 0=Dom, 1=Seg, ..., 6=Sáb. Queremos ISO: 0=Seg, 6=Dom.
  const isoFirst = (primeiro.getDay() + 6) % 7;
  const inicio = new Date(ano, mes, 1 - isoFirst);
  const out = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(inicio);
    d.setDate(inicio.getDate() + i);
    out.push({
      dia: d.getDate(),
      mes: d.getMonth(),
      ano: d.getFullYear(),
      iso: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
      dim: d.getMonth() !== mes,
    });
  }
  return out;
}

// Compila eventos da FPL para um Map<iso, [{k, lbl, marco?}]>
function compilarEventos(f) {
  const m = new Map();
  const add = (iso, evt) => {
    if (!iso) return;
    const k = iso.slice(0, 10);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(evt);
  };
  ['M0','M1','M2','M3','M4','M5'].forEach(M => {
    const dt = f[`${M.toLowerCase()}_validado_em`];
    if (dt) add(dt, { k: M, lbl: `${M}${MARCO_BLOQUEANTE(M) ? ' ⚿' : ''} validado`, marco: M });
  });
  (f.bloco_d || []).forEach(e => {
    add(e.data, { k: 'INTER', lbl: e.entidade_designacao.slice(0, 22) + (e.entidade_designacao.length > 22 ? '…' : '') });
  });
  if (f.consulta_lex_inicio) add(f.consulta_lex_inicio, { k: 'CP', lbl: 'CP · início' });
  if (f.consulta_lex_fim)    add(f.consulta_lex_fim,    { k: 'CP', lbl: 'CP · fim' });
  if (f.rse_prevista)        add(f.rse_prevista,        { k: 'RSE', lbl: 'RSE prevista' });
  if (f.cm_prevista)         add(f.cm_prevista,         { k: 'CM',  lbl: 'CM previsto' });
  if (f.dr_prevista)         add(f.dr_prevista,         { k: 'DR',  lbl: 'DR previsto' });
  if (f.data_publicacao)     add(f.data_publicacao,     { k: 'DR',  lbl: 'DR publicado' });
  return m;
}

function listarProximos(f, eventos) {
  const hoje = isoHoje();
  const out = [];
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  // Itera eventos futuros (ordenados)
  const datas = [...eventos.keys()].filter(d => d >= hoje).sort();
  for (const iso of datas.slice(0, 5)) {
    const evs = eventos.get(iso);
    const d = new Date(iso);
    const dias = Math.round((d - new Date(hoje)) / 86400000);
    for (const e of evs) {
      const cor = e.k === 'M3' || e.k === 'M4' ? 'gold'
                : e.k === 'M5' || e.k === 'DR' ? 'green'
                : e.k === 'RSE' || e.k === 'CM' ? 'red'
                : 'blue';
      out.push({
        cor,
        mes: dias === 0 ? 'Hoje' : meses[d.getMonth()],
        dia: String(d.getDate()).padStart(2, '0'),
        titulo: e.lbl,
        sub: descricaoEvento(e),
        tag: e.k,
        relativo: dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : `em ${dias} dias`,
      });
      if (out.length >= 5) return out;
    }
  }
  return out;
}

function descricaoEvento(e) {
  switch (e.k) {
    case 'M3': return 'Validação bloqueante · pré-RSE';
    case 'M4': return 'Validação bloqueante · pré-CM';
    case 'M5': return 'Validação bloqueante · publicação';
    case 'RSE': return 'Reunião de Secretários de Estado';
    case 'CM':  return 'Conselho de Ministros';
    case 'DR':  return 'Publicação em Diário da República';
    case 'CP':  return 'Período de consulta pública';
    case 'INTER': return 'Interação externa registada';
    default: return '';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Bindings — registados após o renderRoot
// ═══════════════════════════════════════════════════════════════════════════
export function bindDetalhePainel() {
  // Toggle de vista (sincronizado com o hash via setView)
  document.querySelectorAll('.painel-toggle [data-vista]').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.vista;
      setVistaAtual(v);
      setView('detalhe', { fplId: state.fplId, sub: v });
    });
  });
  // Breadcrumb
  document.getElementById('bcVoltar')?.addEventListener('click', () => setView('lista'));
  // CTAs do stepper (botão "Validar Mx")
  document.querySelectorAll('[data-validar]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.abrirValidacaoMarco(btn.dataset.validar);
    });
  });
  // Stepper navegável: clicar num step (que não tem CTA ativo) faz scroll
  // ao card correspondente e destaca-o brevemente.
  document.querySelectorAll('.painel-step[data-card-target]').forEach(step => {
    const target = step.dataset.cardTarget;
    if (!target) return;
    const ir = () => {
      const el = document.getElementById(target);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.remove('highlight');
      // force reflow para reiniciar a animação
      // eslint-disable-next-line no-unused-expressions
      void el.offsetWidth;
      el.classList.add('highlight');
      setTimeout(() => el.classList.remove('highlight'), 1300);
    };
    step.addEventListener('click', (e) => {
      // Não interfere com o botão "Validar"
      if (e.target.closest('[data-validar]')) return;
      ir();
    });
    step.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ir(); }
    });
  });
  // Bindings dos cards
  document.getElementById('editBlocoB')?.addEventListener('click', () => window.abrirEditarBlocoB());
  document.getElementById('editBlocoE')?.addEventListener('click', () => window.abrirEditarBlocoE());
  document.getElementById('addEntradaC')?.addEventListener('click', () => window.abrirNovaEntradaC());
  document.getElementById('addEntradaD')?.addEventListener('click', () => window.abrirWizardBlocoD());
  document.getElementById('verRestantesD')?.addEventListener('click', () => abrirListaCompletaD());
  document.getElementById('addAnexo')?.addEventListener('click', () => window.abrirUploadAnexo(null, 'A'));
  document.getElementById('addAud')?.addEventListener('click', () => window.abrirNovaAuditoria());
  document.querySelectorAll('.pc-ver-cmp').forEach(b => {
    b.addEventListener('click', () => window.verComprovativo(b.dataset.jti));
  });
  // Navegação do cronograma
  document.getElementById('cronoPrev')?.addEventListener('click', () => { state.cronoMesOffset = (state.cronoMesOffset || 0) - 1; renderRoot(); });
  document.getElementById('cronoNext')?.addEventListener('click', () => { state.cronoMesOffset = (state.cronoMesOffset || 0) + 1; renderRoot(); });
  document.getElementById('cronoHoje')?.addEventListener('click', () => { state.cronoMesOffset = 0; renderRoot(); });
  // Eventos do calendário
  document.querySelectorAll('.crono-ev[data-marco]').forEach(b => {
    const m = b.dataset.marco;
    if (m) b.addEventListener('click', () => window.abrirValidacaoMarco(m));
  });
}

// Modal com a lista completa de Bloco D (quando há mais de 5)
function abrirListaCompletaD() {
  const f = state.fpl;
  const todas = f.bloco_d || [];
  openModal(`
    <div class="modal-head">
      <h3>Bloco D · Interações externas (${todas.length})</h3>
      <button class="btn ghost sm" onclick="closeModal()" aria-label="Fechar">✕</button>
    </div>
    <div class="modal-body" style="max-height:65vh;overflow-y:auto">
      ${todas.map(e => `
        <div class="pc-mini" style="padding:10px 0">
          <div class="pc-mini-date">${fmtData(e.data)}</div>
          <div>
            <div class="pc-mini-ent">${esc(e.entidade_designacao)}</div>
            <div class="pc-mini-sub">${esc(FORMA_LBL[e.forma] || e.forma || '')} · ${e.rtri_id ? esc(e.rtri_id) : esc(NATUREZA_LBL[e.natureza_juridica] || '')}</div>
            <div class="pc-mini-sub" style="margin-top:4px">${esc((e.objeto || '').slice(0, 200))}</div>
          </div>
          <div>
            ${e.decisao_incorporacao
              ? `<span class="pc-dec ${esc(e.decisao_incorporacao)}">${esc(DECISAO_LBL[e.decisao_incorporacao])}</span>`
              : `<span class="pc-dec PENDENTE">⚠ Pendente</span>`}
          </div>
        </div>
      `).join('')}
    </div>
    <div class="modal-foot">
      <button class="btn primary" onclick="closeModal()">Fechar</button>
    </div>
  `);
}

// ═══════════════════════════════════════════════════════════════════════════
// Handlers de modais (reaproveitados do detalhe.js antigo)
// As funções abaixo registam-se em window.* para que os onclick inline
// que sobreviveram aos modais (já existentes) continuem a funcionar.
// ═══════════════════════════════════════════════════════════════════════════

window.abrirEditarBlocoB = () => {
  const f = state.fpl;
  openModal(`
    <div class="modal-head"><h3>Editar Bloco B — Origem</h3><button class="btn ghost sm" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <form id="editBForm">
        <div class="field-grid">
          <div class="field"><label>Tipo de origem</label>
            <select name="tipo_origem">${Object.entries(ORIGEM_LBL).map(([k, v]) => `<option value="${k}" ${f.tipo_origem === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
          </div>
          <div class="field"><label>Referência da origem</label><input name="referencia_origem" value="${esc(f.referencia_origem || '')}"></div>
          <div class="field full"><label>Síntese do problema * <span class="help">(mín. 200 caracteres)</span></label>
            <textarea name="sintese_problema" rows="6">${esc(f.sintese_problema || '')}</textarea>
          </div>
          <div class="field"><label>Avaliação prévia</label>
            <select name="avaliacao_previa"><option value="">—</option><option value="1" ${f.avaliacao_previa === 1 ? 'selected' : ''}>Sim</option><option value="0" ${f.avaliacao_previa === 0 ? 'selected' : ''}>Não</option></select>
          </div>
        </div>
      </form>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" onclick="salvarBlocoB()">Guardar</button>
    </div>
  `);
};

window.salvarBlocoB = async () => {
  const fd = new FormData(document.getElementById('editBForm'));
  const body = Object.fromEntries(fd.entries());
  if (body.avaliacao_previa === '') body.avaliacao_previa = null;
  else body.avaliacao_previa = parseInt(body.avaliacao_previa, 10);
  try {
    await api(`/fpl/${state.fpl.id}/bloco-b`, { method: 'PATCH', body });
    closeModal();
    toast('Bloco B atualizado.', 'success');
    renderRoot();
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
};

window.abrirEditarBlocoE = () => {
  const f = state.fpl;
  openModal(`
    <div class="modal-head"><h3>Editar Bloco E — Consulta pública</h3><button class="btn ghost sm" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <form id="editEForm">
        <div class="field-grid">
          <div class="field"><label>Referência Consulta.Lex</label><input name="consulta_lex_ref" value="${esc(f.consulta_lex_ref || '')}"></div>
          <div class="field"><label>N.º contributos</label><input type="number" name="consulta_lex_n_contributos" value="${f.consulta_lex_n_contributos ?? ''}"></div>
          <div class="field"><label>Início</label><input type="date" name="consulta_lex_inicio" value="${(f.consulta_lex_inicio || '').slice(0, 10)}"></div>
          <div class="field"><label>Fim</label><input type="date" name="consulta_lex_fim" value="${(f.consulta_lex_fim || '').slice(0, 10)}"></div>
          <div class="field full"><label>Síntese das posições <span class="help">(mín. 300 caracteres)</span></label>
            <textarea name="consulta_lex_sintese" rows="5">${esc(f.consulta_lex_sintese || '')}</textarea>
          </div>
          <div class="field full"><label>Decisão sobre incorporação <span class="help">(mín. 200 caracteres)</span></label>
            <textarea name="consulta_lex_decisao" rows="4">${esc(f.consulta_lex_decisao || '')}</textarea>
          </div>
        </div>
      </form>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" onclick="salvarBlocoE()">Guardar</button>
    </div>
  `);
};
window.salvarBlocoE = async () => {
  const fd = new FormData(document.getElementById('editEForm'));
  const body = Object.fromEntries(fd.entries());
  if (body.consulta_lex_n_contributos === '') body.consulta_lex_n_contributos = null;
  else body.consulta_lex_n_contributos = parseInt(body.consulta_lex_n_contributos, 10);
  try {
    await api(`/fpl/${state.fpl.id}/bloco-e`, { method: 'PATCH', body });
    closeModal();
    toast('Bloco E atualizado.', 'success');
    renderRoot();
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
};

window.abrirNovaEntradaC = () => {
  openModal(`
    <div class="modal-head"><h3>Nova entrada · Bloco C (interno)</h3><button class="btn ghost sm" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <form id="cForm">
        <div class="field-grid">
          <div class="field"><label>Data *</label><input type="date" name="data" required value="${new Date().toISOString().slice(0, 10)}"></div>
          <div class="field"><label>Forma *</label>
            <select name="forma" required><option>PARECER_ESCRITO</option><option>REUNIAO</option><option>AUDIENCIA</option></select>
          </div>
          <div class="field full"><label>Entidade contactada *</label><input name="entidade" required></div>
          <div class="field"><label>Cargo / função</label><input name="cargo"></div>
          <div class="field full"><label>Objeto *</label><input name="objeto" required></div>
          <div class="field full"><label>Síntese da posição * <span class="help">(mín. 100 caracteres)</span></label>
            <textarea name="sintese_posicao" rows="4" required></textarea>
          </div>
        </div>
      </form>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" onclick="salvarEntradaC()">Adicionar</button>
    </div>
  `);
};
window.salvarEntradaC = async () => {
  const fd = new FormData(document.getElementById('cForm'));
  const body = Object.fromEntries(fd.entries());
  try {
    await api(`/fpl/${state.fpl.id}/bloco-c`, { method: 'POST', body });
    closeModal();
    toast('Entrada Bloco C adicionada.', 'success');
    renderRoot();
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
};

window.abrirEditarDecisaoD = (eid) => {
  const e = state.fpl.bloco_d.find(x => x.id === eid);
  if (!e) return;
  openModal(`
    <div class="modal-head"><h3>Decisão de incorporação · ${esc(e.entidade_designacao)}</h3><button class="btn ghost sm" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <form id="dDecForm">
        <div class="field"><label>Decisão *</label>
          <select name="decisao_incorporacao" required><option value="">—</option>${Object.entries(DECISAO_LBL).map(([k, v]) => `<option value="${k}" ${e.decisao_incorporacao === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        </div>
        <div class="field mt-12"><label>Justificação * <span class="help">(mín. 100 caracteres)</span></label>
          <textarea name="justificacao_decisao" rows="5" required>${esc(e.justificacao_decisao || '')}</textarea>
        </div>
      </form>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" onclick="salvarDecisaoD('${eid}')">Guardar</button>
    </div>
  `);
};
window.salvarDecisaoD = async (eid) => {
  const fd = new FormData(document.getElementById('dDecForm'));
  const body = Object.fromEntries(fd.entries());
  try {
    await api(`/fpl/${state.fpl.id}/bloco-d/${eid}`, { method: 'PATCH', body });
    closeModal();
    toast('Decisão guardada.', 'success');
    renderRoot();
  } catch (e) {
    toast('Erro: ' + (e.data?.errors?.join(' | ') || e.message), 'error');
  }
};

// ---------- Validação de marcos ----------
window.abrirValidacaoMarco = async (marco) => {
  let pendencias = [];
  let resultado = null;
  try {
    resultado = await api(`/fpl/${state.fpl.id}/marcos/${marco}/validar`, { method: 'POST', body: {} });
  } catch (e) {
    pendencias = e.data?.pendencias || [];
  }
  if (resultado && resultado.ok) {
    closeModal();
    await loadFpl(state.fpl.id);
    if (resultado.comprovativo) mostrarComprovativoModal(resultado.comprovativo, marco);
    else { toast(marco + ' validado.', 'success'); renderRoot(); }
    return;
  }
  const realPend = pendencias.filter(p => p.regra !== 'declaracao_obrigatoria');
  const isBlocking = realPend.length > 0;
  openModal(`
    <div class="modal-head"><h3>Validar Marco ${marco}</h3><button class="btn ghost sm" onclick="closeModal()" aria-label="Fechar">✕</button></div>
    <div class="modal-body">
      ${isBlocking ? `
        <div class="alert danger"><div><span class="ttl">Não é possível validar ${marco}</span>O sistema bloqueia a transição até as ${realPend.length} pendência(s) abaixo serem resolvidas. <strong>Sem comprovativo, o SmartLegis bloqueia a tramitação.</strong></div></div>
      ` : `
        <div class="alert success"><div><span class="ttl">Verificações automáticas cumpridas</span>${MARCO_PRECISA_DECLARACAO(marco) ? 'Falta a sua assinatura da declaração de completude (Bloco F).' : 'A FPL cumpre os requisitos.'}${MARCO_BLOQUEANTE(marco) ? ' Ao validar, o sistema emite o comprovativo criptográfico.' : ''}</div></div>
      `}
      <h4 style="font-size:13px;margin:12px 0 4px">${realPend.length === 0 ? 'Verificações' : 'Pendências bloqueantes'}</h4>
      <ul class="checklist">
        ${realPend.length === 0 ?
          '<li class="ok"><div>Todas as verificações automáticas passaram</div></li>' :
          realPend.map(p => `<li class="fail"><div>${esc(p.detalhe)}<div class="det">Campo: ${esc(p.campo)} · Regra: ${esc(p.regra)}</div></div></li>`).join('')}
      </ul>
      ${MARCO_PRECISA_DECLARACAO(marco) ? `
        <div class="declaration-box"><strong>Declaração:</strong> "Confirmo que a presente FPL reflete todas as interações ocorridas no perímetro do diploma e que os campos obrigatórios estão integralmente preenchidos."</div>
      ` : ''}
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal()">${isBlocking ? 'Voltar e corrigir' : 'Cancelar'}</button>
      ${isBlocking ?
        '<button class="btn primary" disabled>Assinar e validar (bloqueado)</button>' :
        `<button class="btn success" onclick="confirmarValidacao('${marco}')">${MARCO_PRECISA_DECLARACAO(marco) ? 'Assinar e validar' : 'Validar'} ${marco}</button>`}
    </div>
  `);
};
window.confirmarValidacao = async (marco) => {
  try {
    const r = await api(`/fpl/${state.fpl.id}/marcos/${marco}/validar`, {
      method: 'POST', body: { declaracao_assinada: true },
    });
    closeModal();
    await loadFpl(state.fpl.id);
    if (r.comprovativo) mostrarComprovativoModal(r.comprovativo, marco);
    else { toast(`${marco} validado com sucesso.`, 'success'); renderRoot(); }
  } catch (e) {
    toast('Erro: ' + e.message, 'error');
  }
};

function mostrarComprovativoModal(c, marcoRecente) {
  const jws = c.jws || '';
  openModal(`
    <div class="modal-head">
      <h3>${marcoRecente ? marcoRecente + ' validado — comprovativo emitido' : 'Comprovativo criptográfico'}</h3>
      <button class="btn ghost sm" onclick="closeModal()" aria-label="Fechar">✕</button>
    </div>
    <div class="modal-body">
      ${marcoRecente ? `<div class="alert success"><div><span class="ttl">Marco ${marcoRecente} validado</span>O sistema gerou o comprovativo abaixo. Copie-o e cole-o no campo correspondente do SmartLegis.</div></div>` : ''}
      <div class="field"><label>Comprovativo (JWS Ed25519)</label>
        <textarea id="cmpJws" rows="5" readonly style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;word-break:break-all">${esc(jws)}</textarea>
      </div>
      <div class="field-grid mt-12">
        <div class="field"><label>Identificador (jti)</label><div class="val"><code>${esc(c.jti || c.payload?.jti || '')}</code></div></div>
        <div class="field"><label>Marco</label><div class="val">${esc(c.marco || c.payload?.marco || marcoRecente || '')}</div></div>
        <div class="field"><label>Algoritmo</label><div class="val">EdDSA (Ed25519) · kid ${esc(c.kid || c.payload?.kid || '')}</div></div>
        <div class="field"><label>Emitido em</label><div class="val">${fmtDH(c.emitido_em || c.payload?.validado_em || '')}</div></div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal();window._renderRootFromCmp()">Fechar</button>
      <button class="btn primary" onclick="copiarComprovativo()">Copiar para a área de transferência</button>
    </div>
  `);
}
window._renderRootFromCmp = () => renderRoot();
window.copiarComprovativo = async () => {
  const ta = document.getElementById('cmpJws');
  try {
    await navigator.clipboard.writeText(ta.value);
    toast('Comprovativo copiado. Cole-o no SmartLegis.', 'success');
  } catch {
    ta.select();
    toast('Selecione o texto e copie (Ctrl+C).', 'info');
  }
};
window.verComprovativo = async (jti) => {
  try {
    const c = await api('/comprovativos/' + encodeURIComponent(jti));
    mostrarComprovativoModal(c, null);
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
};

// ---------- Aprovação CM ----------
window.abrirAprovarCM = () => {
  openModal(`
    <div class="modal-head"><h3>Registar aprovação em Conselho de Ministros</h3><button class="btn ghost sm" onclick="closeModal()" aria-label="Fechar">✕</button></div>
    <div class="modal-body">
      <div class="alert info"><div>Após a aprovação do diploma em CM, registe aqui a referência do DR. Isto desbloqueia o marco M5.</div></div>
      <form id="cmForm">
        <div class="field"><label for="cmDr">Referência do Diário da República *</label>
          <input id="cmDr" placeholder="Ex.: DR n.º 78/2026, Série I, de 22-04-2026" required>
        </div>
      </form>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" onclick="confirmarAprovarCM()">Confirmar aprovação</button>
    </div>
  `);
};
window.confirmarAprovarCM = async () => {
  const referencia_dr = document.getElementById('cmDr').value.trim();
  if (!referencia_dr) return toast('Indique a referência do DR.', 'warning');
  try {
    await api(`/fpl/${state.fpl.id}/aprovar-cm`, { method: 'POST', body: { referencia_dr } });
    closeModal();
    toast('Aprovação em CM registada.', 'success');
    await loadFpl(state.fpl.id);
    renderRoot();
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
};

// ---------- Anexos ----------
window.abrirUploadAnexo = (entradaId, blocoDefault) => {
  openModal(`
    <div class="modal-head"><h3>Carregar anexo</h3><button class="btn ghost sm" onclick="closeModal()" aria-label="Fechar">✕</button></div>
    <div class="modal-body">
      <form id="upForm">
        <div class="field"><label for="upFile">Ficheiro *</label>
          <input type="file" id="upFile" name="file" accept=".pdf,.doc,.docx,.xls,.xlsx" required>
        </div>
        <div class="field"><label for="upBloco">Bloco associado</label>
          <select id="upBloco" name="bloco">
            <option value="A" ${blocoDefault === 'A' ? 'selected' : ''}>A · Identificação</option>
            <option value="B" ${blocoDefault === 'B' ? 'selected' : ''}>B · Origem</option>
            <option value="C" ${blocoDefault === 'C' ? 'selected' : ''}>C · Internos</option>
            <option value="D" ${blocoDefault === 'D' ? 'selected' : ''}>D · Externos</option>
            <option value="E" ${blocoDefault === 'E' ? 'selected' : ''}>E · Consulta pública</option>
          </select>
        </div>
        <div class="field"><label for="upVis">Visibilidade após M5</label>
          <select id="upVis" name="visibilidade"><option value="INTERNO">Interno</option><option value="PUBLICO">Público</option></select>
        </div>
      </form>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" onclick="confirmarUpload('${entradaId || ''}')">Carregar</button>
    </div>
  `);
};
window.confirmarUpload = async (entradaId) => {
  const file = document.getElementById('upFile').files[0];
  if (!file) return toast('Selecione um ficheiro.', 'warning');
  const bloco = document.getElementById('upBloco').value;
  const visibilidade = document.getElementById('upVis').value;
  try {
    const r = await uploadFile(`/fpl/${state.fpl.id}/anexos`, file, {
      bloco, visibilidade, ...(entradaId ? { entrada_id: entradaId } : {}),
    });
    closeModal();
    if (r.antivirus_status === 'INFETADO') toast('Ficheiro guardado em quarentena.', 'warning');
    else toast('Ficheiro carregado.', 'success');
    await loadFpl(state.fpl.id);
    renderRoot();
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
};
window.eliminarAnexo = async (id) => {
  if (!confirm('Eliminar este anexo? A operação é registada no log de auditoria.')) return;
  try {
    await api('/anexos/' + id, { method: 'DELETE' });
    await loadFpl(state.fpl.id); renderRoot();
    toast('Anexo eliminado.', 'success');
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
};

// ---------- Auditoria QA ----------
window.abrirNovaAuditoria = () => {
  openModal(`
    <div class="modal-head"><h3>Nova auditoria · Bloco G</h3><button class="btn ghost sm" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <form id="audForm">
        <div class="field"><label for="audPont">Pontuação (0-100) *</label>
          <input id="audPont" type="number" min="0" max="100" value="85" required>
        </div>
        <div class="field"><label for="audObs">Observações</label><textarea id="audObs" rows="4"></textarea></div>
        <div class="field">
          <label><input type="checkbox" id="audPC" onchange="document.getElementById('audDescWrap').style.display=this.checked?'block':'none'"> Solicitar correção</label>
        </div>
        <div class="field" id="audDescWrap" style="display:none">
          <label for="audDesc">Descrição da correção</label><textarea id="audDesc" rows="3"></textarea>
        </div>
      </form>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" onclick="salvarAuditoria()">Registar</button>
    </div>
  `);
};
window.salvarAuditoria = async () => {
  const body = {
    pontuacao: parseInt(document.getElementById('audPont').value, 10),
    observacoes: document.getElementById('audObs').value,
    pedido_correcao: document.getElementById('audPC').checked,
    descricao_correcao: document.getElementById('audDesc').value,
  };
  try {
    await api(`/fpl/${state.fpl.id}/auditoria`, { method: 'POST', body });
    closeModal();
    toast('Auditoria registada.', 'success');
    await loadFpl(state.fpl.id);
    renderRoot();
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
};
window.iniciarCorrecao = async (aid) => {
  await api(`/fpl/${state.fpl.id}/auditoria/${aid}`, { method: 'PATCH', body: { estado_correcao: 'EM_CURSO' } });
  toast('Correção iniciada.', 'success');
  await loadFpl(state.fpl.id); renderRoot();
};
window.submeterCorrecao = async (aid) => {
  if (!confirm('Submeter correções?')) return;
  await api(`/fpl/${state.fpl.id}/auditoria/${aid}`, { method: 'PATCH', body: { estado_correcao: 'SUBMETIDA' } });
  toast('Correção submetida.', 'success');
  await loadFpl(state.fpl.id); renderRoot();
};
window.aprovarCorrecao = async (aid) => {
  await api(`/fpl/${state.fpl.id}/auditoria/${aid}`, { method: 'PATCH', body: { estado_correcao: 'CONCLUIDA' } });
  toast('Correção aprovada.', 'success');
  await loadFpl(state.fpl.id); renderRoot();
};

// ---------- Import CSV Consulta.Lex ----------
window.abrirImportCsvCl = () => {
  openModal(`
    <div class="modal-head"><h3>Importar contributos · CSV</h3><button class="btn ghost sm" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <form id="clForm">
        <div class="field"><label for="clRef">Referência *</label><input id="clRef" placeholder="CL-2026-..." required></div>
        <div class="field"><label for="clCsv">CSV *</label><textarea id="clCsv" rows="8" placeholder="data,entidade,tipo_entidade,tema,sintese"></textarea></div>
      </form>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" onclick="importarCl()">Importar</button>
    </div>
  `);
};
window.importarCl = async () => {
  const cl_ref = document.getElementById('clRef').value.trim();
  const csv = document.getElementById('clCsv').value;
  if (!cl_ref || !csv) return toast('Preencha tudo.', 'warning');
  try {
    const r = await api(`/fpl/${state.fpl.id}/consulta-lex/import-csv`, { method: 'POST', body: { cl_ref, csv } });
    closeModal();
    toast(`Importados ${r.importados} contributos.`, 'success');
    await loadFpl(state.fpl.id); renderRoot();
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
};
