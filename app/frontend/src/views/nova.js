// views/nova.js — Formulário de nova FPL com Bloco A + B inline.
// Usa o autosave central (autosave.js) para preservar trabalho.

import { api } from '../api.js';
import { state, isSggov, myGabinete } from '../state.js';
import { TIPOS, ORIGEM_LBL } from '../constants.js';
import { esc, toast } from '../utils.js';
import { loadGabinetes } from '../data.js';
import { setView } from '../router.js';
import { ligarAutosave, lerRascunho, limparRascunho } from '../autosave.js';

const RASCUNHO_KEY = 'nova-fpl';

export async function viewNova() {
  await loadGabinetes();
  const myGab = myGabinete();
  const rascunho = lerRascunho(RASCUNHO_KEY) || {};
  return `
    <div class="page-head">
      <div><div class="page-title">Nova FPL</div><div class="page-sub">Bloco A (identificação) + Bloco B (origem). Validar M0 inicia o ciclo de vida da FPL.</div></div>
      <div class="autosave-ind" id="autosaveInd" aria-live="polite"></div>
    </div>
    ${Object.keys(rascunho).length ? `
      <div class="alert info"><div>
        <span class="ttl">Rascunho recuperado</span>
        Tem alterações não submetidas guardadas localmente. Foram restauradas no formulário abaixo.
        <button class="btn ghost sm" id="descartarRascunho" style="margin-left:8px">Descartar rascunho</button>
      </div></div>` : ''}
    <form id="novaFplForm">
      <div class="bloco-section">
        <div class="bloco-head"><div class="ttl"><div class="letra">A</div><div><h3>Bloco A · Identificação</h3></div></div></div>
        <div class="bloco-body">
          <div class="field-grid">
            <div class="field"><label>Tipo de diploma *</label>
              <select name="tipo_diploma" required>
                ${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${rascunho.tipo_diploma === k ? 'selected' : ''}>${v}</option>`).join('')}
              </select>
            </div>
            <div class="field"><label>Área governativa proponente *</label>
              <select name="gabinete_id" required>
                ${state.gabinetes.filter(g => isSggov() || g.id === myGab).map(g => `<option value="${g.id}" ${rascunho.gabinete_id === g.id ? 'selected' : ''}>${esc(g.nome)}</option>`).join('')}
              </select>
            </div>
            <div class="field full"><label>Título do diploma *</label>
              <input type="text" name="titulo" required placeholder="Decreto-Lei que aprova..." value="${esc(rascunho.titulo || '')}">
            </div>
            <div class="field full"><label>Título curto (para listagens)</label>
              <input type="text" name="titulo_curto" placeholder="Ex.: Comunidades de energia" value="${esc(rascunho.titulo_curto || '')}">
            </div>
          </div>
        </div>
      </div>
      <div class="bloco-section">
        <div class="bloco-head"><div class="ttl"><div class="letra">B</div><div><h3>Bloco B · Origem e motivação</h3></div></div></div>
        <div class="bloco-body">
          <div class="field-grid">
            <div class="field"><label>Tipo de origem *</label>
              <select name="tipo_origem" required>
                ${Object.entries(ORIGEM_LBL).map(([k, v]) => `<option value="${k}" ${rascunho.tipo_origem === k ? 'selected' : ''}>${v}</option>`).join('')}
              </select>
            </div>
            <div class="field"><label>Referência da origem</label>
              <input type="text" name="referencia_origem" placeholder="Ex.: Diretiva (UE) 2024/884" value="${esc(rascunho.referencia_origem || '')}">
            </div>
            <div class="field full"><label>Síntese do problema e solução * <span class="help">(mínimo 200 caracteres — exigido para validar M0)</span></label>
              <textarea name="sintese_problema" rows="6" placeholder="Descreva o problema e a solução proposta...">${esc(rascunho.sintese_problema || '')}</textarea>
              <div class="help" id="sinteseChars">${(rascunho.sintese_problema || '').length} caracteres</div>
            </div>
            <div class="field"><label>Avaliação prévia de impacto</label>
              <select name="avaliacao_previa">
                <option value="">Não indicada</option>
                <option value="1" ${rascunho.avaliacao_previa === '1' ? 'selected' : ''}>Sim</option>
                <option value="0" ${rascunho.avaliacao_previa === '0' ? 'selected' : ''}>Não</option>
              </select>
            </div>
          </div>
        </div>
      </div>
      <div class="flex gap-12 mt-12" style="justify-content:flex-end">
        <button type="button" class="btn" onclick="setView('lista')">Cancelar</button>
        <button type="submit" class="btn primary" id="btnCreate">Criar FPL e validar M0</button>
      </div>
    </form>
  `;
}

export function bindNovaFpl() {
  const form = document.getElementById('novaFplForm');
  if (!form) return;

  // Autosave do formulário inteiro
  ligarAutosave(form, RASCUNHO_KEY, document.getElementById('autosaveInd'));

  document.getElementById('descartarRascunho')?.addEventListener('click', () => {
    limparRascunho(RASCUNHO_KEY);
    setView('nova'); // re-renderiza limpo
  });

  // Contador de caracteres da síntese
  const sintTxt = form.querySelector('[name=sintese_problema]');
  const sintChars = document.getElementById('sinteseChars');
  if (sintTxt && sintChars) {
    const upd = () => {
      const n = sintTxt.value.length;
      sintChars.textContent = `${n} caracteres ${n >= 200 ? '✓' : '(faltam ' + (200 - n) + ')'}`;
      sintChars.style.color = n >= 200 ? 'var(--success)' : 'var(--text-faint)';
    };
    sintTxt.addEventListener('input', upd); upd();
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(form);
    const body = Object.fromEntries(fd.entries());
    const btn = document.getElementById('btnCreate');
    btn.disabled = true;
    try {
      const fpl = await api('/fpl', { method: 'POST', body: { tipo_diploma: body.tipo_diploma, titulo: body.titulo, titulo_curto: body.titulo_curto, gabinete_id: body.gabinete_id } });
      await api(`/fpl/${fpl.id}/bloco-b`, { method: 'PATCH', body: {
        tipo_origem: body.tipo_origem,
        referencia_origem: body.referencia_origem || null,
        sintese_problema: body.sintese_problema || null,
        avaliacao_previa: body.avaliacao_previa ? parseInt(body.avaliacao_previa, 10) : null,
      } });
      try {
        await api(`/fpl/${fpl.id}/marcos/M0/validar`, { method: 'POST', body: {} });
        toast('FPL criada e M0 validado.', 'success');
      } catch (e) {
        toast('FPL criada. M0 não validado: ' + (e.data?.pendencias?.[0]?.detalhe || e.message), 'warning');
      }
      limparRascunho(RASCUNHO_KEY);
      setView('detalhe', { fplId: fpl.id });
    } catch (err) {
      toast('Falha ao criar: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });
}
