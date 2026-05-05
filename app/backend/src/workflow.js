// Máquina de estados do workflow FPL e validações por marco

import { db } from './db.js';
import { safeJsonParse } from './util.js';

export const ESTADOS = [
  'CRIADO', 'EM_ELABORACAO', 'EM_CONSULTA_INTERNA',
  'EM_CONSULTA_PUBLICA', 'EM_RSE', 'EM_CM',
  'APROVADO', 'PUBLICADO', 'EM_REVISAO_QA', 'ARQUIVADO', 'REJEITADO_M0'
];

// Transições válidas por marco
const TRANSICOES = {
  M0: { from: ['CRIADO'], to: 'EM_ELABORACAO' },
  M1: { from: ['EM_ELABORACAO', 'EM_CONSULTA_INTERNA'], to: 'EM_CONSULTA_PUBLICA' },
  M2: { from: ['EM_CONSULTA_PUBLICA'], to: 'EM_CONSULTA_PUBLICA' }, // marco registado, mantém estado
  M3: { from: ['EM_ELABORACAO', 'EM_CONSULTA_INTERNA', 'EM_CONSULTA_PUBLICA'], to: 'EM_RSE' },
  M4: { from: ['EM_RSE'], to: 'EM_CM' },
  M5: { from: ['APROVADO'], to: 'PUBLICADO' },
};

const MIN_SINTESE_PROBLEMA = 200;
const MIN_SINTESE_BLOCO_E = 300;
const MIN_DECISAO_BLOCO_E = 200;
const MIN_OBJETO_D = 50;
const MIN_SINTESE_D = 100;
const MIN_JUSTIFICACAO_D = 100;

/**
 * Avalia uma FPL contra os requisitos de um marco.
 * Devolve { ok: boolean, pendencias: [{campo, regra, detalhe}] }
 */
export function validarMarco(fpl, marco) {
  const pendencias = [];

  // Verifica transição de estado
  const trans = TRANSICOES[marco];
  if (!trans) return { ok: false, pendencias: [{ campo: 'marco', regra: 'marco_desconhecido', detalhe: marco }] };
  if (!trans.from.includes(fpl.estado_workflow)) {
    return {
      ok: false,
      pendencias: [{
        campo: 'estado_workflow',
        regra: 'transicao_invalida',
        detalhe: `Estado atual ${fpl.estado_workflow}; ${marco} requer um de [${trans.from.join(', ')}]`
      }]
    };
  }

  // M0: Bloco A obrigatório (já garantido na criação) + Bloco B mínimos
  if (marco === 'M0') {
    if (!fpl.tipo_origem) pendencias.push({ campo: 'tipo_origem', regra: 'obrigatorio', detalhe: 'Bloco B: tipo de origem' });
    if (!fpl.sintese_problema || fpl.sintese_problema.length < MIN_SINTESE_PROBLEMA) {
      pendencias.push({
        campo: 'sintese_problema',
        regra: 'minimo_caracteres',
        detalhe: `Bloco B: síntese do problema (mínimo ${MIN_SINTESE_PROBLEMA} caracteres; atual ${fpl.sintese_problema?.length || 0})`
      });
    }
  }

  // M2: requer M0 + Bloco E preenchido
  if (marco === 'M2') {
    if (!fpl.m0_validado_em) pendencias.push({ campo: 'M0', regra: 'pre_requisito', detalhe: 'M0 não validado' });
    if (!fpl.consulta_lex_ref) pendencias.push({ campo: 'consulta_lex_ref', regra: 'obrigatorio', detalhe: 'Bloco E: referência da consulta' });
    if (!fpl.consulta_lex_sintese || fpl.consulta_lex_sintese.length < MIN_SINTESE_BLOCO_E) {
      pendencias.push({
        campo: 'consulta_lex_sintese',
        regra: 'minimo_caracteres',
        detalhe: `Bloco E: síntese das posições (mínimo ${MIN_SINTESE_BLOCO_E} caracteres)`
      });
    }
    if (!fpl.consulta_lex_decisao || fpl.consulta_lex_decisao.length < MIN_DECISAO_BLOCO_E) {
      pendencias.push({
        campo: 'consulta_lex_decisao',
        regra: 'minimo_caracteres',
        detalhe: `Bloco E: decisão sobre incorporação (mínimo ${MIN_DECISAO_BLOCO_E} caracteres)`
      });
    }
  }

  // M3: M0 + bloco D completo + declaração F
  if (marco === 'M3') {
    if (!fpl.m0_validado_em) pendencias.push({ campo: 'M0', regra: 'pre_requisito', detalhe: 'M0 não validado' });
    const blocoD = db.prepare('SELECT * FROM entrada_bloco_d WHERE fpl_id = ?').all(fpl.id);
    blocoD.forEach((d, i) => {
      if (!d.decisao_incorporacao) {
        pendencias.push({
          campo: `bloco_d.${d.id}.decisao_incorporacao`,
          regra: 'obrigatorio_em_M3',
          detalhe: `Entrada D-${i + 1} (${d.entidade_designacao}): decisão de incorporação por preencher`
        });
      }
      if (!d.justificacao_decisao || d.justificacao_decisao.length < MIN_JUSTIFICACAO_D) {
        pendencias.push({
          campo: `bloco_d.${d.id}.justificacao_decisao`,
          regra: 'minimo_caracteres',
          detalhe: `Entrada D-${i + 1} (${d.entidade_designacao}): justificação da decisão (mínimo ${MIN_JUSTIFICACAO_D} caracteres)`
        });
      }
    });
    // Bloco E (se aplicável: existir consulta pública iniciada)
    if (fpl.consulta_lex_ref && fpl.consulta_lex_fim) {
      if (!fpl.consulta_lex_sintese || fpl.consulta_lex_sintese.length < MIN_SINTESE_BLOCO_E) {
        pendencias.push({ campo: 'consulta_lex_sintese', regra: 'minimo_caracteres', detalhe: `Bloco E: síntese (mín. ${MIN_SINTESE_BLOCO_E} caracteres)` });
      }
      if (!fpl.consulta_lex_decisao || fpl.consulta_lex_decisao.length < MIN_DECISAO_BLOCO_E) {
        pendencias.push({ campo: 'consulta_lex_decisao', regra: 'minimo_caracteres', detalhe: `Bloco E: decisão (mín. ${MIN_DECISAO_BLOCO_E} caracteres)` });
      }
    }
  }

  // M4: M3 validado + tudo completo
  if (marco === 'M4') {
    if (!fpl.m3_validado_em) pendencias.push({ campo: 'M3', regra: 'pre_requisito', detalhe: 'M3 não validado' });
    // Verifica que não existem pedidos de correção QA pendentes
    const pendQA = db.prepare(
      `SELECT COUNT(*) as n FROM auditoria_qa
       WHERE fpl_id = ? AND pedido_correcao = 1 AND estado_correcao != 'CONCLUIDA'`
    ).get(fpl.id);
    if (pendQA.n > 0) {
      pendencias.push({ campo: 'auditoria_qa', regra: 'correcao_pendente', detalhe: `${pendQA.n} pedido(s) de correção pendente(s) da auditoria SGGOV` });
    }
  }

  // M5: M4 + referência DR
  if (marco === 'M5') {
    if (!fpl.m4_validado_em) pendencias.push({ campo: 'M4', regra: 'pre_requisito', detalhe: 'M4 não validado' });
    if (fpl.estado_workflow !== 'APROVADO') pendencias.push({ campo: 'estado_workflow', regra: 'requer_APROVADO', detalhe: 'FPL deve estar em APROVADO antes do M5' });
    if (!fpl.referencia_dr) pendencias.push({ campo: 'referencia_dr', regra: 'obrigatorio', detalhe: 'Referência do Diário da República por preencher' });
  }

  return { ok: pendencias.length === 0, pendencias };
}

