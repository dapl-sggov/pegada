// views/admin.js — Vistas SGGOV: Entidades RTRI, Auditoria QA, Exportação,
// Perfil/2FA, Outbox de email. Inclui o modal de notificações.

import { api } from '../api.js';
import { state, gabSigla } from '../state.js';
import { esc, fmtData, fmtDH, badge, openModal, closeModal, toast } from '../utils.js';
import { loadFpls, loadFpl } from '../data.js';
import { setView } from '../router.js';
import { renderRoot } from '../render.js';
import { pollNotificacoes } from '../notifications.js';

// ---------- Entidades RTRI ----------
export async function viewEntidades() {
  const list = await api('/rtri/entidades/all');
  return `
    <div class="page-head">
      <div><div class="page-title">Entidades RTRI</div><div class="page-sub">${list.length} entidades · cache local sincronizada com a API da Assembleia da República</div></div>
      <button class="btn" onclick="sincronizarRtri(this)">Forçar sincronização</button>
    </div>
    <div class="alert info"><div><span class="ttl">Degradação graciosa</span>O RTRI é a única dependência externa crítica. Se a API da AR estiver indisponível, o ponto focal insere a entidade manualmente com validação pendente — a operação nunca fica bloqueada por falha externa.</div></div>
    <div class="card">
      <table class="tbl">
        <thead><tr><th scope="col">RTRI</th><th scope="col">Designação</th><th scope="col">Natureza</th><th scope="col">Estado</th></tr></thead>
        <tbody>
          ${list.map(e => `
            <tr><td><strong>${esc(e.rtri_id)}</strong></td><td>${esc(e.designacao)}</td><td>${esc(e.natureza_juridica || '')}</td><td><span class="rtri-status validado">✓ Ativo</span></td></tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}
window.sincronizarRtri = async (btn) => {
  if (btn) { btn.disabled = true; btn.textContent = 'A sincronizar…'; }
  try {
    const r = await api('/rtri/sincronizar', { method: 'POST' });
    toast(r.modo === 'http' ? `Sincronizadas ${r.sincronizadas} entidades do RTRI.` : 'Modo mock — cache local já está atualizada.', 'success');
  } catch (e) {
    toast('Sincronização indisponível: ' + e.message, 'warning');
  } finally {
    renderRoot();
  }
};

