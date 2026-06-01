// workflow.js — Máquina de estados simplificada.
//
// Estados:  RASCUNHO → EM_RSE → EM_CONSULTA_PUBLICA → EM_CM → APROVADO → PUBLICADO
//
// Marcos (transições, todos com mesmo peso — sem selo criptográfico):
//   M0 · Abertura                (RASCUNHO → EM_RSE)
//   M1 · Pré-RSE                  apagado: M0 já assume pré-RSE neste modelo simplificado
//   M2 · Abertura CP             (EM_RSE → EM_CONSULTA_PUBLICA)
//   M3 · Encerramento CP         (informativo, mantém EM_CONSULTA_PUBLICA)
//   M4 · Pré-CM                  (EM_CONSULTA_PUBLICA → EM_CM)
//   M5 · Publicação              (APROVADO → PUBLICADO)  · grava hash do snapshot
//
// Decisão: removemos M1 porque o sistema é temporário e M0 já carrega a
// validação inicial de qualidade do Bloco B e D. Manter M1 era redundância
// pesada herdada do design anterior com selos criptográficos.

import { db } from './db.js';

export const ESTADOS = [
  'RASCUNHO', 'EM_RSE', 'EM_CONSULTA_PUBLICA', 'EM_CM',
  'APROVADO', 'PUBLICADO', 'ARQUIVADO',
];

const TRANSICOES = {
  M0: { from: ['RASCUNHO'], to: 'EM_RSE' },
  M2: { from: ['EM_RSE'], to: 'EM_CONSULTA_PUBLICA' },
  M3: { from: ['EM_CONSULTA_PUBLICA'], to: 'EM_CONSULTA_PUBLICA' },
  M4: { from: ['EM_CONSULTA_PUBLICA'], to: 'EM_CM' },
  M5: { from: ['APROVADO'], to: 'PUBLICADO' },
};

export const MARCOS = Object.keys(TRANSICOES);

const MIN_SINTESE_PROBLEMA = 200;
const MIN_OBJETO_AUD = 50;
const MIN_SINTESE_AUD = 100;
const MIN_JUSTIFICACAO_AUD = 100;
const MIN_CL_SINTESE = 200;

/**
 * Avalia se a FPL cumpre os requisitos do marco. Devolve { ok, pendencias[] }.
 */
export async function validarMarco(fpl, marco) {
  const pendencias = [];
  const trans = TRANSICOES[marco];
  if (!trans) return { ok: false, pendencias: [{ campo: 'marco', regra: 'desconhecido', detalhe: marco }] };
  if (!trans.from.includes(fpl.estado)) {
    return { ok: false, pendencias: [{
      campo: 'estado', regra: 'transicao_invalida',
      detalhe: `Estado atual ${fpl.estado}; ${marco} requer um de [${trans.from.join(', ')}]`,
    }]};
  }

  if (marco === 'M0') {
    if (!fpl.tipo_origem) pendencias.push({ campo: 'tipo_origem', regra: 'obrigatorio', detalhe: 'Bloco B: tipo de origem' });
    if (!fpl.sintese_problema || fpl.sintese_problema.length < MIN_SINTESE_PROBLEMA) {
      pendencias.push({ campo: 'sintese_problema', regra: 'minimo',
        detalhe: `Bloco B: síntese do problema (mín. ${MIN_SINTESE_PROBLEMA}c; tem ${fpl.sintese_problema?.length || 0})` });
    }
  }

  if (marco === 'M2') {
    if (!fpl.cl_link) pendencias.push({ campo: 'cl_link', regra: 'obrigatorio', detalhe: 'Bloco E: link da consulta na ConsultaLex' });
  }

  if (marco === 'M3') {
    if (!fpl.cl_n_contributos && fpl.cl_n_contributos !== 0) {
      pendencias.push({ campo: 'cl_n_contributos', regra: 'obrigatorio', detalhe: 'Bloco E: n.º de contributos' });
    }
    if (!fpl.cl_sintese || fpl.cl_sintese.length < MIN_CL_SINTESE) {
      pendencias.push({ campo: 'cl_sintese', regra: 'minimo',
        detalhe: `Bloco E: síntese e decisão (mín. ${MIN_CL_SINTESE}c)` });
    }
  }

  if (marco === 'M4') {
    if (!fpl.m3_em) pendencias.push({ campo: 'M3', regra: 'pre_requisito', detalhe: 'M3 não validado' });
    // Audições com resposta têm de ter decisão + justificação preenchidas
    const audicoesAbertas = await db.all(
      `SELECT id, entidade, estado, decisao_incorporacao, justificacao_decisao
       FROM audicao WHERE fpl_id = ?`, [fpl.id]
    );
    audicoesAbertas.forEach((a, i) => {
      if (a.estado === 'RESPONDEU') {
        if (!a.decisao_incorporacao) {
          pendencias.push({ campo: `audicao.${a.id}.decisao`, regra: 'obrigatorio_pre_CM',
            detalhe: `Audição ${i + 1} (${a.entidade}): decisão de incorporação por preencher` });
        }
        if (!a.justificacao_decisao || a.justificacao_decisao.length < MIN_JUSTIFICACAO_AUD) {
          pendencias.push({ campo: `audicao.${a.id}.justificacao`, regra: 'minimo',
            detalhe: `Audição ${i + 1} (${a.entidade}): justificação (mín. ${MIN_JUSTIFICACAO_AUD}c)` });
        }
      }
    });
  }

  if (marco === 'M5') {
    if (!fpl.referencia_dr) pendencias.push({ campo: 'referencia_dr', regra: 'obrigatorio', detalhe: 'Referência do Diário da República' });
  }

  return { ok: pendencias.length === 0, pendencias };
}

export function transicaoEstadoApos(marco, estadoAtual) {
  const t = TRANSICOES[marco];
  if (!t) return estadoAtual;
  if (marco === 'M3') return estadoAtual; // informativo
  return t.to;
}

/** Validação síncrona de uma audição (D.1 ou D.2). */
export function validarAudicao(a) {
  const errs = [];
  if (!a.entidade) errs.push('Entidade obrigatória');
  if (!a.categoria || !['OBRIGATORIA', 'GSEPCM'].includes(a.categoria)) errs.push('Categoria: OBRIGATORIA | GSEPCM');
  if (a.sintese_posicao && a.sintese_posicao.length < MIN_SINTESE_AUD) errs.push(`Síntese mín. ${MIN_SINTESE_AUD}c`);
  if (a.decisao_incorporacao && (!a.justificacao_decisao || a.justificacao_decisao.length < MIN_JUSTIFICACAO_AUD)) {
    errs.push(`Justificação mín. ${MIN_JUSTIFICACAO_AUD}c quando há decisão`);
  }
  return errs;
}

export const LIMITES = {
  MIN_SINTESE_PROBLEMA, MIN_OBJETO_AUD, MIN_SINTESE_AUD, MIN_JUSTIFICACAO_AUD, MIN_CL_SINTESE,
};
