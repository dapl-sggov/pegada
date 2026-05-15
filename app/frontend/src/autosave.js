// autosave.js — Drafts automáticos guardados em localStorage.
//
// API:
//   ligarAutosave(formEl, key, indicadorEl?)
//     • escuta input/change e guarda { campo: valor } em localStorage
//     • debounce de 500 ms; flush imediato no `change` e em `beforeunload`
//     • atualiza o indicador visual ("a guardar" → "guardado às HH:MM")
//   lerRascunho(key)
//     • devolve o objeto guardado ou null
//   limparRascunho(key)
//     • remove o rascunho
//
// Por que localStorage e não server-side?
//   • Trabalho independente da sessão SSO (não bloqueia se a app reiniciar)
//   • Zero round-trip — escrita instantânea
//   • Para drafts entre dispositivos, em v2.0 sincronizar via /api/drafts
//
// Convenção de chaves: prefixo `fpl_draft_<key>` para isolar de outras
// aplicações no mesmo domínio. Cada chave ID — 'nova-fpl', 'd-<fplId>',
// 'b-<fplId>' — corresponde a um formulário/contexto distinto.

const PREFIXO = 'fpl_draft_';

export function lerRascunho(key) {
  try {
    const raw = localStorage.getItem(PREFIXO + key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return obj?.dados || null;
  } catch { return null; }
}

export function guardarRascunho(key, dados) {
  try {
    localStorage.setItem(PREFIXO + key, JSON.stringify({ ts: Date.now(), dados }));
  } catch { /* quota cheia, ignora */ }
}

export function limparRascunho(key) {
  try { localStorage.removeItem(PREFIXO + key); } catch {}
}

/**
 * Liga o autosave a um <form>. Devolve uma função `parar()` que desliga.
 *
 * O snapshot do formulário é serializado com FormData → objeto. Inputs
 * sem `name` são ignorados. Campos sensíveis (passwords, ficheiros) são
 * excluídos por defesa adicional.
 */
export function ligarAutosave(formEl, key, indicadorEl) {
  if (!formEl) return () => {};
  let timer = null;

  const snapshot = () => {
    const fd = new FormData(formEl);
    const obj = {};
    for (const [k, v] of fd.entries()) {
      // Excluir tipos sensíveis ou inúteis
      const el = formEl.elements[k];
      if (!el) { obj[k] = v; continue; }
      const t = (Array.isArray(el) ? el[0] : el).type;
      if (t === 'password' || t === 'file') continue;
      obj[k] = v;
    }
    return obj;
  };

  const flush = () => {
    const dados = snapshot();
    guardarRascunho(key, dados);
    if (indicadorEl) {
      indicadorEl.textContent = '✓ Guardado às ' + new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
      indicadorEl.classList.add('saved');
      indicadorEl.classList.remove('saving');
    }
  };

  const onInput = () => {
    if (indicadorEl) {
      indicadorEl.textContent = 'A guardar…';
      indicadorEl.classList.add('saving');
      indicadorEl.classList.remove('saved');
    }
    clearTimeout(timer);
    timer = setTimeout(flush, 500);
  };

  const onChange = () => { clearTimeout(timer); flush(); };
  const onUnload = () => { try { flush(); } catch {} };

  formEl.addEventListener('input', onInput);
  formEl.addEventListener('change', onChange);
  window.addEventListener('beforeunload', onUnload);

  return () => {
    clearTimeout(timer);
    formEl.removeEventListener('input', onInput);
    formEl.removeEventListener('change', onChange);
    window.removeEventListener('beforeunload', onUnload);
  };
}

/**
 * Lista todos os drafts atualmente guardados (para um futuro botão
 * "Continuar onde parei").
 */
export function listarRascunhos() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(PREFIXO)) {
      try {
        const v = JSON.parse(localStorage.getItem(k));
        out.push({ key: k.slice(PREFIXO.length), ts: v.ts, dados: v.dados });
      } catch {}
    }
  }
  return out.sort((a, b) => b.ts - a.ts);
}
