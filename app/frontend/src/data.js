// data.js — Funções de carregamento que populam o `state`.
// São chamadas pelas vistas; nenhuma renderização aqui.

import { api } from './api.js';
import { state, isSggov } from './state.js';

export async function loadGabinetes() {
  if (state.gabinetes.length === 0) state.gabinetes = await api('/gabinetes');
}

export async function loadFpls() {
  const out = await api('/fpl');
  state.fpls = out.items || [];
}

export async function loadFpl(id) {
  state.fpl = await api('/fpl/' + id);
  state.versoes = await api(`/fpl/${id}/versoes`).catch(() => []);
  state.eventos = await api(`/fpl/${id}/eventos`).catch(() => []);
  state.anexos = await api(`/fpl/${id}/anexos`).catch(() => []);
  state.auditorias = await api(`/fpl/${id}/auditoria`).catch(() => []);
  state.comprovativos = await api(`/fpl/${id}/comprovativos`).catch(() => []);
}

export async function loadDashboard() {
  state.dashboard = isSggov() ? await api('/admin/dashboard').catch(() => null) : null;
}
