// wizard-audicoes.js — Modais para criar/editar audições (D.1 e D.2) e
// ingerir JSON do INTEGRA (D.3). Usa o openModal()/closeModal() globais.

import { api } from './api.js';
import { state } from './state.js';
import { toast, esc, openModal, closeModal } from './utils.js';

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

export function abrirNovaAudicao(categoria, audicao = null) {
  const cat = categoria || 'OBRIGATORIA';
  const editar = !!audicao;
  const subt = cat === 'OBRIGATORIA' ? 'D.1 · Obrigatória' : 'D.2 · GSEPCM';

  openModal(`
    <div class="modal-head">
      <div>
        <h3>${editar ? 'Editar audição' : 'Nova audição'}</h3>
        <div class="modal-subtitle">${subt}</div>
      </div>
      <button class="btn-icon" onclick="closeModal()" aria-label="Fechar">✕</button>
    </div>
    <form id="formAudicao">
      <div class="modal-body">
        <input type="hidden" name="categoria" value="${cat}">

        <div class="field"><label>Entidade *</label>
          <input type="text" name="entidade" value="${esc(audicao?.entidade || '')}" required placeholder="Ex.: Conselho Económico e Social">
        </div>

        ${cat === 'OBRIGATORIA' ? `
        <div class="field"><label>Base legal</label>
          <input type="text" name="base_legal" value="${esc(audicao?.base_legal || '')}" placeholder="Ex.: Lei do CES, art. 8.º">
          <div class="help">Artigo ou diploma que impõe a audição.</div>
        </div>` : ''}

        <div class="field-grid">
          <div class="field"><label>Forma</label>
            <select name="forma">
              <option value="">—</option>
              <option value="AUDIENCIA" ${audicao?.forma === 'AUDIENCIA' ? 'selected' : ''}>Audiência</option>
              <option value="ESCRITA" ${audicao?.forma === 'ESCRITA' ? 'selected' : ''}>Escrita</option>
              <option value="OUTRO" ${audicao?.forma === 'OUTRO' ? 'selected' : ''}>Outro</option>
            </select>
          </div>
          <div class="field"><label>Estado</label>
            <select name="estado">
              <option value="PEDIDA"       ${audicao?.estado === 'PEDIDA' ? 'selected' : ''}>Pedida</option>
              <option value="RESPONDEU"    ${audicao?.estado === 'RESPONDEU' ? 'selected' : ''}>Respondeu</option>
              <option value="DISPENSOU"    ${audicao?.estado === 'DISPENSOU' ? 'selected' : ''}>Dispensou-se</option>
              <option value="SEM_RESPOSTA" ${audicao?.estado === 'SEM_RESPOSTA' ? 'selected' : ''}>Sem resposta</option>
            </select>
          </div>
          <div class="field"><label>Data do pedido</label>
            <input type="date" name="data_pedido" value="${audicao?.data_pedido || ''}">
          </div>
          <div class="field"><label>Data da resposta</label>
            <input type="date" name="data_resposta" value="${audicao?.data_resposta || ''}">
          </div>
        </div>

        <div class="field"><label>Síntese da posição</label>
          <textarea name="sintese_posicao" rows="4" placeholder="O que disse a entidade ouvida...">${esc(audicao?.sintese_posicao || '')}</textarea>
        </div>

        <div class="field"><label>Decisão sobre incorporação</label>
          <textarea name="decisao_incorporacao" rows="2" placeholder="Incorporada / Parcialmente / Não incorporada — com texto explicativo">${esc(audicao?.decisao_incorporacao || '')}</textarea>
        </div>

        <div class="field"><label>Justificação da decisão</label>
          <textarea name="justificacao_decisao" rows="4" placeholder="Justificação fundamentada (mín. 100 caracteres se houver decisão)">${esc(audicao?.justificacao_decisao || '')}</textarea>
          <div class="help">Obrigatória quando há decisão preenchida — mínimo 100 caracteres.</div>
        </div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn ghost" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn primary">${editar ? 'Guardar alterações' : 'Adicionar audição'}</button>
      </div>
    </form>
  `);

  bindFormSubmit(async (fd) => {
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
    const { renderRoot } = await import('./render.js');
    renderRoot();
  });
}

export function abrirImportarIntegra() {
  openModal(`
    <div class="modal-head">
      <div>
        <h3>Importar JSON do INTEGRA</h3>
        <div class="modal-subtitle">D.3 · Interações pré-processo registadas pelos gabinetes na tab "Pegada legislativa" do INTEGRA</div>
      </div>
      <button class="btn-icon" onclick="closeModal()" aria-label="Fechar">✕</button>
    </div>
    <form id="formImportIntegra">
      <div class="modal-body">
        <div class="alert info">
          <div>
            <span class="at">Formato esperado</span>
            <code class="mono small">{ "gabinete": "MAEN", "entradas": [{ "data": "...", "entidade": "...", "objeto": "...", "sintese": "..." }] }</code>
          </div>
        </div>

        <div class="field">
          <label>Cole aqui o conteúdo do ficheiro JSON</label>
          <textarea name="json" rows="14" required placeholder='{"gabinete":"MAEN","entradas":[{"data":"2026-02-01","entidade":"...","objeto":"...","sintese":"..."}]}' style="font-family:var(--font-mono);font-size:12px"></textarea>
          <div class="help">Em produção, este JSON é lido automaticamente da pasta OneDrive da UnIT sincronizada na RING.</div>
        </div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn ghost" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn primary">Importar</button>
      </div>
    </form>
  `);

  bindFormSubmit(async (fd) => {
    let json;
    try { json = JSON.parse(fd.get('json')); }
    catch { throw new Error('JSON inválido — verifique a sintaxe'); }
    const r = await api(`/fpl/${state.fpl.id}/integra`, { method: 'POST', body: json });
    toast(`Importadas ${r.inseridos} interações de ${r.gabinete}`, 'success');
    const { loadFpl } = await import('./data.js');
    await loadFpl(state.fpl.id);
    const { renderRoot } = await import('./render.js');
    renderRoot();
  });
}

export async function eliminarAudicao(audId) {
  if (!confirm('Eliminar esta audição? Esta ação não pode ser desfeita.')) return;
  try {
    await api(`/fpl/${state.fpl.id}/audicoes/${audId}`, { method: 'DELETE' });
    toast('Audição eliminada', 'success');
    const { loadFpl } = await import('./data.js');
    await loadFpl(state.fpl.id);
    const { renderRoot } = await import('./render.js');
    renderRoot();
  } catch (e) { toast('Falha: ' + e.message, 'error'); }
}
