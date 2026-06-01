// canonico.js — JSON canónico da FPL.
//
// Este é o ARTEFACTO CRÍTICO de substituibilidade do FPL Ponte. Tudo o que
// o sistema produz tem de poder ser reconstruído a partir deste JSON. É a
// "ABI" que oferecemos a quem vier a seguir (SmartLegis, Plataforma IntGov).
//
// Versão do schema: bumped quando muda a forma. A versão anterior fica
// sempre compreensível por consumers (campos só são acrescentados, não
// renomeados; remoções são feitas com migrações explícitas e ferramentas
// de tradução).
//
// Estrutura:
//
//   {
//     "schema": "fpl-ponte/v1",
//     "id": "...uuid...",
//     "numero_processo": "2026/MAEN/0001",
//     "criada_em": "ISO-8601",
//     "estado": "EM_CONSULTA_PUBLICA",
//     "gabinete": { "sigla": "MAEN", "nome": "..." },
//     "coproponentes": ["MS", "MF"],
//     "tipo_diploma": "DL",
//     "titulo": "...",
//     "titulo_curto": "...",
//
//     "blocos": {
//       "A": { ... identificação ... },
//       "B": { tipo_origem, referencia_origem, sintese_problema, avaliacao_previa },
//       "D1_audicoes_obrigatorias": [ {entidade, base_legal, ...} ],
//       "D2_audicoes_gsepcm":       [ {entidade, ...} ],
//       "D3_integra":               [ {gabinete_origem, payload, ...} ],
//       "E_consulta_publica":       { cl_link, cl_n_contributos, cl_sintese }
//     },
//
//     "marcos": {
//       "M0": { "em": "ISO", "por": "user-id" },
//       ...
//     },
//
//     "publicacao": { "referencia_dr": "...", "data": "ISO", "hash": "sha256..." },
//     "versao": 7
//   }

import { db } from './db.js';

export const SCHEMA_ID = 'fpl-ponte/v1';

function tryJson(s, fallback = null) {
  if (!s) return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
}

/**
 * Constrói o JSON canónico a partir do estado actual da BD.
 * Não-mutativo. Usado tanto pelo export como pelos snapshots de versão.
 */
export async function toCanonico(fplId) {
  const f = await db.get(
    `SELECT f.*, g.sigla as gab_sigla, g.nome as gab_nome
     FROM fpl f JOIN gabinete g ON g.id = f.gabinete_id WHERE f.id = ?`, [fplId]
  );
  if (!f) return null;
  const audicoes = await db.all('SELECT * FROM audicao WHERE fpl_id = ? ORDER BY data_pedido', [fplId]);
  const integra = await db.all('SELECT * FROM interacao_integra WHERE fpl_id = ? ORDER BY data_interacao', [fplId]);

  const semNullos = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== ''));

  return {
    schema: SCHEMA_ID,
    id: f.id,
    numero_processo: f.numero_processo,
    criada_em: f.data_criacao,
    estado: f.estado,
    versao: f.versao_atual,
    gabinete: { sigla: f.gab_sigla, nome: f.gab_nome },
    coproponentes: tryJson(f.coproponentes, []),
    tipo_diploma: f.tipo_diploma,
    titulo: f.titulo,
    titulo_curto: f.titulo_curto || undefined,

    blocos: {
      B: semNullos({
        tipo_origem: f.tipo_origem,
        referencia_origem: f.referencia_origem,
        sintese_problema: f.sintese_problema,
        avaliacao_previa: f.avaliacao_previa,
      }),
      D1_audicoes_obrigatorias: audicoes.filter(a => a.categoria === 'OBRIGATORIA').map(a => semNullos({
        id: a.id, entidade: a.entidade, base_legal: a.base_legal, forma: a.forma,
        data_pedido: a.data_pedido, data_resposta: a.data_resposta,
        estado: a.estado, sintese_posicao: a.sintese_posicao,
        decisao_incorporacao: a.decisao_incorporacao,
        justificacao_decisao: a.justificacao_decisao,
      })),
      D2_audicoes_gsepcm: audicoes.filter(a => a.categoria === 'GSEPCM').map(a => semNullos({
        id: a.id, entidade: a.entidade, forma: a.forma,
        data_pedido: a.data_pedido, data_resposta: a.data_resposta,
        estado: a.estado, sintese_posicao: a.sintese_posicao,
        decisao_incorporacao: a.decisao_incorporacao,
        justificacao_decisao: a.justificacao_decisao,
      })),
      D3_integra: integra.map(i => semNullos({
        id: i.id, gabinete_origem: i.gabinete_origem,
        data: i.data_interacao, entidade: i.entidade,
        payload: tryJson(i.payload, i.payload),
      })),
      E_consulta_publica: semNullos({
        cl_link: f.cl_link,
        cl_n_contributos: f.cl_n_contributos,
        cl_sintese: f.cl_sintese,
      }),
    },

    marcos: semNullos({
      M0: f.m0_em ? semNullos({ em: f.m0_em, por: f.m0_por }) : null,
      M2: f.m2_em ? { em: f.m2_em } : null,
      M3: f.m3_em ? { em: f.m3_em } : null,
      M4: f.m4_em ? semNullos({ em: f.m4_em, por: f.m4_por }) : null,
      M5: f.m5_em ? semNullos({ em: f.m5_em, por: f.m5_por }) : null,
    }),

    publicacao: f.referencia_dr || f.m5_em ? semNullos({
      referencia_dr: f.referencia_dr,
      data: f.data_publicacao,
      hash_sha256: f.hash_publicacao,
    }) : undefined,
  };
}

