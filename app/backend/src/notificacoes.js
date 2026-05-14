// notificacoes.js — Notificações in-app + "outbox" de email.
// API assíncrona. O envio real de email depende de config.email.driver:
//   • outbox — guarda na tabela outbox_email sem enviar (dev/staging)
//   • smtp   — envia via servidor SMTP do Estado (produção; nodemailer)

import { db } from './db.js';
import config from './config.js';
import { uuid, jsonStringify } from './util.js';

const TEMPLATES = {
  M3_VALIDADO: {
    titulo: 'FPL submetida para Reunião de Secretários de Estado',
    corpo: (c) => `A FPL ${c.numero} (${c.titulo_curto || c.titulo}) foi submetida para a próxima RSE. Comprovativo de M3 emitido. Estado: EM_RSE.`,
  },
  M4_VALIDADO: {
    titulo: 'FPL submetida para Conselho de Ministros',
    corpo: (c) => `A FPL ${c.numero} foi submetida para CM. Comprovativo de M4 emitido. Estado: EM_CM.`,
  },
  M5_VALIDADO: {
    titulo: 'FPL publicada',
    corpo: (c) => `A FPL ${c.numero} foi publicada. Comprovativo de M5 emitido; pacote exportado para o Portal do Governo.`,
  },
  AUDITORIA_PEDIDO_CORRECAO: {
    titulo: 'Pedido de correção da SGGOV',
    corpo: (c) => `A SGGOV solicitou correção à FPL ${c.numero}. Pontuação atual: ${c.pontuacao}/100. Motivo: "${c.descricao}".`,
  },
  AUDITORIA_CONCLUIDA: {
    titulo: 'Auditoria concluída',
    corpo: (c) => `A auditoria à FPL ${c.numero} foi concluída com pontuação ${c.pontuacao}/100, sem pedidos de correção.`,
  },
  CONSULTA_LEX_RECEBIDA: {
    titulo: 'Consulta pública encerrada',
    corpo: (c) => `A consulta pública ${c.cl_ref} associada à FPL ${c.numero} encerrou. ${c.n_contributos} contributos importados para o Bloco E.`,
  },
  CORRECAO_SUBMETIDA: {
    titulo: 'Correção submetida pelo ponto focal',
    corpo: (c) => `O ponto focal submeteu correções à FPL ${c.numero}. Necessita revisão e aprovação.`,
  },
};

export async function notificar({ tipo, destinatarios, fpl, ctx = {} }) {
  const tpl = TEMPLATES[tipo];
  if (!tpl) { console.warn('[notif] Tipo desconhecido:', tipo); return; }
  const titulo = tpl.titulo;
  const corpo = tpl.corpo({ ...ctx, numero: fpl?.numero_processo, titulo: fpl?.titulo, titulo_curto: fpl?.titulo_curto });
  const ids = Array.isArray(destinatarios) ? destinatarios : [destinatarios];
  for (const destId of ids) {
    if (!destId) continue;
    const id = uuid();
    await db.run(
      'INSERT INTO notificacao (id, destinatario_id, fpl_id, tipo, titulo, corpo, payload) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, destId, fpl?.id || null, tipo, titulo, corpo, jsonStringify(ctx)]
    );
    const u = await db.get('SELECT email, nome_completo FROM utilizador WHERE id = ?', [destId]);
    if (u && u.email) {
      const html = `<p>Olá ${u.nome_completo},</p><p>${corpo}</p>` +
        `<p><a href="${config.publicUrl}/fpl/${fpl?.id || ''}">Abrir na aplicação</a></p><hr>` +
        `<p style="font-size:11px;color:#5b6478">Mensagem automática da FPL Ponte. Não responder.</p>`;
      await db.run(
        'INSERT INTO outbox_email (id, notificacao_id, destinatario_email, assunto, corpo_html) VALUES (?, ?, ?, ?, ?)',
        [uuid(), id, u.email, '[FPL] ' + titulo, html]
      );
    }
  }
}

export async function destinatariosPorPapel(papel) {
  const rows = await db.all(
    `SELECT DISTINCT u.id FROM utilizador u
     JOIN atribuicao_papel a ON a.utilizador_id = u.id
     WHERE a.papel = ? AND u.ativo = 1`, [papel]
  );
  return rows.map(r => r.id);
}

export async function destinatariosGabinete(gabineteId) {
  const rows = await db.all(
    `SELECT DISTINCT u.id FROM utilizador u
     JOIN atribuicao_papel a ON a.utilizador_id = u.id
     WHERE a.gabinete_id = ? AND u.ativo = 1`, [gabineteId]
  );
  return rows.map(r => r.id);
}

export async function listarMinhas(userId, opts = {}) {
  const limit = opts.limit || 50;
  let sql = 'SELECT * FROM notificacao WHERE destinatario_id = ?';
  if (opts.onlyUnread) sql += ' AND lida = 0';
  sql += ' ORDER BY criada_em DESC LIMIT ?';
  return db.all(sql, [userId, limit]);
}

export async function contarNaoLidas(userId) {
  const r = await db.get('SELECT COUNT(*) as n FROM notificacao WHERE destinatario_id = ? AND lida = 0', [userId]);
  return r ? r.n : 0;
}

export async function marcarLida(notifId, userId) {
  await db.run('UPDATE notificacao SET lida = 1 WHERE id = ? AND destinatario_id = ?', [notifId, userId]);
}
export async function marcarTodasLidas(userId) {
  await db.run('UPDATE notificacao SET lida = 1 WHERE destinatario_id = ?', [userId]);
}

export async function listarOutbox(opts = {}) {
  return db.all('SELECT * FROM outbox_email ORDER BY criado_em DESC LIMIT ?', [opts.limit || 100]);
}

// Worker de envio. driver=outbox: marca como ENVIADO (simulação).
// driver=smtp: enviaria via nodemailer (a ligar quando o SMTP estiver disponível).
export async function processarOutbox() {
  const pendentes = await db.all("SELECT id, destinatario_email, assunto, corpo_html FROM outbox_email WHERE estado = 'PENDENTE' LIMIT 50");
  for (const p of pendentes) {
    try {
      if (config.email.driver === 'smtp') {
        await enviarSmtp(p);
      }
      await db.run(
        "UPDATE outbox_email SET estado = 'ENVIADO', tentativas = tentativas + 1, ultima_tentativa = ? WHERE id = ?",
        [new Date().toISOString(), p.id]
      );
    } catch (e) {
      await db.run(
        "UPDATE outbox_email SET estado = 'FALHADO', tentativas = tentativas + 1, ultima_tentativa = ?, erro = ? WHERE id = ?",
        [new Date().toISOString(), String(e.message).slice(0, 500), p.id]
      );
    }
  }
  return pendentes.length;
}

async function enviarSmtp(_email) {
  // Placeholder: integração com o SMTP do Estado via nodemailer.
  // A interface não muda — apenas se liga quando o servidor estiver disponível.
  throw new Error('EMAIL_DRIVER=smtp mas o transporte SMTP ainda não está ligado.');
}
