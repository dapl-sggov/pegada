// wizard-audicoes.js — Modal único para criar/editar audições (D.1 e D.2)
// e para ingerir JSON do INTEGRA (D.3). Substitui o antigo wizard-bloco-d.

import { api } from './api.js';
import { state } from './state.js';
import { toast, esc } from './utils.js';

function modal(html, onSubmit) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(back);
  back.querySelector('[data-cancel]')?.addEventListener('click', () => back.remove());
  back.addEventListener('click', e => { if (e.target === back) back.remove(); });
  const form = back.querySelector('form');
  if (form) form.addEventListener('submit', async e => {
    e.preventDefault();
    try { await onSubmit(new FormData(form)); back.remove(); }
    catch (err) { toast('Erro: ' + (err.message || ''), 'error'); }
  });
  return back;
}

export function abrirNovaAudicao(categoria, audicao = null) {
  const cat = categoria || 'OBRIGATORIA';
  const editar = !!audicao;
  modal(`
    <h2 style="margin-bottom:14px">${editar ? 'Editar audição' : 'Nova audição'} · ${cat === 'OBRIGATORIA' ? 'D.1 Obrigatória' : 'D.2 GSEPCM'}</h2>
    <form>
      <input type="hidden" name="categoria" value="${cat}">
      <div class="form-row">
        <label>Entidade</label>
        <input type="text" name="entidade" value="${esc(audicao?.entidade || '')}" required>
      </div>
      ${cat === 'OBRIGATORIA' ? `
      <div class="form-row">
        <label>Base legal (artigo / diploma que impõe a audição)</label>
        <input type="text" name="base_legal" value="${esc(audicao?.base_legal || '')}" placeholder="Ex.: Lei do CES, art. 8.º">
      </div>` : ''}
      <div class="form-row">
        <label>Forma</label>
        <select name="forma">
          <option value="">—</option>
          <option value="AUDIENCIA" ${audicao?.forma === 'AUDIENCIA' ? 'selected' : ''}>Audiência</option>
          <option value="ESCRITA" ${audicao?.forma === 'ESCRITA' ? 'selected' : ''}>Escrita</option>
          <option value="OUTRO" ${audicao?.forma === 'OUTRO' ? 'selected' : ''}>Outro</option>
        </select>
      </div>
      <div class="form-row two-col">
        <div>
          <label>Data do pedido</label>
          <input type="date" name="data_pedido" value="${audicao?.data_pedido || ''}">
        </div>
        <div>
          <label>Data da resposta</label>
          <input type="date" name="data_resposta" value="${audicao?.data_resposta || ''}">
        </div>
      </div>
      <div class="form-row">
        <label>Estado</label>
        <select name="estado">
          <option value="PEDIDA"        ${audicao?.estado === 'PEDIDA' ? 'selected' : ''}>Pedida</option>
          <option value="RESPONDEU"     ${audicao?.estado === 'RESPONDEU' ? 'selected' : ''}>Respondeu</option>
          <option value="DISPENSOU"     ${audicao?.estado === 'DISPENSOU' ? 'selected' : ''}>Dispensou-se</option>
          <option value="SEM_RESPOSTA"  ${audicao?.estado === 'SEM_RESPOSTA' ? 'selected' : ''}>Sem resposta</option>
        </select>
      </div>
      <div class="form-row">
        <label>Síntese da posição</label>
        <textarea name="sintese_posicao" rows="3">${esc(audicao?.sintese_posicao || '')}</textarea>
      </div>
      <div class="form-row">
        <label>Decisão sobre incorporação</label>
        <textarea name="decisao_incorporacao" rows="2">${esc(audicao?.decisao_incorporacao || '')}</textarea>
      </div>
      <div class="form-row">
        <label>Justificação da decisão (≥ 100 c)</label>
        <textarea name="justificacao_decisao" rows="3">${esc(audicao?.justificacao_decisao || '')}</textarea>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" data-cancel>Cancelar</button>
        <button type="submit" class="btn primary">${editar ? 'Guardar' : 'Adicionar'}</button>
      </div>
    </form>
  `, async (fd) => {
    const body = Object.fromEntries(fd.entries());
    Object.keys(body).forEach(k => { if (body[k] === '') body[k] = null; });
    if (editar) {
      await api(`/fpl/${state.fpl.id}/audicoes/${audicao.id}`, { method: 'PATCH', body });
      toast('Audição atualizada', 'success');
    } else {
      await api(`/fpl/${state.fpl.id}/audicoes`, { method: 'POST', body });
      toast('Audição adicionada', 'success');
    }
    const { loadFpl } = await import('./data.js');
    await loadFpl(state.fpl.id);
    location.hash = '#/fpl/' + state.fpl.id;
  });
}

export function abrirImportarIntegra() {
  modal(`
    <h2 style="margin-bottom:14px">Importar JSON do INTEGRA · D.3</h2>
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px">
      Cole o JSON exportado pelo INTEGRA da UnIT. Formato esperado:<br>
      <code style="font-size:11px">{ "gabinete": "MAEN", "entradas": [...] }</code>
    </p>
    <form>
      <div class="form-row">
        <textarea name="json" rows="14" placeholder='{"gabinete":"MAEN","entradas":[{"data":"2026-02-01","entidade":"...","objeto":"..."}]}' required style="font-family:monospace;font-size:12px"></textarea>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" data-cancel>Cancelar</button>
        <button type="submit" class="btn primary">Importar</button>
      </div>
    </form>
  `, async (fd) => {
    let json;
    try { json = JSON.parse(fd.get('json')); }
    catch { throw new Error('JSON inválido'); }
    const r = await api(`/fpl/${state.fpl.id}/integra`, { method: 'POST', body: json });
    toast(`Importadas ${r.inseridos} interações de ${r.gabinete}`, 'success');
    const { loadFpl } = await import('./data.js');
    await loadFpl(state.fpl.id);
    location.hash = '#/fpl/' + state.fpl.id;
  });
}

export async function eliminarAudicao(audId) {
  if (!confirm('Eliminar esta audição?')) return;
  await api(`/fpl/${state.fpl.id}/audicoes/${audId}`, { method: 'DELETE' });
  toast('Audição eliminada', 'success');
  const { loadFpl } = await import('./data.js');
  await loadFpl(state.fpl.id);
  location.hash = '#/fpl/' + state.fpl.id;
}
