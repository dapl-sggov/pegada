// views/admin.js — Stub simplificado v2.0.
// As páginas RTRI / TOTP / Outbox / Notificações foram removidas. O admin
// fica reduzido a "ferramentas SGGOV": forçar backup + exportar canónicos.

import { api } from '../api.js';
import { state, isSggov } from '../state.js';
import { toast, esc } from '../utils.js';

export async function renderAdmin() {
  if (!isSggov()) {
    document.getElementById('main').innerHTML = `<div class="empty">Acesso reservado à SGGOV.</div>`;
    return;
  }
  const dash = await api('/admin/dashboard').catch(() => null);
  document.getElementById('main').innerHTML = `
    <div class="painel-detalhe">
      <header class="detalhe-cab">
        <h1>Administração SGGOV</h1>
        <p class="sub">Ferramentas operacionais — sistema temporário FPL Ponte v2.0</p>
      </header>

      <section class="bloco">
        <h2>Estado actual</h2>
        ${dash ? `
          <div class="kpis-row">
            <div class="kpi"><div class="kpi-val">${dash.total}</div><div class="kpi-lbl">Total FPLs</div></div>
            ${dash.por_estado.map(e => `<div class="kpi"><div class="kpi-val">${e.n}</div><div class="kpi-lbl">${esc(e.estado)}</div></div>`).join('')}
          </div>
          <h3 style="margin-top:18px">Top gabinetes</h3>
          <ul>
            ${dash.top_gabinetes.map(g => `<li><strong>${esc(g.sigla)}</strong> · ${g.n} FPL${g.n === 1 ? '' : 's'}</li>`).join('')}
          </ul>
        ` : '<p class="empty">Indisponível.</p>'}
      </section>

      <section class="bloco">
        <h2>Backup do JSON canónico</h2>
        <p class="sub">Em produção corre automaticamente a cada 24 horas. Aqui pode forçar uma execução manual.</p>
        <button class="btn" id="btnBackup">Forçar backup agora</button>
        <pre id="backupRes" style="margin-top:10px;font-size:11px;background:var(--bg-muted);padding:10px;display:none"></pre>
      </section>

      <section class="bloco">
        <h2>Exportar canónicos</h2>
        <p class="sub">Descarrega o JSON canónico de todas as FPLs (ou filtra por estado/gabinete). É o formato a entregar ao sucessor (SmartLegis / Plataforma IntGov).</p>
        <button class="btn" id="btnExport">Descarregar fpl-export.json</button>
      </section>
    </div>
  `;

  document.getElementById('btnBackup').addEventListener('click', async () => {
    try {
      const r = await api('/admin/backup', { method: 'POST' });
      document.getElementById('backupRes').style.display = 'block';
      document.getElementById('backupRes').textContent = JSON.stringify(r, null, 2);
      toast(`Backup OK — ${r.total} FPLs em ${r.pasta}`, 'success');
    } catch (e) { toast('Falha: ' + e.message, 'error'); }
  });

  document.getElementById('btnExport').addEventListener('click', async () => {
    try {
      const j = await api('/export/canonicos');
      const blob = new Blob([JSON.stringify(j, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'fpl-export.json'; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast('Falha: ' + e.message, 'error'); }
  });
}
