// views/detalhe.js — Vista de detalhe da FPL: cabeçalho, marcos, tabs A..H,
// modais de edição/validação/comprovativo/aprovação CM/anexos/auditoria/CSV.

import { api, uploadFile } from '../api.js';
import { state, gabNome, isQa, userOwns } from '../state.js';
import { TIPOS, ORIGEM_LBL, NATUREZA_LBL, FORMA_LBL, DECISAO_LBL, MARCO_BLOQUEANTE, MARCO_PRECISA_DECLARACAO } from '../constants.js';
import { esc, fmtData, fmtDH, badge, tag, openModal, closeModal, toast } from '../utils.js';
import { loadFpl, loadGabinetes } from '../data.js';
import { setView } from '../router.js';
import { renderRoot } from '../render.js';
import './../wizard-bloco-d.js';
import './../diff-viewer.js';

export async function viewDetalhe() {
  if (!state.fplId) return '<div class="card-empty">FPL não selecionada</div>';
  await loadFpl(state.fplId);
  await loadGabinetes();
  const f = state.fpl;
  const marcosArr = ['M0', 'M1', 'M2', 'M3', 'M4', 'M5'];
  const marcosLbl = { M0: 'Abertura', M1: 'Pré-CP', M2: 'Pós-CP', M3: 'Pré-RSE', M4: 'Pré-CM', M5: 'Publicação' };
  const marcosVal = { M0: f.m0_validado_em, M1: f.m1_validado_em, M2: f.m2_validado_em, M3: f.m3_validado_em, M4: f.m4_validado_em, M5: f.m5_validado_em };
  let lastDone = -1;
  marcosArr.forEach((m, i) => { if (marcosVal[m]) lastDone = i; });
  const next = lastDone < 5 ? lastDone + 1 : 5;

  let acaoMarco = null;
  if (!marcosVal.M0) acaoMarco = 'M0';
  else if (!marcosVal.M3 && ['EM_ELABORACAO', 'EM_CONSULTA_INTERNA', 'EM_CONSULTA_PUBLICA'].includes(f.estado_workflow)) acaoMarco = 'M3';
  else if (!marcosVal.M4 && f.estado_workflow === 'EM_RSE') acaoMarco = 'M4';
  else if (!marcosVal.M5 && f.estado_workflow === 'APROVADO') acaoMarco = 'M5';
  const podeAprovarCM = f.estado_workflow === 'EM_CM' && state.user.papeis.some(p => ['GSEPCM', 'SGGOV_ADMIN'].includes(p.papel));
  const marcosBloq = ['M0', 'M3', 'M4', 'M5'];

  return `
    <div class="fpl-head">
      <div class="breadcrumb"><a onclick="setView('lista')" style="cursor:pointer">FPL</a> › ${esc(f.numero_processo)}</div>
      <h1>${esc(f.titulo)}</h1>
      <div class="flex gap-8">${tag(f.tipo_diploma)} ${badge(f.estado_workflow)}<span class="muted small">· ${esc(f.numero_processo)} · ${esc(gabNome(f.gabinete_id))}</span></div>
      <div class="meta">
        <span><strong>Origem:</strong> ${ORIGEM_LBL[f.tipo_origem] || f.tipo_origem || '—'}</span>
        <span><strong>Aberto:</strong> ${fmtData(f.m0_validado_em) || fmtData(f.data_criacao)}</span>
        ${f.referencia_dr ? `<span><strong>DR:</strong> ${esc(f.referencia_dr)}</span>` : ''}
        <span><strong>Versão:</strong> ${f.versao_atual}</span>
      </div>
      <div class="actions">
        ${acaoMarco ? `<button class="btn primary" onclick="abrirValidacaoMarco('${acaoMarco}')">Validar ${acaoMarco}${marcosBloq.includes(acaoMarco) ? ' — emite comprovativo' : ''}</button>` : ''}
        ${podeAprovarCM ? `<button class="btn primary" onclick="abrirAprovarCM()">Registar aprovação em Conselho de Ministros</button>` : ''}
        <button class="btn" onclick="setTab('CMP')">Comprovativos</button>
        <button class="btn" onclick="setTab('H')">Histórico</button>
        ${state.versoes.length >= 2 ? `<button class="btn" onclick="abrirDiffVersoes()">Comparar versões</button>` : ''}
      </div>
    </div>
    <div class="marcos" role="img" aria-label="Progresso dos marcos M0 a M5">
      ${marcosArr.map((m, i) => {
        const done = !!marcosVal[m]; const cur = i === next && !done;
        const bloq = marcosBloq.includes(m);
        return `<div class="marco ${done ? 'done' : ''} ${cur ? 'current' : ''}" title="${m} · ${marcosLbl[m]}${bloq ? ' · marco bloqueante (emite comprovativo)' : ''}">
          <div class="dot">${done ? '✓' : m.replace('M', '')}</div>
          <div class="lbl">${m}${bloq ? ' ⚿' : ''}</div>
          <div class="sub">${marcosLbl[m]}</div>
          ${done ? `<div class="sub">${fmtData(marcosVal[m])}</div>` : ''}
        </div>`;
      }).join('')}
    </div>
    <div class="tabs" role="tablist" aria-label="Blocos da FPL">
      <button class="tab active" data-tab="A" role="tab" aria-selected="true">Bloco A</button>
      <button class="tab" data-tab="B" role="tab" aria-selected="false">Bloco B · Origem</button>
      <button class="tab" data-tab="C" role="tab" aria-selected="false">Bloco C · Internos <span class="pill">${(f.bloco_c || []).length}</span></button>
      <button class="tab" data-tab="D" role="tab" aria-selected="false">Bloco D · Externos <span class="pill">${(f.bloco_d || []).length}</span></button>
      <button class="tab" data-tab="E" role="tab" aria-selected="false">Bloco E · Consulta pública</button>
      <button class="tab" data-tab="F" role="tab" aria-selected="false">Bloco F · Declaração</button>
      <button class="tab" data-tab="CMP" role="tab" aria-selected="false">Comprovativos <span class="pill">${state.comprovativos.length}</span></button>
      <button class="tab" data-tab="G" role="tab" aria-selected="false">Bloco G · QA <span class="pill">${state.auditorias.length}</span></button>
      <button class="tab" data-tab="N" role="tab" aria-selected="false">Anexos <span class="pill">${state.anexos.length}</span></button>
      <button class="tab" data-tab="H" role="tab" aria-selected="false">Histórico <span class="pill">${state.versoes.length}</span></button>
    </div>
    <div id="tab-A" role="tabpanel">${blocoA(f)}</div>
    <div id="tab-B" role="tabpanel" hidden>${blocoB(f)}</div>
    <div id="tab-C" role="tabpanel" hidden>${blocoC(f)}</div>
    <div id="tab-D" role="tabpanel" hidden>${blocoD(f)}</div>
    <div id="tab-E" role="tabpanel" hidden>${blocoE(f)}</div>
    <div id="tab-F" role="tabpanel" hidden>${blocoF(f)}</div>
    <div id="tab-CMP" role="tabpanel" hidden>${blocoCMP(f)}</div>
    <div id="tab-G" role="tabpanel" hidden>${blocoG(f)}</div>
    <div id="tab-N" role="tabpanel" hidden>${blocoAnexos(f)}</div>
    <div id="tab-H" role="tabpanel" hidden>${blocoH(f)}</div>
  `;
}

