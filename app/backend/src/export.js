// export.js — Exportação de FPL publicadas para o Portal do Governo.
//
// A aplicação FPL é confinada à RING e NÃO serve a face pública. Após o marco
// M5, gera pacotes estruturados que são transferidos para o Portal do Governo,
// onde ficam acessíveis ao público ao lado da Agenda Pública dos membros do
// Governo (RCM v2, n.º 9). Estes endpoints são acessíveis a partir da RING,
// por papéis SGGOV.

import { db } from './db.js';
import { safeJsonParse } from './util.js';
import { listarComprovativos } from './comprovativo.js';

// Apenas os campos com visibilidade pública entram nos pacotes de exportação.
function vistaPublica(f, blocoD, comprovativos) {
  return {
    numero_processo: f.numero_processo,
    tipo_diploma: f.tipo_diploma,
    titulo: f.titulo,
    titulo_curto: f.titulo_curto,
    gabinete: { sigla: f.gabinete_sigla, nome: f.gabinete_nome },
    estado: f.estado_workflow,
    referencia_dr: f.referencia_dr,
    data_publicacao: f.data_publicacao,
    origem: { tipo: f.tipo_origem, referencia: f.referencia_origem },
    sintese_problema: f.sintese_problema,
    consulta_publica: f.consulta_lex_ref ? {
      referencia: f.consulta_lex_ref, inicio: f.consulta_lex_inicio, fim: f.consulta_lex_fim,
      n_contributos: f.consulta_lex_n_contributos, sintese: f.consulta_lex_sintese, decisao: f.consulta_lex_decisao,
    } : null,
    interacoes_externas: (blocoD || []).map(d => ({
      data: d.data, forma: d.forma, entidade: d.entidade_designacao, rtri_id: d.rtri_id,
      natureza_juridica: d.natureza_juridica, pessoas_governo: safeJsonParse(d.pessoas_governo, []),
      objeto: d.objeto, sintese_posicao: d.sintese_posicao,
      decisao_incorporacao: d.decisao_incorporacao, justificacao: d.justificacao_decisao,
    })),
    marcos: {
      M0: f.m0_validado_em, M1: f.m1_validado_em, M2: f.m2_validado_em,
      M3: f.m3_validado_em, M4: f.m4_validado_em, M5: f.m5_validado_em,
    },
    comprovativos: (comprovativos || []).map(c => ({ marco: c.marco, jti: c.jti, emitido_em: c.emitido_em, estado: c.estado })),
  };
}

export async function listarPublicadas({ gabinete, tipo, q } = {}) {
  let sql = `SELECT f.id, f.numero_processo, f.tipo_diploma, f.titulo, f.titulo_curto,
                    f.referencia_dr, f.data_publicacao, f.tipo_origem,
                    g.sigla as gabinete_sigla, g.nome as gabinete_nome
             FROM fpl f JOIN gabinete g ON g.id = f.gabinete_id
             WHERE f.estado_workflow = 'PUBLICADO'`;
  const params = [];
  if (gabinete) { sql += ' AND g.sigla = ?'; params.push(gabinete); }
  if (tipo) { sql += ' AND f.tipo_diploma = ?'; params.push(tipo); }
  if (q) { sql += ' AND (f.titulo LIKE ? OR f.numero_processo LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY f.data_publicacao DESC LIMIT 200';
  return db.all(sql, params);
}

export async function pacoteFpl(id) {
  const f = await db.get(
    `SELECT f.*, g.sigla as gabinete_sigla, g.nome as gabinete_nome
     FROM fpl f JOIN gabinete g ON g.id = f.gabinete_id WHERE f.id = ?`, [id]
  );
  if (!f || f.estado_workflow !== 'PUBLICADO') return null;
  const blocoD = await db.all('SELECT * FROM entrada_bloco_d WHERE fpl_id = ? ORDER BY data', [id]);
  const comprovativos = await listarComprovativos(id);
  return vistaPublica(f, blocoD, comprovativos);
}

export async function loteDesde(desdeISO) {
  let sql = `SELECT id FROM fpl WHERE estado_workflow = 'PUBLICADO'`;
  const params = [];
  if (desdeISO) { sql += ' AND data_publicacao >= ?'; params.push(desdeISO); }
  sql += ' ORDER BY data_publicacao DESC';
  const ids = await db.all(sql, params);
  const items = [];
  for (const { id } of ids) { const p = await pacoteFpl(id); if (p) items.push(p); }
  return { gerado_em: new Date().toISOString(), total: items.length, items };
}

export async function datasetJson() {
  const ids = await db.all("SELECT id FROM fpl WHERE estado_workflow = 'PUBLICADO' ORDER BY data_publicacao DESC");
  const items = [];
  for (const { id } of ids) { const p = await pacoteFpl(id); if (p) items.push(p); }
  return { gerado_em: new Date().toISOString(), total: items.length, items };
}

export async function datasetCsv() {
  const all = await db.all(
    `SELECT f.numero_processo, f.tipo_diploma, f.titulo, g.sigla as gabinete,
            f.data_publicacao, f.referencia_dr, f.tipo_origem
     FROM fpl f JOIN gabinete g ON g.id = f.gabinete_id
     WHERE f.estado_workflow = 'PUBLICADO' ORDER BY f.data_publicacao DESC`
  );
  const headers = ['numero_processo', 'tipo_diploma', 'titulo', 'gabinete', 'data_publicacao', 'referencia_dr', 'tipo_origem'];
  const lines = [headers.join(',')];
  for (const r of all) {
    lines.push(headers.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(','));
  }
  return lines.join('\n');
}

// JSON-LD com vocabulário aderente ao modelo OCDE para legislative footprint.
export async function datasetJsonLd() {
  const all = await db.all(
    `SELECT f.*, g.sigla as gabinete_sigla, g.nome as gabinete_nome
     FROM fpl f JOIN gabinete g ON g.id = f.gabinete_id
     WHERE f.estado_workflow = 'PUBLICADO' ORDER BY f.data_publicacao DESC`
  );
  const items = [];
  for (const f of all) {
    const blocoD = await db.all('SELECT * FROM entrada_bloco_d WHERE fpl_id = ?', [f.id]);
    items.push({
      '@type': 'LegislativeFootprint',
      'identifier': f.numero_processo,
      'instrumentType': f.tipo_diploma,
      'title': f.titulo,
      'proponent': { '@type': 'GovernmentBody', 'name': f.gabinete_nome, 'identifier': f.gabinete_sigla },
      'origin': f.tipo_origem,
      'publishedAt': f.data_publicacao,
      'officialReference': f.referencia_dr,
      'externalConsultations': blocoD.map(d => ({
        '@type': 'StakeholderInteraction',
        'date': d.data, 'form': d.forma,
        'stakeholder': { 'name': d.entidade_designacao, 'transparencyRegisterId': d.rtri_id, 'natureCategory': d.natureza_juridica },
        'subject': d.objeto, 'positionSummary': d.sintese_posicao,
        'incorporationDecision': d.decisao_incorporacao, 'incorporationRationale': d.justificacao_decisao,
      })),
    });
  }
  return {
    '@context': {
      '@vocab': 'https://transparencia.gov.pt/fpl/vocab#',
      'OECD': 'https://oecd.org/legislative-footprint/2024/',
    },
    '@type': 'LegislativeFootprintCollection',
    'generatedAt': new Date().toISOString(),
    'count': items.length,
    'items': items,
  };
}