/**
 * Reconstroi/importa uma FPL a partir de um JSON canónico. Útil para
 * migração do sucessor de volta para o FPL Ponte (raro mas possível) e
 * para repor backups. Idempotente por `id` ou `numero_processo`.
 */
export async function fromCanonico(canon, user) {
  if (!canon || canon.schema !== SCHEMA_ID) {
    throw new Error(`Schema desconhecido: ${canon?.schema}`);
  }
  // Resolve gabinete pela sigla
  const gab = await db.get('SELECT id FROM gabinete WHERE sigla = ?', [canon.gabinete?.sigla]);
  if (!gab) throw new Error(`Gabinete ${canon.gabinete?.sigla} inexistente — provisione antes de importar`);

  const existente = await db.get('SELECT id FROM fpl WHERE id = ? OR numero_processo = ?',
    [canon.id, canon.numero_processo]);
  if (existente) {
    return { ok: false, motivo: 'FPL já existe', id: existente.id };
  }

  await db.run(
    `INSERT INTO fpl (id, numero_processo, tipo_diploma, titulo, titulo_curto,
                      gabinete_id, coproponentes, estado,
                      tipo_origem, referencia_origem, sintese_problema, avaliacao_previa,
                      cl_link, cl_n_contributos, cl_sintese,
                      referencia_dr, data_publicacao,
                      m0_em, m0_por, m2_em, m3_em, m4_em, m4_por, m5_em, m5_por,
                      hash_publicacao, versao_atual, criado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?,
             ?, ?, ?, ?,
             ?, ?, ?,
             ?, ?,
             ?, ?, ?, ?, ?, ?, ?, ?,
             ?, ?, ?)`,
    [canon.id, canon.numero_processo, canon.tipo_diploma, canon.titulo, canon.titulo_curto || null,
     gab.id, canon.coproponentes?.length ? JSON.stringify(canon.coproponentes) : null, canon.estado,
     canon.blocos?.B?.tipo_origem || null, canon.blocos?.B?.referencia_origem || null,
     canon.blocos?.B?.sintese_problema || null, canon.blocos?.B?.avaliacao_previa ?? null,
     canon.blocos?.E_consulta_publica?.cl_link || null,
     canon.blocos?.E_consulta_publica?.cl_n_contributos ?? null,
     canon.blocos?.E_consulta_publica?.cl_sintese || null,
     canon.publicacao?.referencia_dr || null, canon.publicacao?.data || null,
     canon.marcos?.M0?.em || null, canon.marcos?.M0?.por || null,
     canon.marcos?.M2?.em || null, canon.marcos?.M3?.em || null,
     canon.marcos?.M4?.em || null, canon.marcos?.M4?.por || null,
     canon.marcos?.M5?.em || null, canon.marcos?.M5?.por || null,
     canon.publicacao?.hash_sha256 || null, canon.versao || 1, user?.id || null]
  );
  // Audições D.1 + D.2
  for (const cat of ['D1_audicoes_obrigatorias', 'D2_audicoes_gsepcm']) {
    const categoria = cat === 'D1_audicoes_obrigatorias' ? 'OBRIGATORIA' : 'GSEPCM';
    for (const a of (canon.blocos?.[cat] || [])) {
      await db.run(
        `INSERT INTO audicao (id, fpl_id, categoria, entidade, base_legal, forma,
                              data_pedido, data_resposta, estado,
                              sintese_posicao, decisao_incorporacao, justificacao_decisao)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [a.id || (await import('./util.js')).uuid(), canon.id, categoria,
         a.entidade, a.base_legal || null, a.forma || null,
         a.data_pedido || null, a.data_resposta || null,
         a.estado || 'PEDIDA',
         a.sintese_posicao || null, a.decisao_incorporacao || null, a.justificacao_decisao || null]
      );
    }
  }
  // D.3 INTEGRA
  for (const i of (canon.blocos?.D3_integra || [])) {
    await db.run(
      `INSERT INTO interacao_integra (id, fpl_id, gabinete_origem, payload, data_interacao, entidade, importado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [i.id || (await import('./util.js')).uuid(), canon.id,
       i.gabinete_origem, JSON.stringify(i.payload || {}),
       i.data || null, i.entidade || null, user?.id || null]
    );
  }
  return { ok: true, id: canon.id, numero: canon.numero_processo };
}

/** Listagem de canónicos para um conjunto de FPLs (export em massa). */
export async function listarCanonicos({ estado, gabinete_id, desde } = {}) {
  let sql = 'SELECT id FROM fpl WHERE 1=1';
  const params = [];
  if (estado) { sql += ' AND estado = ?'; params.push(estado); }
  if (gabinete_id) { sql += ' AND gabinete_id = ?'; params.push(gabinete_id); }
  if (desde) { sql += ' AND data_criacao >= ?'; params.push(desde); }
  const rows = await db.all(sql, params);
  const out = [];
  for (const r of rows) out.push(await toCanonico(r.id));
  return out;
}