// ========== Blocos ==========

function blocoA(f) {
  return `<div class="bloco-section">
    <div class="bloco-head"><div class="ttl"><div class="letra">A</div><div><h3>Identificação</h3></div></div></div>
    <div class="bloco-body">
      <div class="field-grid">
        <div class="field"><label>Tipo de diploma</label><div class="val">${TIPOS[f.tipo_diploma] || f.tipo_diploma}</div></div>
        <div class="field"><label>N.º interno de processo</label><div class="val"><strong>${esc(f.numero_processo)}</strong></div></div>
        <div class="field full"><label>Título</label><div class="val">${esc(f.titulo)}</div></div>
        <div class="field"><label>Área governativa proponente</label><div class="val">${esc(gabNome(f.gabinete_id))}</div></div>
        <div class="field"><label>Estado atual</label><div class="val">${badge(f.estado_workflow)}</div></div>
        <div class="field"><label>Data de criação</label><div class="val">${fmtDH(f.data_criacao)}</div></div>
        <div class="field"><label>Versão atual</label><div class="val">${f.versao_atual}</div></div>
      </div>
    </div>
  </div>`;
}

function blocoB(f) {
  return `<div class="bloco-section">
    <div class="bloco-head">
      <div class="ttl"><div class="letra">B</div><div><h3>Origem e motivação</h3></div></div>
      <button class="btn sm" onclick="abrirEditarBlocoB()">Editar</button>
    </div>
    <div class="bloco-body">
      <div class="field-grid">
        <div class="field"><label>Tipo de origem</label><div class="val ${!f.tipo_origem ? 'empty' : ''}">${ORIGEM_LBL[f.tipo_origem] || f.tipo_origem || 'Por preencher'}</div></div>
        <div class="field"><label>Referência da origem</label><div class="val ${!f.referencia_origem ? 'empty' : ''}">${esc(f.referencia_origem) || 'Não aplicável'}</div></div>
        <div class="field full"><label>Síntese do problema e solução</label>
          <div class="val ${!f.sintese_problema ? 'empty' : ''}">${esc(f.sintese_problema) || 'Por preencher (mínimo 200 caracteres)'}</div>
          ${f.sintese_problema ? `<div class="help">${f.sintese_problema.length} caracteres ${f.sintese_problema.length >= 200 ? '✓' : '⚠ insuficiente'}</div>` : ''}
        </div>
        <div class="field"><label>Avaliação prévia de impacto</label><div class="val">${f.avaliacao_previa === 1 ? '✓ Sim' : (f.avaliacao_previa === 0 ? 'Não' : '<span class="empty">Não indicada</span>')}</div></div>
      </div>
    </div>
  </div>`;
}

