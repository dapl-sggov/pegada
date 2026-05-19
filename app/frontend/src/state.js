// state.js — Estado global mutável + seletores derivados.
// Único objeto, partilhado por referência entre todos os módulos.
//
// Convenção: nunca reatribuir `state`; mutar campos. Os seletores não
// memoizam (a aplicação re-renderiza inteira a cada mudança de view).

export const state = {
  user: null,
  view: 'dashboard',
  fplId: null,
  gabinetes: [],
  fpls: [],
  fpl: null,
  versoes: [],
  eventos: [],
  rtriEntidades: [],
  dashboard: null,
  notificacoes: { items: [], nao_lidas: 0 },
  anexos: [],
  auditorias: [],
  comprovativos: [],
  pending2FA: null,
  // Filtros persistentes na vista de lista (preservados ao trocar de view)
  filtrosLista: { q: '', estado: '', gabinete: '', tipo: '' },
  // Ordenação da lista (sortable)
  listaSort: { col: 'numero_processo', dir: 'desc' },
  // Offset de mês no cronograma (-1 = mês anterior; +1 = seguinte)
  cronoMesOffset: 0,
  // MRU da paleta cmdK (top-5 comandos mais recentes, persistido em localStorage)
  cmdkMru: JSON.parse(localStorage.getItem('fpl_cmdk_mru') || '[]'),
  // Tema selecionado pelo utilizador (sobrepõe-se a prefers-color-scheme)
  tema: localStorage.getItem('fpl_tema') || 'auto', // auto | claro | escuro | alto-contraste
};

// ---------- seletores ----------
export const isSggov = () => state.user?.papeis.some(p => ['SGGOV_QA', 'SGGOV_ADMIN', 'GSEPCM'].includes(p.papel));
export const isAdmin = () => state.user?.papeis.some(p => p.papel === 'SGGOV_ADMIN');
export const isQa = () => state.user?.papeis.some(p => ['SGGOV_QA', 'SGGOV_ADMIN'].includes(p.papel));
export const myGabinete = () => state.user?.papeis.find(p => p.gabinete_id)?.gabinete_id;
export const gabSigla = id => state.gabinetes.find(g => g.id === id)?.sigla || id;
export const gabNome  = id => state.gabinetes.find(g => g.id === id)?.nome || id;
export const userOwns = (f) => state.user?.papeis.some(p => p.gabinete_id === f.gabinete_id);
