// workflow.js — Máquina de estados da FPL e validações por marco.
// API assíncrona (compatível com o driver dual SQLite/PostgreSQL).

import { db } from './db.js';

export const ESTADOS = [
  'CRIADO', 'EM_ELABORACAO', 'EM_CONSULTA_INTERNA',
  'EM_CONSULTA_PUBLICA', 'EM_RSE', 'EM_CM',
  'APROVADO', 'PUBLICADO', 'EM_REVISAO_QA', 'ARQUIVADO', 'REJEITADO_M0',
];

// Transições válidas por marco — novo desenho: CP depois da RSE.
//   CRIADO → (M0) EM_ELABORACAO → (M1) EM_RSE → (M2) EM_CONSULTA_PUBLICA
//   → [M3 encerra CP] → (M4) EM_CM → APROVADO → (M5) PUBLICADO
const TRANSICOES = {
  M0: { from: ['CRIADO'], to: 'EM_ELABORACAO' },
  M1: { from: ['EM_ELABORACAO', 'EM_CONSULTA_INTERNA'], to: 'EM_RSE' },
  M2: { from: ['EM_RSE'], to: 'EM_CONSULTA_PUBLICA' },
  // M3 (encerramento da CP) é informativo — assinala o fim da CP mas
  // mantém o estado EM_CONSULTA_PUBLICA até o ponto focal validar M4.
  M3: { from: ['EM_CONSULTA_PUBLICA'], to: 'EM_CONSULTA_PUBLICA' },
  M4: { from: ['EM_CONSULTA_PUBLICA'], to: 'EM_CM' },
  M5: { from: ['APROVADO'], to: 'PUBLICADO' },
};

// Marcos que emitem comprovativo criptográfico (RCM v2, n.º 4).
// Novo desenho: M1 (pré-RSE) substitui o antigo M3 como bloqueante e M4
// passa a corresponder ao pré-CM (já depois da CP).
export const MARCOS_BLOQUEANTES = ['M0', 'M1', 'M4', 'M5'];