function blocoC(f) {
  const lista = f.bloco_c || [];
  return `<div class="bloco-section">
    <div class="bloco-head">
      <div class="ttl"><div class="letra">C</div><div><h3>Contributos internos ao Governo</h3><div class="desc">Pareceres e contributos formais</div></div></div>
      <button class="btn primary sm" onclick="abrirNovaEntradaC()">+ Adicionar</button>
    </div>
    <div class="bloco-body">
      ${lista.length === 0 ? '<div class="card-empty">Sem contributos internos registados</div>' :
      lista.map((e, i) => `
        <div class="entrada" id="c-${i}">
          <div class="entrada-head" onclick="document.getElementById('c-${i}').classList.toggle('open')">
            <div class="ttl"><strong>${esc(e.entidade)}</strong> <span class="tag">${e.forma}</span></div>
            <div class="data">${fmtData(e.data)}</div>
          </div>
          <div class="entrada-body">
            <div class="row"><div class="lbl">Objeto</div><div>${esc(e.objeto)}</div></div>
            <div class="row"><div class="lbl">Síntese</div><div>${esc(e.sintese_posicao)}</div></div>
          </div>
        </div>
      `).join('')}
    </div>
  </div>`;
}

function blocoD(f) {
  const lista = f.bloco_d || [];
  return `<div class="bloco-section">
    <div class="bloco-head">
      <div class="ttl"><div class="letra" style="background:var(--gov-red)">D</div><div><h3>Interações externas — núcleo da pegada</h3><div class="desc">Lei n.º 5-A/2026</div></div></div>
      <button class="btn primary sm" onclick="abrirWizardBlocoD()">+ Adicionar interação</button>
    </div>
    <div class="bloco-body">
      ${lista.length === 0 ? '<div class="card-empty">Sem interações externas registadas</div>' :
      lista.map((e, i) => {
        const govPess = (() => { try { return JSON.parse(e.pessoas_governo || '[]'); } catch { return []; } })();
        const intPess = (() => { try { return JSON.parse(e.pessoas_interlocutor || '[]'); } catch { return []; } })();
        return `<div class="entrada" id="d-${i}">
          <div class="entrada-head" onclick="document.getElementById('d-${i}').classList.toggle('open')">
            <div class="ttl">
              <strong>${esc(e.entidade_designacao)}</strong>
              <span class="tag">${FORMA_LBL[e.forma] || e.forma}</span>
              ${e.rtri_id ? `<span class="rtri-status ${e.rtri_status || 'PENDENTE'}">RTRI ${esc(e.rtri_id)}</span>` :
                `<span class="rtri-status NAO_APLICAVEL">${esc(NATUREZA_LBL[e.natureza_juridica] || e.natureza_juridica)}</span>`}
              ${e.decisao_incorporacao ? `<span class="tag" style="background:#e6fcf0;color:#0a4520;border-color:#86efac">→ ${DECISAO_LBL[e.decisao_incorporacao]}</span>` : '<span class="tag" style="background:#fff8e6;color:#86610a;border-color:#fde68a">⚠ Decisão pendente</span>'}
            </div>
            <div class="data">${fmtData(e.data)}</div>
          </div>
          <div class="entrada-body">
            <div class="row"><div class="lbl">Forma</div><div>${FORMA_LBL[e.forma] || e.forma}</div></div>
            <div class="row"><div class="lbl">Natureza jurídica</div><div>${esc(NATUREZA_LBL[e.natureza_juridica] || e.natureza_juridica)}</div></div>
            <div class="row"><div class="lbl">RTRI</div><div>${e.rtri_id ? `<strong>${esc(e.rtri_id)}</strong> <span class="rtri-status ${e.rtri_status}">${e.rtri_status === 'VALIDADO' ? '✓ Validado' : e.rtri_status}</span>` : '<em>Não aplicável</em>'}</div></div>
            <div class="row"><div class="lbl">Pelo Governo</div><div>${esc(govPess.join('; ') || '—')}</div></div>
            <div class="row"><div class="lbl">Pela entidade</div><div>${esc(intPess.join('; ') || '—')}</div></div>
            <div class="row"><div class="lbl">Objeto</div><div>${esc(e.objeto)}</div></div>
            <div class="row"><div class="lbl">Síntese da posição</div><div>${esc(e.sintese_posicao)}</div></div>
            ${e.decisao_incorporacao ? `
              <div class="divider"></div>
              <div class="row"><div class="lbl">Decisão</div><div><strong>${DECISAO_LBL[e.decisao_incorporacao]}</strong></div></div>
              <div class="row"><div class="lbl">Justificação</div><div>${esc(e.justificacao_decisao || '')}</div></div>
            ` : `<div class="alert warning mt-12"><div><span class="ttl">Decisão pendente</span>Necessário preencher antes de M3. <button class="btn sm" style="margin-left:10px" onclick="abrirEditarDecisaoD('${e.id}')">Preencher decisão</button></div></div>`}
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function blocoE(f) {
  return `<div class="bloco-section">
    <div class="bloco-head">
      <div class="ttl"><div class="letra">E</div><div><h3>Resultado da consulta pública</h3></div></div>
      <div class="flex gap-8">
        <button class="btn sm" onclick="abrirImportCsvCl()">↑ Importar CSV de contributos</button>
        <button class="btn sm" onclick="abrirEditarBlocoE()">Editar</button>
      </div>
    </div>
    <div class="bloco-body">
      <div class="field-grid">
        <div class="field"><label>Referência Consulta.Lex</label><div class="val ${!f.consulta_lex_ref ? 'empty' : ''}">${esc(f.consulta_lex_ref) || 'Sem consulta'}</div></div>
        <div class="field"><label>Período</label><div class="val">${f.consulta_lex_inicio ? `${fmtData(f.consulta_lex_inicio)} a ${fmtData(f.consulta_lex_fim)}` : '<span class="empty">—</span>'}</div></div>
        <div class="field"><label>N.º contributos</label><div class="val">${f.consulta_lex_n_contributos ?? '<span class="empty">—</span>'}</div></div>
        <div class="field full"><label>Síntese das principais posições <span class="help">(mínimo 300 caracteres)</span></label><div class="val ${!f.consulta_lex_sintese ? 'empty' : ''}">${esc(f.consulta_lex_sintese) || 'Por preencher'}</div></div>
        <div class="field full"><label>Decisão sobre incorporação <span class="help">(mínimo 200 caracteres)</span></label><div class="val ${!f.consulta_lex_decisao ? 'empty' : ''}">${esc(f.consulta_lex_decisao) || 'Por preencher'}</div></div>
      </div>
    </div>
  </div>`;
}

function blocoF(f) {
  return `<div class="bloco-section">
    <div class="bloco-head"><div class="ttl"><div class="letra">F</div><div><h3>Declaração do ponto focal</h3></div></div></div>
    <div class="bloco-body">
      <div class="declaration-box">"Confirmo que a presente FPL reflete todas as interações ocorridas no perímetro do diploma e que os campos obrigatórios estão integralmente preenchidos."</div>
      <div class="field-grid">
        <div class="field"><label>Declaração M3</label><div class="val">${f.m3_validado_em ? `✓ Assinada em ${fmtDH(f.m3_validado_em)}` : '<span class="empty">Pendente</span>'}</div></div>
        <div class="field"><label>Declaração M4</label><div class="val">${f.m4_validado_em ? `✓ Assinada em ${fmtDH(f.m4_validado_em)}` : '<span class="empty">Pendente</span>'}</div></div>
      </div>
      <div class="alert info mt-12"><div><span class="ttl">Lembrete legal</span>A submissão de declaração comprovadamente falsa é sujeita ao regime previsto no n.º 13 da RCM.</div></div>
    </div>
  </div>`;
}

function blocoCMP() {
  const marcos = ['M0', 'M3', 'M4', 'M5'];
  const marcosLbl = { M0: 'Abertura', M3: 'Pré-RSE', M4: 'Pré-CM', M5: 'Publicação' };
  const cmps = state.comprovativos || [];
  return `<div class="bloco-section">
    <div class="bloco-head">
      <div class="ttl"><div class="letra" style="background:var(--gov-gold);color:var(--gov-blue-dark)">⚿</div>
        <div><h3>Comprovativos criptográficos</h3><div class="desc">JWS Ed25519 · verificáveis offline pelo SmartLegis</div></div></div>
    </div>
    <div class="bloco-body">
      <div class="alert info"><div><span class="ttl">Acoplamento ao SmartLegis</span>Cada marco bloqueante (M0/M3/M4/M5) emite um comprovativo assinado. O ponto focal copia-o para o SmartLegis, que o verifica com a chave pública partilhada e bloqueia a tramitação se a verificação falhar — sem integração síncrona entre os sistemas.</div></div>
      ${marcos.map(m => {
        const c = cmps.find(x => x.marco === m);
        return `<div class="entrada ${c ? 'open' : ''}">
          <div class="entrada-head">
            <div class="ttl">
              <strong>${m} · ${marcosLbl[m]}</strong>
              ${c
                ? `<span class="rtri-status validado">✓ emitido</span><span class="tag">${esc(c.estado)}</span>`
                : '<span class="tag" style="background:#f5f6f8">Será emitido ao validar ' + m + '</span>'}
            </div>
            ${c ? `<div class="data">${fmtDH(c.emitido_em)}</div>` : ''}
          </div>
          ${c ? `<div class="entrada-body">
            <div class="row"><div class="lbl">Identificador (jti)</div><div><code>${esc(c.jti)}</code></div></div>
            <div class="row"><div class="lbl">Chave de assinatura</div><div><code>${esc(c.kid)}</code> · EdDSA (Ed25519)</div></div>
            <div class="row"><div class="lbl">Validado por</div><div>${esc(c.validado_por)}</div></div>
            <div class="row"><div class="lbl">Validade</div><div>${fmtData(c.emitido_em)} — ${fmtData(c.expira_em)}</div></div>
            <div class="flex gap-8 mt-12">
              <button class="btn sm primary" onclick="verComprovativo('${esc(c.jti)}')">Ver comprovativo e copiar para o SmartLegis</button>
            </div>
          </div>` : ''}
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function blocoG(f) {
  const qa = isQa();
  const lista = state.auditorias || [];
  return `<div class="bloco-section">
    <div class="bloco-head">
      <div class="ttl"><div class="letra" style="background:#5b6478">G</div><div><h3>Auditoria SGGOV (Bloco G)</h3><div class="desc">Pontuação 0-100 · pedidos de correção</div></div></div>
      ${qa ? `<button class="btn primary sm" onclick="abrirNovaAuditoria()">+ Nova auditoria</button>` : ''}
    </div>
    <div class="bloco-body">
      ${lista.length === 0 ? `<div class="card-empty">Sem auditorias registadas para esta FPL.</div>` :
      lista.map(a => `
        <div class="entrada open">
          <div class="entrada-head">
            <div class="ttl">
              <strong>Auditoria de ${esc(a.auditor_nome || '')}</strong>
              <span class="tag" style="background:${a.pontuacao >= 80 ? '#d1fae5' : '#fef3c7'};color:${a.pontuacao >= 80 ? '#0e6b34' : '#92400e'};border:none">${a.pontuacao}/100</span>
              ${a.pedido_correcao ? `<span class="badge revisao dot">${a.estado_correcao || 'PENDENTE'}</span>` : `<span class="badge aprovado dot">Sem correções</span>`}
            </div>
            <div class="data">${fmtDH(a.data_auditoria)}</div>
          </div>
          <div class="entrada-body">
            ${a.observacoes ? `<div class="row"><div class="lbl">Observações</div><div>${esc(a.observacoes)}</div></div>` : ''}
            ${a.pedido_correcao ? `
              <div class="alert warning"><div><span class="ttl">Pedido de correção</span>${esc(a.descricao_correcao || '')}</div></div>
              <div class="flex gap-8 mt-12">
                ${a.estado_correcao === 'PENDENTE' && userOwns(f) ? `<button class="btn sm" onclick="iniciarCorrecao('${a.id}')">Iniciar correção</button>` : ''}
                ${a.estado_correcao === 'EM_CURSO' && userOwns(f) ? `<button class="btn primary sm" onclick="submeterCorrecao('${a.id}')">Submeter correção</button>` : ''}
                ${a.estado_correcao === 'SUBMETIDA' && qa ? `<button class="btn success sm" onclick="aprovarCorrecao('${a.id}')">Aprovar correção</button>` : ''}
              </div>
            ` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  </div>`;
}

function blocoAnexos() {
  return `<div class="bloco-section">
    <div class="bloco-head">
      <div class="ttl"><div class="letra" style="background:#1a7f3c">⎙</div><div><h3>Anexos</h3><div class="desc">PDF, DOC(X), XLS(X) — máximo 20 MB · SHA-256 + scan antivírus</div></div></div>
      <button class="btn primary sm" onclick="abrirUploadAnexo(null,'A')">+ Carregar ficheiro</button>
    </div>
    <div class="bloco-body">
      ${(state.anexos || []).length === 0 ? `<div class="card-empty">Sem anexos. Use "+ Carregar ficheiro" para anexar PDFs ou outros documentos.</div>` :
      `<table class="tbl">
        <thead><tr><th>Ficheiro</th><th>Bloco</th><th>Tamanho</th><th>Visibilidade</th><th>Antivírus</th><th>Carregado</th><th></th></tr></thead>
        <tbody>
        ${state.anexos.map(a => `
          <tr>
            <td><strong>${esc(a.nome_original)}</strong><div class="muted small">SHA-256: ${a.sha256.slice(0, 16)}…</div></td>
            <td>${a.bloco}</td>
            <td>${(a.tamanho_bytes / 1024).toFixed(1)} KB</td>
            <td>${a.visibilidade === 'PUBLICO' ? '<span class="badge consulta dot">Público</span>' : '<span class="badge criado dot">Interno</span>'}</td>
            <td>${a.antivirus_status === 'LIMPO' ? '<span class="rtri-status validado">✓ Limpo</span>' : (a.antivirus_status === 'INFETADO' ? '<span class="rtri-status invalido">⚠ Quarentena</span>' : '<span class="rtri-status pendente">Pendente</span>')}</td>
            <td class="muted small">${fmtDH(a.upload_em)}</td>
            <td>
              ${a.antivirus_status !== 'INFETADO' ? `<a class="btn ghost sm" href="/api/anexos/${a.id}" target="_blank" rel="noopener">Abrir</a>` : ''}
              <button class="btn ghost sm" onclick="eliminarAnexo('${a.id}')" aria-label="Eliminar anexo ${esc(a.nome_original)}">🗑</button>
            </td>
          </tr>
        `).join('')}
        </tbody>
      </table>`}
    </div>
  </div>`;
}

function blocoH() {
  return `<div class="bloco-section">
    <div class="bloco-head">
      <div class="ttl"><div class="letra" style="background:#5b6478">H</div><div><h3>Histórico (versões + auditoria)</h3></div></div>
      ${state.versoes.length >= 2 ? `<button class="btn sm" onclick="abrirDiffVersoes()">Comparar versões</button>` : ''}
    </div>
    <div class="bloco-body">
      ${state.versoes.length === 0 ? '<div class="card-empty">Sem histórico</div>' : `
        <div class="timeline">
        ${state.versoes.map(v => `
          <div class="timeline-item ${v.marco_validado ? 'marco' : ''}">
            <div class="ts">${fmtDH(v.timestamp)} · v${v.numero}</div>
            <div class="desc">${v.marco_validado ? `<strong>${v.marco_validado}</strong> · ` : ''}${esc(v.descricao || '')}</div>
            <div class="author">por ${esc(v.autor_nome || '')}</div>
          </div>
        `).join('')}
        </div>
      `}
    </div>
  </div>`;
}

export function bindTabs() {
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => window.setTab(t.dataset.tab)));
}

window.setTab = (id) => {
  document.querySelectorAll('.tab').forEach(t => {
    const active = t.dataset.tab === id;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  ['A', 'B', 'C', 'D', 'E', 'F', 'CMP', 'G', 'N', 'H'].forEach(x => {
    const el = document.getElementById('tab-' + x);
    if (el) {
      if (x === id) el.removeAttribute('hidden');
      else el.setAttribute('hidden', '');
    }
  });
};

// ========== Modais e ações ==========

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

// ---------- Validação de marcos + comprovativo ----------
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
        <div class="alert danger"><div><span class="ttl">Não é possível validar ${marco}</span>O sistema bloqueia a transição até as ${realPend.length} pendência(s) abaixo serem resolvidas. <strong>Esta é a submissão bloqueante prevista no regime — sem validação não há comprovativo, e sem comprovativo o SmartLegis bloqueia a tramitação.</strong></div></div>
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
      <div class="alert info mt-12"><div><span class="ttl">Verificação offline</span>O SmartLegis verifica este comprovativo com a chave pública partilhada (endpoint <code>/api/.well-known/fpl-jwks.json</code>), sem qualquer chamada de rede a esta aplicação. Sem comprovativo válido, a tramitação fica bloqueada.</div></div>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal();window.renderRootFromModal()">Fechar</button>
      <button class="btn primary" onclick="copiarComprovativo()">Copiar para a área de transferência</button>
    </div>
  `);
}
window.renderRootFromModal = () => renderRoot();
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

window.abrirAprovarCM = () => {
  openModal(`
    <div class="modal-head"><h3>Registar aprovação em Conselho de Ministros</h3><button class="btn ghost sm" onclick="closeModal()" aria-label="Fechar">✕</button></div>
    <div class="modal-body">
      <div class="alert info"><div>Após a aprovação do diploma em Conselho de Ministros, registe aqui a referência do Diário da República. Isto desbloqueia o marco M5 (publicação).</div></div>
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
  if (!referencia_dr) return toast('Indique a referência do Diário da República.', 'warning');
  try {
    await api(`/fpl/${state.fpl.id}/aprovar-cm`, { method: 'POST', body: { referencia_dr } });
    closeModal();
    toast('Aprovação em CM registada. O marco M5 está agora disponível.', 'success');
    await loadFpl(state.fpl.id);
    renderRoot();
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
};

// ---------- Anexos ----------
window.abrirUploadAnexo = (entradaId, blocoDefault) => {
  openModal(`
    <div class="modal-head"><h3>Carregar anexo</h3><button class="btn ghost sm" onclick="closeModal()" aria-label="Fechar">✕</button></div>
    <div class="modal-body">
      <div class="alert info"><div>Tipos aceites: PDF, DOC(X), XLS(X). Tamanho máximo 20 MB. SHA-256 calculado e scan antivírus aplicado.</div></div>
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
          <select id="upVis" name="visibilidade"><option value="INTERNO">Interno (apenas SGGOV / gabinete)</option><option value="PUBLICO">Público</option></select>
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
    if (r.antivirus_status === 'INFETADO') toast('Ficheiro guardado em quarentena (antivírus detetou padrão suspeito).', 'warning');
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
        <div class="field"><label for="audPont">Pontuação de completude (0-100) *</label>
          <input id="audPont" type="number" min="0" max="100" value="85" required>
        </div>
        <div class="field"><label for="audObs">Observações</label>
          <textarea id="audObs" rows="4" placeholder="Notas sobre a qualidade da FPL, completude, fundamentação das decisões..."></textarea>
        </div>
        <div class="field">
          <label><input type="checkbox" id="audPC" onchange="document.getElementById('audDescWrap').style.display=this.checked?'block':'none'"> Solicitar correção ao ponto focal</label>
        </div>
        <div class="field" id="audDescWrap" style="display:none">
          <label for="audDesc">Descrição do pedido de correção</label>
          <textarea id="audDesc" rows="3" placeholder="Indique claramente o que precisa ser corrigido."></textarea>
        </div>
      </form>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" onclick="salvarAuditoria()">Registar auditoria</button>
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
  if (!confirm('Submeter correções? A FPL volta ao estado anterior e a SGGOV é notificada para aprovação.')) return;
  await api(`/fpl/${state.fpl.id}/auditoria/${aid}`, { method: 'PATCH', body: { estado_correcao: 'SUBMETIDA' } });
  toast('Correção submetida para revisão SGGOV.', 'success');
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
    <div class="modal-head"><h3>Importar contributos da Consulta.Lex (CSV)</h3><button class="btn ghost sm" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="alert info"><div><span class="ttl">Modo fallback</span>Use este formulário enquanto o webhook automático Consulta.Lex não está ligado. Em produção, esta operação é automática.</div></div>
      <form id="clForm">
        <div class="field"><label for="clRef">Referência da consulta *</label><input id="clRef" placeholder="CL-2026-..." required></div>
        <div class="field"><label for="clCsv">Contributos (CSV) *</label>
          <textarea id="clCsv" rows="8" placeholder="data,entidade,tipo_entidade,tema,sintese"></textarea>
          <div class="help">Formato: data,entidade,tipo_entidade,tema,sintese. Aspas duplas para campos com vírgulas.</div>
        </div>
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
  if (!cl_ref || !csv) return toast('Preencha a referência e o CSV.', 'warning');
  try {
    const r = await api(`/fpl/${state.fpl.id}/consulta-lex/import-csv`, { method: 'POST', body: { cl_ref, csv } });
    closeModal();
    toast(`Importados ${r.importados} contributos (${r.total} no total).`, 'success');
    await loadFpl(state.fpl.id); renderRoot();
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
};
