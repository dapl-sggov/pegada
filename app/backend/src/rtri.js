// RTRI mock — pesquisa local sobre cache de entidades (substitui API da AR enquanto não existir)
import { db } from './db.js';

export function pesquisarRtri(q, limit = 10) {
  if (!q || q.length < 2) return [];
  const like = `%${q}%`;
  return db.prepare(`
    SELECT rtri_id, designacao, natureza_juridica, ativo, data_inscricao
    FROM entidade_rtri
    WHERE ativo = 1 AND (designacao LIKE ? OR rtri_id LIKE ?)
    ORDER BY designacao LIMIT ?
  `).all(like, like, limit);
}

export function obterEntidade(rtriId) {
  return db.prepare('SELECT * FROM entidade_rtri WHERE rtri_id = ?').get(rtriId);
}

export function listarTodas(limit = 200) {
  return db.prepare('SELECT * FROM entidade_rtri WHERE ativo = 1 ORDER BY designacao LIMIT ?').all(limit);
}