/**
 * Valida regras invariantes ao salvar uma entrada do Bloco D.
 */
export function validarEntradaBlocoD(entrada) {
  const errors = [];
  if (!entrada.data) errors.push('Data obrigatória');
  if (!entrada.forma) errors.push('Forma obrigatória');
  if (!entrada.entidade_designacao) errors.push('Entidade interlocutora obrigatória');
  if (!entrada.natureza_juridica) errors.push('Natureza jurídica obrigatória');
  if (!entrada.objeto || entrada.objeto.length < MIN_OBJETO_D) errors.push(`Objeto: mínimo ${MIN_OBJETO_D} caracteres`);
  if (!entrada.sintese_posicao || entrada.sintese_posicao.length < MIN_SINTESE_D) errors.push(`Síntese da posição: mínimo ${MIN_SINTESE_D} caracteres`);
  if (entrada.natureza_juridica === 'RTRI_INSCRITO' && !entrada.rtri_id) {
    errors.push('Para natureza "Representante de interesses inscrito no RTRI" é obrigatório o número de inscrição');
  }
  if (entrada.decisao_incorporacao && (!entrada.justificacao_decisao || entrada.justificacao_decisao.length < MIN_JUSTIFICACAO_D)) {
    errors.push(`Justificação da decisão: mínimo ${MIN_JUSTIFICACAO_D} caracteres`);
  }
  return errors;
}

export function transicaoEstadoApos(marco, estadoAtual) {
  const trans = TRANSICOES[marco];
  if (!trans) return estadoAtual;
  if (marco === 'M2') return estadoAtual; // não-bloqueante
  return trans.to;
}

export const LIMITES = {
  MIN_SINTESE_PROBLEMA, MIN_SINTESE_BLOCO_E, MIN_DECISAO_BLOCO_E,
  MIN_OBJETO_D, MIN_SINTESE_D, MIN_JUSTIFICACAO_D,
};