// ---------- Auditoria QA (visão consolidada) ----------
export async function viewAuditoriaQa() {
  await loadFpls();
  const auditorias = [];
  for (const f of state.fpls.slice(0, 30)) {
    const a = await api(`/fpl/${f.id}/auditoria`).catch(() => []);
    a.forEach(x => auditorias.push({ ...x, fpl: f }));
  }
  auditorias.sort((a, b) => (b.data_auditoria || '').localeCompare(a.data_auditoria || ''));
  return `
    <div class="page-head">
      <div><div class="page-title">Auditoria por amostra · Bloco G</div><div class="page-sub">Auditoria de qualidade das FPL</div></div>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="lbl">Auditorias</div><div class="val">${auditorias.length}</div></div>
      <div class="kpi"><div class="lbl">Pontuação média</div><div class="val">${auditorias.length ? Math.round(auditorias.reduce((s, a) => s + a.pontuacao, 0) / auditorias.length) : '—'}</div></div>
      <div class="kpi"><div class="lbl">Em correção</div><div class="val" style="color:var(--warning)">${auditorias.filter(a => a.pedido_correcao && a.estado_correcao !== 'CONCLUIDA').length}</div></div>
      <div class="kpi"><div class="lbl">Concluídas</div><div class="val" style="color:var(--success)">${auditorias.filter(a => !a.pedido_correcao || a.estado_correcao === 'CONCLUIDA').length}</div></div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Auditorias recentes</h3></div>
      <table class="tbl">
        <thead><tr><th>FPL</th><th>Auditor</th><th>Data</th><th>Pontuação</th><th>Estado</th></tr></thead>
        <tbody>
          ${auditorias.length === 0 ? '<tr><td colspan="5" class="card-empty">Sem auditorias registadas</td></tr>' :
          auditorias.map(a => `
            <tr onclick="setView('detalhe',{fplId:'${a.fpl.id}'})">
              <td><strong>${esc(a.fpl.numero_processo)}</strong> ${esc(a.fpl.titulo_curto || a.fpl.titulo.substring(0, 60))}</td>
              <td>${esc(a.auditor_nome)}</td>
              <td>${fmtData(a.data_auditoria)}</td>
              <td><strong style="color:${a.pontuacao >= 80 ? 'var(--success)' : 'var(--warning)'}">${a.pontuacao}</strong>/100</td>
              <td>${a.pedido_correcao ? `<span class="badge revisao dot">${a.estado_correcao || 'PENDENTE'}</span>` : '<span class="badge aprovado dot">Sem correções</span>'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ---------- Exportação para o Portal do Governo ----------
export async function viewExportacao() {
  const publicadas = await api('/export/fpl').catch(() => []);
  return `
    <div class="page-head">
      <div><h1 class="page-title">Exportação para o Portal do Governo</h1>
      <div class="page-sub">A aplicação opera confinada à RING e não serve a face pública. Após M5, gera pacotes estruturados que são transferidos para o Portal do Governo, ao lado da Agenda Pública dos membros do Governo.</div></div>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="lbl">FPL publicadas</div><div class="val">${publicadas.length}</div></div>
      <div class="kpi"><div class="lbl">Formatos</div><div class="val" style="font-size:18px">JSON · CSV · JSON-LD</div></div>
      <div class="kpi"><div class="lbl">Vocabulário</div><div class="val" style="font-size:18px">OCDE 2024</div></div>
      <div class="kpi"><div class="lbl">Transferência</div><div class="val" style="font-size:18px">Manual → automática</div></div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Datasets agregados</h3></div>
      <div class="card-body">
        <p class="small muted">Pacotes prontos para transferência para o Portal do Governo. Em formatos abertos, atualizados a cada publicação.</p>
        <div class="flex gap-8 mt-12" style="flex-wrap:wrap">
          <a class="btn" href="/api/export/datasets/fpl.json" target="_blank" rel="noopener">↓ Dataset JSON</a>
          <a class="btn" href="/api/export/datasets/fpl.csv" target="_blank" rel="noopener">↓ Dataset CSV</a>
          <a class="btn" href="/api/export/datasets/fpl.jsonld" target="_blank" rel="noopener">↓ JSON-LD (vocabulário OCDE)</a>
        </div>
      </div>
    </div>
    <div class="card mt-12">
      <div class="card-head"><h3>FPL publicadas — prontas para o Portal do Governo</h3></div>
      <table class="tbl">
        <thead><tr><th scope="col">N.º Processo</th><th scope="col">Título</th><th scope="col">Gabinete</th><th scope="col">DR</th><th scope="col">Publicado</th><th scope="col"></th></tr></thead>
        <tbody>
          ${publicadas.length === 0 ? '<tr><td colspan="6" class="card-empty">Ainda não há FPL publicadas (M5).</td></tr>' :
          publicadas.map(f => `
            <tr>
              <td><strong>${esc(f.numero_processo)}</strong></td>
              <td class="cell-titulo">${esc(f.titulo_curto || f.titulo)}</td>
              <td>${esc(f.gabinete_sigla)}</td>
              <td class="muted small">${esc(f.referencia_dr || '—')}</td>
              <td class="muted small">${fmtData(f.data_publicacao)}</td>
              <td><a class="btn ghost sm" href="/api/export/fpl/${f.id}" target="_blank" rel="noopener">Ver pacote</a></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ---------- Perfil / 2FA ----------
export async function viewPerfil() {
  return `
    <div class="page-head">
      <div><h1 class="page-title">O meu perfil</h1><div class="page-sub">Gestão de autenticação multi-fator</div></div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Identificação</h3></div>
      <div class="card-body">
        <div class="field-grid">
          <div class="field"><label>Nome</label><div class="val">${esc(state.user.nome)}</div></div>
          <div class="field"><label>Email</label><div class="val">${esc(state.user.email)}</div></div>
          <div class="field"><label>Papéis</label><div class="val">${state.user.papeis.map(p => esc(p.papel) + (p.gabinete_id ? ' @ ' + gabSigla(p.gabinete_id) : '')).join(', ')}</div></div>
          <div class="field"><label>2FA TOTP</label><div class="val">${state.user.totp_ativo ? '✓ Ativo' : '<span class="empty">Não configurado</span>'}</div></div>
        </div>
      </div>
    </div>
    <div class="card mt-12">
      <div class="card-head"><h3>Autenticação multi-fator (2FA)</h3></div>
      <div class="card-body">
        <p class="small muted">Recomenda-se ativar 2FA TOTP para todas as contas com papel de validação. Compatível com Google Authenticator, Microsoft Authenticator, Authy e equivalentes.</p>
        ${state.user.totp_ativo ? `
          <button class="btn danger mt-12" onclick="desativarTotp()">Desativar 2FA</button>
        ` : `
          <button class="btn primary mt-12" onclick="iniciarSetupTotp()">Configurar 2FA agora</button>
        `}
      </div>
    </div>
    <div class="card mt-12">
      <div class="card-head"><h3>Sessão</h3></div>
      <div class="card-body">
        <p class="small muted">Sessão ativa via cookie httpOnly + JWT (HS256, validade 8h). CSRF protegido por double-submit cookie.</p>
        <button class="btn mt-12" onclick="logout()">Terminar sessão</button>
      </div>
    </div>
  `;
}
window.iniciarSetupTotp = async () => {
  try {
    const r = await api('/auth/totp/setup', { method: 'POST' });
    openModal(`
      <div class="modal-head"><h3>Configurar 2FA</h3><button class="btn ghost sm" onclick="closeModal()">✕</button></div>
      <div class="modal-body">
        <ol style="padding-left:20px;line-height:1.8">
          <li>Abra a sua app autenticadora (Google Authenticator, Microsoft Authenticator, Authy).</li>
          <li>Escolha "+ Adicionar conta" → "Introduzir chave manual".</li>
          <li>Use estes valores:
            <div style="background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:10px;margin:8px 0">
              <div><strong>Conta:</strong> ${esc(state.user.email)}</div>
              <div><strong>Emissor:</strong> FPL Ponte</div>
              <div><strong>Chave:</strong> <code style="font-size:13px;word-break:break-all">${esc(r.secret)}</code></div>
              <div><strong>Tipo:</strong> Time-based (TOTP) · 30s · 6 dígitos</div>
            </div>
          </li>
          <li>Insira o código de 6 dígitos gerado para confirmar:</li>
        </ol>
        <div class="field"><label for="totpInp">Código de confirmação</label>
          <input id="totpInp" inputmode="numeric" pattern="\\d{6}" maxlength="6" autocomplete="one-time-code">
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn" onclick="closeModal()">Cancelar</button>
        <button class="btn primary" onclick="confirmarTotp()">Ativar 2FA</button>
      </div>
    `);
    setTimeout(() => document.getElementById('totpInp')?.focus(), 50);
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
};
window.confirmarTotp = async () => {
  const token = document.getElementById('totpInp').value;
  try {
    await api('/auth/totp/activate', { method: 'POST', body: { token } });
    state.user.totp_ativo = true;
    closeModal();
    toast('2FA ativado.', 'success');
    renderRoot();
  } catch (e) { toast(e.message, 'error'); }
};
window.desativarTotp = async () => {
  if (!confirm('Desativar 2FA? Recomenda-se manter ativo para contas com poderes de validação.')) return;
  await api('/auth/totp/disable', { method: 'POST' });
  state.user.totp_ativo = false;
  toast('2FA desativado.', 'warning');
  renderRoot();
};

// ---------- Outbox SGGOV ----------
export async function viewOutbox() {
  const items = await api('/admin/outbox');
  return `
    <div class="page-head">
      <div><h1 class="page-title">Outbox de email</h1><div class="page-sub">Notificações encaminhadas para SMTP do Governo (modo demonstração)</div></div>
      <button class="btn primary" onclick="processarOutbox()">Processar pendentes</button>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="lbl">Total</div><div class="val">${items.length}</div></div>
      <div class="kpi"><div class="lbl">Pendentes</div><div class="val" style="color:var(--warning)">${items.filter(i => i.estado === 'PENDENTE').length}</div></div>
      <div class="kpi"><div class="lbl">Enviadas</div><div class="val" style="color:var(--success)">${items.filter(i => i.estado === 'ENVIADO').length}</div></div>
      <div class="kpi"><div class="lbl">Falhadas</div><div class="val" style="color:var(--danger)">${items.filter(i => i.estado === 'FALHADO').length}</div></div>
    </div>
    <div class="card">
      <table class="tbl">
        <thead><tr><th>Destinatário</th><th>Assunto</th><th>Estado</th><th>Tentativas</th><th>Criada</th></tr></thead>
        <tbody>
          ${items.length === 0 ? '<tr><td colspan="5" class="card-empty">Sem mensagens em fila</td></tr>' :
          items.map(m => `
            <tr>
              <td>${esc(m.destinatario_email)}</td>
              <td>${esc(m.assunto)}</td>
              <td><span class="badge ${m.estado === 'ENVIADO' ? 'aprovado' : (m.estado === 'FALHADO' ? 'cm' : 'elaboracao')} dot">${m.estado}</span></td>
              <td>${m.tentativas}</td>
              <td class="muted small">${fmtDH(m.criado_em)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}
window.processarOutbox = async () => {
  const r = await api('/admin/outbox/processar', { method: 'POST' });
  toast(`Processadas ${r.enviados} mensagens.`, 'success');
  renderRoot();
};

// ---------- Notificações UI ----------
window.abrirNotificacoes = async () => {
  const r = await api('/notificacoes');
  state.notificacoes = r;
  const items = r.items || [];
  openModal(`
    <div class="modal-head">
      <h3>Notificações ${r.nao_lidas > 0 ? `<span class="badge consulta dot" style="margin-left:6px">${r.nao_lidas} não lidas</span>` : ''}</h3>
      <div>
        ${r.nao_lidas > 0 ? '<button class="btn sm" onclick="marcarTodasLidas()">Marcar todas como lidas</button>' : ''}
        <button class="btn ghost sm" onclick="closeModal()" aria-label="Fechar">✕</button>
      </div>
    </div>
    <div class="modal-body" style="max-height:60vh;overflow-y:auto">
      ${items.length === 0 ? '<div class="card-empty">Sem notificações</div>' :
      items.map(n => `
        <div class="notif ${n.lida ? '' : 'unread'}" data-id="${n.id}">
          <div class="notif-head">
            <strong>${esc(n.titulo)}</strong>
            <span class="muted small">${fmtDH(n.criada_em)}</span>
          </div>
          <div class="notif-body">${esc(n.corpo)}</div>
          <div class="notif-actions">
            ${n.fpl_id ? `<button class="btn sm" onclick="abrirFplDeNotif('${n.fpl_id}','${n.id}')">Abrir FPL</button>` : ''}
            ${!n.lida ? `<button class="btn ghost sm" onclick="marcarLida('${n.id}')">Marcar lida</button>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `);
};
window.marcarLida = async (id) => {
  await api('/notificacoes/' + id + '/lida', { method: 'POST' });
  pollNotificacoes();
  window.abrirNotificacoes();
};
window.marcarTodasLidas = async () => {
  await api('/notificacoes/lidas-todas', { method: 'POST' });
  pollNotificacoes();
  window.abrirNotificacoes();
};
window.abrirFplDeNotif = async (fplId, notifId) => {
  await api('/notificacoes/' + notifId + '/lida', { method: 'POST' });
  closeModal();
  pollNotificacoes();
  setView('detalhe', { fplId });
};