// Marcos que exigem declaração de completude assinada (Bloco F).
export const MARCOS_COM_DECLARACAO = ['M1', 'M4'];

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
export async function validarMarco(fpl, marco) {
  const pendencias = [];

  const trans = TRANSICOES[marco];
  if (!trans) return { ok: false, pendencias: [{ campo: 'marco', regra: 'marco_desconhecido', detalhe: marco }] };
  if (!trans.from.includes(fpl.estado_workflow)) {
    return {
      ok: false,
      pendencias: [{
        campo: 'estado_workflow',
        regra: 'transicao_invalida',
        detalhe: `Estado atual ${fpl.estado_workflow}; ${marco} requer um de [${trans.from.join(', ')}]`,
      }],
    };
  }

  // ---- M0 · Abertura ----
  if (marco === 'M0') {
    if (!fpl.tipo_origem) pendencias.push({ campo: 'tipo_origem', regra: 'obrigatorio', detalhe: 'Bloco B: tipo de origem' });
    if (!fpl.sintese_problema || fpl.sintese_problema.length < MIN_SINTESE_PROBLEMA) {
      pendencias.push({
        campo: 'sintese_problema', regra: 'minimo_caracteres',
        detalhe: `Bloco B: síntese do problema (mínimo ${MIN_SINTESE_PROBLEMA} caracteres; atual ${fpl.sintese_problema?.length || 0})`,
      });
    }
  }

  // ---- M1 · Pré-RSE (BLOQUEANTE) ----
  // Versão inicial estabilizada + Bloco D com todos os interlocutores prévios
  // tratados (decisão de incorporação + justificação ≥100c).
  // Nota: a lógica que antes vigorava em M3 (encerramento de interações
  // externas com decisão e justificação) passa para aqui — a CP ocorre depois.
  if (marco === 'M1') {
    if (!fpl.m0_validado_em) pendencias.push({ campo: 'M0', regra: 'pre_requisito', detalhe: 'M0 não validado' });
    const blocoD = await db.all('SELECT * FROM entrada_bloco_d WHERE fpl_id = ?', [fpl.id]);
    blocoD.forEach((d, i) => {
      if (!d.decisao_incorporacao) {
        pendencias.push({
          campo: `bloco_d.${d.id}.decisao_incorporacao`, regra: 'obrigatorio_em_M1',
          detalhe: `Entrada D-${i + 1} (${d.entidade_designacao}): decisão de incorporação por preencher`,
        });
      }
      if (!d.justificacao_decisao || d.justificacao_decisao.length < MIN_JUSTIFICACAO_D) {
        pendencias.push({
          campo: `bloco_d.${d.id}.justificacao_decisao`, regra: 'minimo_caracteres',
          detalhe: `Entrada D-${i + 1} (${d.entidade_designacao}): justificação da decisão (mínimo ${MIN_JUSTIFICACAO_D} caracteres)`,
        });
      }
    });
  }

  // ---- M2 · Pós-RSE / Abertura CP (informativo) ----
  if (marco === 'M2') {
    if (!fpl.m1_validado_em) pendencias.push({ campo: 'M1', regra: 'pre_requisito', detalhe: 'M1 (pré-RSE) não validado' });
    if (!fpl.consulta_lex_ref) pendencias.push({ campo: 'consulta_lex_ref', regra: 'obrigatorio', detalhe: 'Bloco E: referência da consulta pública' });
    if (!fpl.consulta_lex_inicio) pendencias.push({ campo: 'consulta_lex_inicio', regra: 'obrigatorio', detalhe: 'Bloco E: data de início da CP' });
  }

  // ---- M3 · Encerramento da CP (informativo) ----
  if (marco === 'M3') {
    if (!fpl.m2_validado_em) pendencias.push({ campo: 'M2', regra: 'pre_requisito', detalhe: 'M2 (abertura da CP) não validado' });
    if (!fpl.consulta_lex_fim) pendencias.push({ campo: 'consulta_lex_fim', regra: 'obrigatorio', detalhe: 'Bloco E: data de fim da CP' });
    if (!fpl.consulta_lex_sintese || fpl.consulta_lex_sintese.length < MIN_SINTESE_BLOCO_E) {
      pendencias.push({ campo: 'consulta_lex_sintese', regra: 'minimo_caracteres', detalhe: `Bloco E: síntese das posições (mínimo ${MIN_SINTESE_BLOCO_E} caracteres)` });
    }
    if (!fpl.consulta_lex_decisao || fpl.consulta_lex_decisao.length < MIN_DECISAO_BLOCO_E) {
      pendencias.push({ campo: 'consulta_lex_decisao', regra: 'minimo_caracteres', detalhe: `Bloco E: decisão sobre incorporação (mínimo ${MIN_DECISAO_BLOCO_E} caracteres)` });
    }
  }

  // ---- M4 · Pré-CM (BLOQUEANTE) ----
  // Pré-requisitos: M1 + M3 + auditoria QA sem pedidos de correção pendentes.
  // Salvaguarda: entradas no Bloco D criadas/atualizadas depois de M1 têm de
  // ser revalidadas (decisão + justificação) antes de M4 — preserva a
  // integridade da declaração de completude assinada em M1.
  if (marco === 'M4') {
    if (!fpl.m1_validado_em) pendencias.push({ campo: 'M1', regra: 'pre_requisito', detalhe: 'M1 (pré-RSE) não validado' });
    if (!fpl.m3_validado_em) pendencias.push({ campo: 'M3', regra: 'pre_requisito', detalhe: 'M3 (encerramento da CP) não validado' });
    const pendQA = await db.get(
      `SELECT COUNT(*) as n FROM auditoria_qa
       WHERE fpl_id = ? AND pedido_correcao = 1 AND estado_correcao != 'CONCLUIDA'`,
      [fpl.id]
    );
    if (pendQA && pendQA.n > 0) {
      pendencias.push({ campo: 'auditoria_qa', regra: 'correcao_pendente', detalhe: `${pendQA.n} pedido(s) de correção pendente(s) da auditoria SGGOV` });
    }
    if (fpl.m1_validado_em) {
      const blocoDPosM1 = await db.all(
        `SELECT id, entidade_designacao, decisao_incorporacao, justificacao_decisao,
                criado_em, atualizado_em
         FROM entrada_bloco_d
         WHERE fpl_id = ?
           AND (criado_em > ? OR (atualizado_em IS NOT NULL AND atualizado_em > ?))`,
        [fpl.id, fpl.m1_validado_em, fpl.m1_validado_em]
      );
      blocoDPosM1.forEach((d) => {
        if (!d.decisao_incorporacao || !d.justificacao_decisao || d.justificacao_decisao.length < MIN_JUSTIFICACAO_D) {
          pendencias.push({
            campo: `bloco_d.${d.id}.revalidar`, regra: 'entrada_posterior_a_M1',
            detalhe: `Entrada Bloco D "${d.entidade_designacao}" foi criada/alterada após M1 — exige revalidação da decisão e justificação`,
          });
        }
      });
    }
  }

  // ---- M5 · Publicação ----
  if (marco === 'M5') {
    if (!fpl.m4_validado_em) pendencias.push({ campo: 'M4', regra: 'pre_requisito', detalhe: 'M4 não validado' });
    if (fpl.estado_workflow !== 'APROVADO') pendencias.push({ campo: 'estado_workflow', regra: 'requer_APROVADO', detalhe: 'FPL deve estar em APROVADO antes do M5' });
    if (!fpl.referencia_dr) pendencias.push({ campo: 'referencia_dr', regra: 'obrigatorio', detalhe: 'Referência do Diário da República por preencher' });
  }

  return { ok: pendencias.length === 0, pendencias };
}

/** Validação invariante de uma entrada do Bloco D (síncrona — não toca na BD). */
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
  // M3 é informativo (encerramento da CP) e mantém o estado
  // EM_CONSULTA_PUBLICA até M4. M2 é também informativo mas transiciona
  // de EM_RSE → EM_CONSULTA_PUBLICA porque assinala a *abertura* da CP.
  if (marco === 'M3') return estadoAtual;
  return trans.to;
}

export const LIMITES = {
  MIN_SINTESE_PROBLEMA, MIN_SINTESE_BLOCO_E, MIN_DECISAO_BLOCO_E,
  MIN_OBJETO_D, MIN_SINTESE_D, MIN_JUSTIFICACAO_D,
};
