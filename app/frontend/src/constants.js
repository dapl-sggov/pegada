// constants.js — Dicionários de tradução (slug → rótulo legível).
// Centralizar aqui evita inconsistências entre vistas.

export const ESTADOS_LBL = {
  CRIADO: { lbl: 'Criado', cls: 'criado' },
  EM_ELABORACAO: { lbl: 'Em elaboração', cls: 'elaboracao' },
  EM_CONSULTA_INTERNA: { lbl: 'Consulta interna', cls: 'consulta' },
  EM_CONSULTA_PUBLICA: { lbl: 'Consulta pública', cls: 'consulta' },
  EM_RSE: { lbl: 'Em RSE', cls: 'rse' },
  EM_CM: { lbl: 'Em CM', cls: 'cm' },
  APROVADO: { lbl: 'Aprovado', cls: 'aprovado' },
  PUBLICADO: { lbl: 'Publicado', cls: 'publicado' },
  EM_REVISAO_QA: { lbl: 'Em revisão QA', cls: 'revisao' },
  ARQUIVADO: { lbl: 'Arquivado', cls: 'criado' },
  REJEITADO_M0: { lbl: 'Rejeitado M0', cls: 'criado' },
};

export const TIPOS = {
  DL: 'Decreto-Lei',
  PL: 'Proposta de Lei',
  RCM: 'Resolução do Conselho de Ministros',
  DR: 'Decreto Regulamentar',
  DESPACHO: 'Despacho normativo',
};

export const ORIGEM_LBL = {
  PROGRAMA_GOVERNO: 'Programa do Governo',
  TRANSPOSICAO_UE: 'Transposição UE',
  DECISAO_JUDICIAL: 'Decisão judicial',
  COMPROMISSO_INTERNACIONAL: 'Compromisso internacional',
  INICIATIVA_MINISTERIO: 'Iniciativa do ministério',
  OUTRA: 'Outra',
};

export const NATUREZA_LBL = {
  RTRI_INSCRITO: 'Representante de interesses inscrito no RTRI',
  RTRI_FORCA_LEI: 'Representante automaticamente inscrito por força da Lei',
  ACADEMIA_PERITO: 'Academia ou perito individual',
  AUTORIDADE_PUBLICA: 'Autoridade pública',
  OUTRA: 'Outra',
};

export const FORMA_LBL = {
  REUNIAO: 'Reunião presencial',
  AUDIENCIA: 'Audiência',
  VIDEOCONFERENCIA: 'Videoconferência',
  CORRESPONDENCIA: 'Correspondência escrita',
  CONTRIBUTO_ESPONTANEO: 'Contributo espontâneo',
  OUTRA: 'Outra',
};

export const DECISAO_LBL = {
  INCORPORADA: 'Incorporada',
  PARCIALMENTE_INCORPORADA: 'Parcialmente incorporada',
  NAO_INCORPORADA: 'Não incorporada',
  SEM_OBJETO: 'Sem objeto',
};

export const MARCO_PRECISA_DECLARACAO = m => ['M1', 'M4'].includes(m);
export const MARCO_BLOQUEANTE = m => ['M0', 'M1', 'M4', 'M5'].includes(m);
export const MARCOS_BLOQUEANTES = ['M0', 'M1', 'M4', 'M5'];
