// state.js — Estado global mutável + seletores derivados.

export const state = {
  user: null,
  view: 'dashboard',
  fplId: null,
  gabinetes: [],
  fpls: [],
  fpl: null,
  versoes: [],
  eventos: [],
  anexos: [],
  dashboard: null,
  notificacoes: { items: [], nao_lidas: 0 }, // mantido para compat (não usado em v2.0)
  filtrosLista: { q: '', estado: '', gabinete: '', tipo: '' },
  listaSort: { col: 'data_criacao', dir: 'desc' },
  tema: localStorage.getItem('fpl_tema') || 'auto',
};

// ---------- seletores ----------
export const isSggov = () => state.user?.papeis.some(p => ['SGGOV_QA', 'SGGOV_ADMIN', 'GSEPCM'].includes(p.papel));
export const isAdmin = () => state.user?.papeis.some(p => p.papel === 'SGGOV_ADMIN');
export const isQa = () => state.user?.papeis.some(p => ['SGGOV_QA', 'SGGOV_ADMIN'].includes(p.papel));
export const myGabinete = () => state.user?.papeis.find(p => p.gabinete_id)?.gabinete_id;
export const gabSigla = id => state.gabinetes.find(g => g.id === id)?.sigla || id;
export const gabNome  = id => state.gabinetes.find(g => g.id === id)?.nome || id;
export const userOwns = (f) => state.user?.papeis.some(p => p.gabinete_id === f.gabinete_id);
