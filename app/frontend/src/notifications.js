// notifications.js — Stub.
// As notificações em tempo real foram removidas na v2.0 (sistema temporário).
// Mantemos a API exportada para não quebrar imports espalhados.

export function getEstadoCanal() { return 'desconectado'; }
export function iniciarCanalNotificacoes() { /* no-op */ }
export function pararCanalNotificacoes() { /* no-op */ }
export async function pollNotificacoes() { /* no-op */ }
