import crypto from 'crypto';

export const uuid = () => crypto.randomUUID();

export const nowISO = () => new Date().toISOString();

export function jsonStringify(obj) {
  return JSON.stringify(obj);
}

export function safeJsonParse(s, fallback = null) {
  if (!s) return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
}

export function paginate(arr, page = 1, perPage = 20) {
  const start = (page - 1) * perPage;
  return {
    items: arr.slice(start, start + perPage),
    total: arr.length,
    page,
    perPage,
    totalPages: Math.ceil(arr.length / perPage),
  };
}
