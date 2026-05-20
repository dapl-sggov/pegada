// wizard-bloco-d.js — Wizard de 3 passos para nova entrada do Bloco D.
//
// O Bloco D é o mais preenchido (interlocutores externos) e o que tem
// mais regras. Em vez de um modal-formulário plano, dividimos em:
//   1. Entidade   — pesquisa RTRI + natureza jurídica + identificação
//   2. Reunião    — data, forma, pessoas pelo Governo, pessoas pela entidade
//   3. Conteúdo   — objeto, síntese da posição
//
// A decisão de incorporação fica para um passo posterior (modal próprio,
// pode ser preenchida mais tarde — obrigatória antes de M1, Pré-RSE). O
// wizard faz autosave entre passos para não perder trabalho ao trocar de aba.

import { api } from './api.js';
import { state } from './state.js';
import { FORMA_LBL, NATUREZA_LBL } from './constants.js';
import { esc, openModal, closeModal, toast } from './utils.js';
import { loadFpl } from './data.js';
import { renderRoot } from './render.js';
import { ligarAutosave, lerRascunho, limparRascunho } from './autosave.js';

const PASSOS = [
  { id: 1, titulo: 'Entidade interlocutora', desc: 'Pesquise no RTRI ou identifique a entidade manualmente.' },
  { id: 2, titulo: 'Reunião e participantes', desc: 'Quando, como, quem participou.' },
  { id: 3, titulo: 'Objeto e posição', desc: 'O que foi tratado e o que a entidade defendeu.' },
];

let passoAtual = 1;
let dadosAcumulados = {};

function rascunhoKey() {
  return 'd-wizard-' + (state.fpl?.id || 'novo');
}

window.abrirWizardBlocoD = () => {
  const restaurado = lerRascunho(rascunhoKey()) || {};
  passoAtual = restaurado.__passo || 1;
  dadosAcumulados = restaurado;
  renderWizard();
};

function renderWizard() {
  openModal(`
    <div class="modal-head">
      <h3>Nova interação externa · Bloco D</h3>
      <button class="btn ghost sm" onclick="closeModal()" aria-label="Fechar">✕</button>
    </div>
    <div class="modal-body">
      <div class="wizard-steps" role="list" aria-label="Passos do wizard">
        ${PASSOS.map(p => `
          <div role="listitem" class="wstep ${p.id < passoAtual ? 'done' : p.id === passoAtual ? 'active' : ''}"
               aria-current="${p.id === passoAtual ? 'step' : 'false'}">
            <div class="wstep-num">${p.id < passoAtual ? '✓' : p.id}</div>
            <div class="wstep-lbl">
              <div class="t">${p.titulo}</div>
              <div class="d">${p.desc}</div>
            </div>
          </div>
        `).join('')}
      </div>
      <form id="wizardForm" novalidate>
        <div id="wizardPasso">${renderPasso(passoAtual, dadosAcumulados)}</div>
      </form>
      <div class="autosave-ind sm" id="wizardAutosave" aria-live="polite"></div>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="window.cancelarWizardD()">Cancelar</button>
      <div style="flex:1"></div>
      ${passoAtual > 1 ? `<button class="btn" onclick="window.passoWizardD(${passoAtual - 1})">← Anterior</button>` : ''}
      ${passoAtual < 3
        ? `<button class="btn primary" onclick="window.passoWizardD(${passoAtual + 1})">Continuar →</button>`
        : `<button class="btn primary" onclick="window.submeterWizardD()">Adicionar interação</button>`}
    </div>
  `);

  // Autosave do passo atual
  const form = document.getElementById('wizardForm');
  ligarAutosave(form, rascunhoKey(), document.getElementById('wizardAutosave'));

  // Ligações específicas do passo
  if (passoAtual === 1) ligarPesquisaRtri();
}

