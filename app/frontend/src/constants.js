// constants.js — Dicionários de tradução (slug → rótulo legível).

export const ESTADOS_LBL = {
  RASCUNHO:            { lbl: 'Rascunho',            cls: 'criado' },
  EM_RSE:              { lbl: 'Em RSE',              cls: 'rse' },
  EM_CONSULTA_PUBLICA: { lbl: 'Consulta pública',    cls: 'consulta' },
  EM_CM:               { lbl: 'Em CM',               cls: 'cm' },
  APROVADO:            { lbl: 'Aprovado',            cls: 'aprovado' },
  PUBLICADO:           { lbl: 'Publicado',           cls: 'publicado' },
  ARQUIVADO:           { lbl: 'Arquivado',           cls: 'criado' },
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

export const AUDICAO_ESTADO_LBL = {
  PEDIDA:       'Pedida',
  RESPONDEU:    'Respondeu',
  DISPENSOU:    'Dispensou-se',
  SEM_RESPOSTA: 'Sem resposta',
};

export const FORMA_LBL = {
  AUDIENCIA: 'Audiência',
  ESCRITA: 'Escrita',
  OUTRO: 'Outro',
};

export const MARCOS = ['M0', 'M2', 'M3', 'M4', 'M5'];

export const MARCOS_LBL = {
  M0: 'Abertura',
  M2: 'Abertura CP',
  M3: 'Encerramento CP',
  M4: 'Pré-CM',
  M5: 'Publicação',
};
