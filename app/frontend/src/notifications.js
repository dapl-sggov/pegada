// notifications.js — Atualização do badge + canal SSE para notificações
// em tempo real (com fallback para polling se SSE não estiver disponível).

import { api, getCookie } from './api.js';
import { state } from './state.js';
import { toast } from './utils.js';

let _pollHandle = null;
let _sse = null;

export async function pollNotificacoes() {
  if (!state.user) return;
  try {
    const r = await api('/notificacoes');
    const before = state.notificacoes.nao_lidas;
    state.notificacoes = r;
    atualizarBadge(r.nao_lidas);
    if (r.nao_lidas > before && before !== undefined) {
      toast('Tem ' + (r.nao_lidas - before) + ' nova(s) notificação(ões).', 'info');
    }
  } catch {}
}

function atualizarBadge(naoLidas) {
  const bell = document.querySelector('.bell');
  if (!bell) return;
  const old = bell.querySelector('.bell-badge');
  if (old) old.remove();
  if (naoLidas > 0) {
    const b = document.createElement('span');
    b.className = 'bell-badge';
    b.textContent = naoLidas;
    b.setAttribute('aria-hidden', 'true');
    bell.appendChild(b);
  }
  bell.setAttribute('aria-label', 'Notificações' + (naoLidas > 0 ? ' (' + naoLidas + ' não lidas)' : ''));
}

/**
 * Inicia o canal SSE. Se o servidor não suportar (404), cai para polling
 * de 30 s. Idempotente — chamadas subsequentes são no-op enquanto o canal
 * estiver vivo.
 */
export function iniciarCanalNotificacoes() {
  if (_sse || _pollHandle) return;
  if (typeof EventSource === 'undefined') return ativarPolling();
  try {
    _sse = new EventSource('/api/notificacoes/stream', { withCredentials: true });
    _sse.addEventListener('nova', (ev) => {
      try {
        const n = JSON.parse(ev.data);
        state.notificacoes.nao_lidas = (state.notificacoes.nao_lidas || 0) + 1;
        state.notificacoes.items = [n, ...(state.notificacoes.items || [])].slice(0, 50);
        atualizarBadge(state.notificacoes.nao_lidas);
        toast(n.titulo || 'Nova notificação', 'info');
      } catch {}
    });
    _sse.addEventListener('ping', () => { /* keep-alive */ });
    _sse.onerror = () => {
      // Servidor não suporta ou ligação caiu — fecha e cai para polling
      _sse?.close(); _sse = null;
      ativarPolling();
    };
    // primeira sincronização imediata para o badge
    pollNotificacoes();
  } catch {
    ativarPolling();
  }
}

function ativarPolling() {
  if (_pollHandle) return;
  pollNotificacoes();
  _pollHandle = setInterval(pollNotificacoes, 30_000);
}

export function pararCanalNotificacoes() {
  _sse?.close(); _sse = null;
  if (_pollHandle) { clearInterval(_pollHandle); _pollHandle = null; }
}
