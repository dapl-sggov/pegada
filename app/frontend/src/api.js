// api.js — Camada HTTP. Único ponto que conhece o transporte.
//
// `api(path, opts)` usa fetch nativo e propaga erros como Error com `.status`
// e `.data` (corpo da resposta) para tratamento uniforme nos chamadores.
// CSRF: para qualquer método de mutação acrescenta o header double-submit
// a partir do cookie `fpl_csrf`.

export const API = '/api';

export function getCookie(name) {
  return document.cookie.split('; ').find(c => c.startsWith(name + '='))?.split('=')[1] || '';
}

export async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (!['GET', 'HEAD', 'OPTIONS'].includes((opts.method || 'GET').toUpperCase())) {
    const tok = getCookie('fpl_csrf');
    if (tok) headers['x-csrf-token'] = tok;
  }
  const res = await fetch(API + path, {
    method: opts.method || 'GET',
    credentials: 'include',
    headers,
    body: opts.body !== undefined ? (opts.rawBody ? opts.body : JSON.stringify(opts.body)) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const err = new Error(data?.error || res.statusText);
    err.status = res.status; err.data = data;
    throw err;
  }
  return data;
}

export async function uploadFile(path, file, extras = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(extras)) fd.append(k, v);
  fd.append('file', file);
  const headers = { 'x-csrf-token': getCookie('fpl_csrf') };
  const res = await fetch(API + path, { method: 'POST', credentials: 'include', headers, body: fd });
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const err = new Error(data?.error || res.statusText); err.status = res.status; err.data = data; throw err;
  }
  return data;
}
