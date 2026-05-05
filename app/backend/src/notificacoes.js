// Notificações: persistência em DB, dispatch in-app + "outbox" SMTP simulado.
// SMTP real é trivial de adicionar (nodemailer + servidor do Governo) — deixado fora desta v0.1.

import { db } from './db.js';
import { uuid, jsonStringify } from './util.js';

// Cria tabelas se não existirem (executar uma vez no boot)
export function initNotificacoes() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notificacao (
      id TEXT PRIMARY KEY,
      destinatario_id TEXT NOT NULL REFERENCES utilizador(id),
      fpl_id TEXT,
      tipo TEXT NOT NULL,
      titulo TEXT NOT NULL,
      corpo TEXT NOT NULL,
      lida INTEGER NOT NULL DEFAULT 0,
      criada_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      payload TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_notif_destinatario
      ON notificacao(destinatario_id, lida, criada_em DESC);

    CREATE TABLE IF NOT EXISTS outbox_email (
      id TEXT PRIMARY KEY,
      notificacao_id TEXT REFERENCES notificacao(id),
      destinatario_email TEXT NOT NULL,
      assunto TEXT NOT NULL,
      corpo_html TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'PENDENTE',  -- PENDENTE, ENVIADO, FALHADO
      tentativas INTEGER NOT NULL DEFAULT 0,
      ultima_tentativa TEXT,
      erro TEXT,
      criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

const TEMPLATES = {
  M3_VALIDADO: {
    titulo: 'FPL submetida para Reunião de Secretários de Estado',
    corpo: (ctx) => `A FPL ${ctx.numero} (${ctx.titulo_curto || ctx.titulo}) foi submetida para a próxima RSE. Está agora em estado EM_RSE.`,
  },
  M4_VALIDADO: {
    titulo: 'FPL submetida para Conselho de Ministros',
    corpo: (ctx) => `A FPL ${ctx.numero} foi submetida para CM. Está agora em estado EM_CM.`,
  },
  AUDITORIA_PEDIDO_CORRECAO: {
    titulo: 'Pedido de correção da SGGOV',
    corpo: (ctx) => `A SGGOV solicitou correção à FPL ${ctx.numero}. Pontuação atual: ${ctx.pontuacao}/100. Motivo: "${ctx.descricao}".`,
  },
  AUDITORIA_CONCLUIDA: {
    titulo: 'Auditoria concluída',
    corpo: (ctx) => `A auditoria à FPL ${ctx.numero} foi concluída com pontuação ${ctx.pontuacao}/100, sem pedidos de correção.`,
  },
  CONSULTA_LEX_RECEBIDA: {
    titulo: 'Consulta pública encerrada',
    corpo: (ctx) => `A consulta pública ${ctx.cl_ref} associada à FPL ${ctx.numero} encerrou. ${ctx.n_contributos} contributos importados para o Bloco E. Necessita preencher síntese e decisão para validar M2.`,
  },
  CORRECAO_SUBMETIDA: {
    titulo: 'Correção submetida pelo ponto focal',
    corpo: (ctx) => `O ponto focal submeteu correções à FPL ${ctx.numero}. Necessita revisão e aprovação.`,
  },
};

export function notificar({ tipo, destinatarios, fpl, ctx = {} }) {
  const tpl = TEMPLATES[tipo];
  if (!tpl) {
    console.warn('[notif] Tipo desconhecido:', tipo);
    return;
  }
  const titulo = tpl.titulo;
  const corpo = tpl.corpo({ ...ctx, numero: fpl?.numero_processo, titulo: fpl?.titulo, titulo_curto: fpl?.titulo_curto });
  const ids = Array.isArray(destinatarios) ? destinatarios : [destinatarios];
  for (const destId of ids) {
    if (!destId) continue;
    const id = uuid();
    db.prepare(`
      INSERT INTO notificacao (id, destinatario_id, fpl_id, tipo, titulo, corpo, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, destId, fpl?.id || null, tipo, titulo, corpo, jsonStringify(ctx));
    // Encaminha para outbox SMTP (apenas regista; envio real seria nodemailer)
    const u = db.prepare('SELECT email, nome_completo FROM utilizador WHERE id = ?').get(destId);
    if (u && u.email) {
      const html = `
        <p>Olá ${u.nome_completo},</p>
        <p>${corpo}</p>
        <p><a href="https://fpl.gov.pt/fpl/${fpl?.id || ''}">Abrir na aplicação</a></p>
        <hr>
        <p style="font-size:11px;color:#5b6478">Esta mensagem foi gerada automaticamente pela FPL Ponte. Não responder a este endereço.</p>
      `;
      db.prepare(`
        INSERT INTO outbox_email (id, notificacao_id, destinatario_email, assunto, corpo_html)
        VALUES (?, ?, ?, ?, ?)
      `).run(uuid(), id, u.email, '[FPL] ' + titulo, html);
    }
  }
}

export function destinatariosPorPapel(papel) {
  return db.prepare(`
    SELECT DISTINCT u.id FROM utilizador u
    JOIN atribuicao_papel a ON a.utilizador_id = u.id
    WHERE a.papel = ? AND u.ativo = 1
  `).all(papel).map(r => r.id);
}

export function destinatariosGabinete(gabineteId) {
  return db.prepare(`
    SELECT DISTINCT u.id FROM utilizador u
    JOIN atribuicao_papel a ON a.utilizador_id = u.id
    WHERE a.gabinete_id = ? AND u.ativo = 1
  `).all(gabineteId).map(r => r.id);
}

export function listarMinhas(userId, opts = {}) {
  const limit = opts.limit || 50;
  const onlyUnread = opts.onlyUnread === true;
  let sql = 'SELECT * FROM notificacao WHERE destinatario_id = ?';
  if (onlyUnread) sql += ' AND lida = 0';
  sql += ' ORDER BY criada_em DESC LIMIT ?';
  return db.prepare(sql).all(userId, limit);
}

export function contarNaoLidas(userId) {
  return db.prepare('SELECT COUNT(*) as n FROM notificacao WHERE destinatario_id = ? AND lida = 0').get(userId).n;
}

export function marcarLida(notifId, userId) {
  db.prepare('UPDATE notificacao SET lida = 1 WHERE id = ? AND destinatario_id = ?').run(notifId, userId);
}

export function marcarTodasLidas(userId) {
  db.prepare('UPDATE notificacao SET lida = 1 WHERE destinatario_id = ?').run(userId);
}

export function listarOutbox(opts = {}) {
  const limit = opts.limit || 100;
  return db.prepare('SELECT * FROM outbox_email ORDER BY criado_em DESC LIMIT ?').all(limit);
}

// "Worker" de envio simulado: marca como ENVIADO ao fim de N segundos
export function processarOutbox() {
  const pending = db.prepare("SELECT id FROM outbox_email WHERE estado = 'PENDENTE' LIMIT 50").all();
  for (const p of pending) {
    db.prepare(`
      UPDATE outbox_email SET estado = 'ENVIADO', tentativas = tentativas + 1,
                              ultima_tentativa = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(p.id);
  }
  return pending.length;
}