function renderPasso(n, d) {
  if (n === 1) return `
    <div class="alert info"><div>Esta entrada documenta uma interação com um representante de interesses, na aceção da Lei n.º 5-A/2026.</div></div>
    <div class="field full">
      <label>Pesquisar entidade no RTRI</label>
      <div class="rtri-search-wrap">
        <input id="rtriSearchInput" type="text" placeholder="Comece a escrever para pesquisar..." autocomplete="off">
        <div class="rtri-results" id="rtriResults"></div>
      </div>
      <div class="help">Selecione da lista para preencher automaticamente. Para entidades sem RTRI (peritos, autoridades), preencha manualmente abaixo.</div>
    </div>
    <div class="field-grid">
      <div class="field full">
        <label>Designação da entidade *</label>
        <input name="entidade_designacao" id="dEnt" required value="${esc(d.entidade_designacao || '')}">
      </div>
      <div class="field"><label>N.º RTRI</label><input name="rtri_id" id="dRtri" value="${esc(d.rtri_id || '')}" placeholder="RTRI/AAAA/NNNNN"></div>
      <div class="field"><label>Natureza jurídica *</label>
        <select name="natureza_juridica" required>
          ${Object.entries(NATUREZA_LBL).map(([k, v]) => `<option value="${k}" ${d.natureza_juridica === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </div>
    </div>`;

  if (n === 2) return `
    <div class="field-grid">
      <div class="field"><label>Data *</label>
        <input type="date" name="data" required value="${esc(d.data || new Date().toISOString().slice(0, 10))}">
      </div>
      <div class="field"><label>Forma *</label>
        <select name="forma" required>
          ${Object.entries(FORMA_LBL).map(([k, v]) => `<option value="${k}" ${d.forma === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </div>
      <div class="field full">
        <label>Pessoas pelo Governo (separar com ;)</label>
        <input name="pessoas_governo_str" placeholder="SE Ambiente; Adjunta SE" value="${esc(d.pessoas_governo_str || '')}">
        <div class="help">Liste cargos ou nomes — um por separador.</div>
      </div>
      <div class="field full">
        <label>Pessoas pela entidade (separar com ;)</label>
        <input name="pessoas_interlocutor_str" placeholder="Presidente; Director" value="${esc(d.pessoas_interlocutor_str || '')}">
      </div>
    </div>`;

  // n === 3
  const objLen = (d.objeto || '').length;
  const sintLen = (d.sintese_posicao || '').length;
  return `
    <div class="field full">
      <label>Objeto da interação * <span class="help">(mín. 50 caracteres)</span></label>
      <textarea name="objeto" rows="3" required>${esc(d.objeto || '')}</textarea>
      <div class="help" id="objCh">${objLen} caracteres ${objLen >= 50 ? '✓' : '(faltam ' + (50 - objLen) + ')'}</div>
    </div>
    <div class="field full mt-12">
      <label>Síntese da posição da entidade * <span class="help">(mín. 100 caracteres)</span></label>
      <textarea name="sintese_posicao" rows="6" required>${esc(d.sintese_posicao || '')}</textarea>
      <div class="help" id="sintCh">${sintLen} caracteres ${sintLen >= 100 ? '✓' : '(faltam ' + (100 - sintLen) + ')'}</div>
    </div>
    <div class="alert warning mt-12"><div>
      <span class="ttl">Decisão de incorporação</span>
      Pode preencher mais tarde, mas é <strong>obrigatória antes de validar M1</strong> (Pré-RSE). Após adicionar a interação, abra-a no Bloco D e clique em "Preencher decisão".
    </div></div>
    <script>
      document.querySelector('[name=objeto]')?.addEventListener('input', e => {
        const n = e.target.value.length;
        const ch = document.getElementById('objCh');
        if (ch) { ch.textContent = n + ' caracteres ' + (n >= 50 ? '✓' : '(faltam ' + (50 - n) + ')'); ch.style.color = n >= 50 ? 'var(--success)' : 'var(--text-faint)'; }
      });
      document.querySelector('[name=sintese_posicao]')?.addEventListener('input', e => {
        const n = e.target.value.length;
        const ch = document.getElementById('sintCh');
        if (ch) { ch.textContent = n + ' caracteres ' + (n >= 100 ? '✓' : '(faltam ' + (100 - n) + ')'); ch.style.color = n >= 100 ? 'var(--success)' : 'var(--text-faint)'; }
      });
    </script>`;
}

function ligarPesquisaRtri() {
  const inp = document.getElementById('rtriSearchInput');
  const box = document.getElementById('rtriResults');
  if (!inp || !box) return;
  let timer = null;
  inp.addEventListener('input', () => {
    clearTimeout(timer);
    const q = inp.value.trim();
    if (q.length < 2) { box.classList.remove('open'); box.innerHTML = ''; return; }
    timer = setTimeout(async () => {
      try {
        const res = await api('/rtri/entidades?q=' + encodeURIComponent(q));
        if (res.length === 0) {
          box.innerHTML = '<div class="rtri-result" style="cursor:default"><div class="nome">Sem resultados</div><div class="det">Pode preencher manualmente abaixo.</div></div>';
        } else {
          box.innerHTML = res.map(e => `
            <div class="rtri-result" onclick="window.selecionarRtri('${e.rtri_id}','${esc(e.designacao).replace(/'/g, '\\\'')}')">
              <div class="nome">${esc(e.designacao)}</div>
              <div class="det">${e.rtri_id} · ${esc(e.natureza_juridica || '')} <span class="rtri-status validado">✓ Ativo</span></div>
            </div>
          `).join('');
        }
        box.classList.add('open');
      } catch { /* ignore */ }
    }, 200);
  });
}

window.selecionarRtri = (rtriId, nome) => {
  document.getElementById('dEnt').value = nome;
  document.getElementById('dRtri').value = rtriId;
  const sel = document.querySelector('[name=natureza_juridica]');
  if (sel) sel.value = 'RTRI_INSCRITO';
  document.getElementById('rtriResults').classList.remove('open');
  document.getElementById('rtriSearchInput').value = nome;
};

window.passoWizardD = (novoPasso) => {
  // Captura o passo atual antes de avançar
  capturarPassoAtual();
  // Validação ligeira por passo (avisos, não bloqueante para "Continuar")
  if (novoPasso > passoAtual) {
    const erros = validarPasso(passoAtual, dadosAcumulados);
    if (erros.length) { toast(erros[0], 'warning'); return; }
  }
  passoAtual = novoPasso;
  dadosAcumulados.__passo = passoAtual;
  renderWizard();
};

function capturarPassoAtual() {
  const fd = new FormData(document.getElementById('wizardForm'));
  for (const [k, v] of fd.entries()) dadosAcumulados[k] = v;
}

function validarPasso(n, d) {
  const e = [];
  if (n === 1) {
    if (!d.entidade_designacao || d.entidade_designacao.trim().length < 2) e.push('Indique a designação da entidade.');
    if (d.natureza_juridica === 'RTRI_INSCRITO' && !d.rtri_id) e.push('Para RTRI inscrito, indique o número.');
  } else if (n === 2) {
    if (!d.data) e.push('Indique a data da reunião.');
    if (!d.forma) e.push('Indique a forma de interação.');
  }
  return e;
}

window.submeterWizardD = async () => {
  capturarPassoAtual();
  const todosErros = [...validarPasso(1, dadosAcumulados), ...validarPasso(2, dadosAcumulados)];
  if (!dadosAcumulados.objeto || dadosAcumulados.objeto.length < 50) todosErros.push('Objeto: mínimo 50 caracteres.');
  if (!dadosAcumulados.sintese_posicao || dadosAcumulados.sintese_posicao.length < 100) todosErros.push('Síntese: mínimo 100 caracteres.');
  if (todosErros.length) { toast(todosErros[0], 'warning'); return; }

  const body = { ...dadosAcumulados };
  body.pessoas_governo = (body.pessoas_governo_str || '').split(';').map(s => s.trim()).filter(Boolean);
  body.pessoas_interlocutor = (body.pessoas_interlocutor_str || '').split(';').map(s => s.trim()).filter(Boolean);
  delete body.pessoas_governo_str; delete body.pessoas_interlocutor_str; delete body.__passo;

  try {
    await api(`/fpl/${state.fpl.id}/bloco-d`, { method: 'POST', body });
    limparRascunho(rascunhoKey());
    closeModal();
    toast('Interação adicionada ao Bloco D.', 'success');
    await loadFpl(state.fpl.id);
    renderRoot();
  } catch (e) {
    const errs = e.data?.errors || [];
    toast('Erro: ' + (errs.length ? errs.join(' | ') : e.message), 'error');
  }
};

window.cancelarWizardD = () => {
  if (Object.keys(dadosAcumulados).length > 1) {
    if (!confirm('Cancelar e descartar o que foi preenchido? O rascunho fica guardado e pode ser retomado.')) return;
  }
  closeModal();
};
