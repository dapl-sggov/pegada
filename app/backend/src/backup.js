// backup.js — Backup diário do JSON canónico para o filesystem.
//
// Em produção, `config.backup.dir` aponta para uma pasta sincronizada com
// SharePoint (cliente OneDrive instalado na VM). Não há integração com o
// Graph API — basta escrever ficheiros e o sync trata do resto. Isto
// elimina credenciais Microsoft do nosso processo.
//
// Output: 1 ficheiro JSON por FPL + 1 manifesto `_index.json` com metadata.

import fs from 'node:fs';
import path from 'node:path';
import config from './config.js';
import { db } from './db.js';
import { toCanonico, SCHEMA_ID } from './canonico.js';

function garantirDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export async function correrBackup() {
  const baseDir = path.resolve(config.backup.dir);
  garantirDir(baseDir);
  const stamp = new Date().toISOString().slice(0, 10);
  const dia = path.join(baseDir, stamp);
  garantirDir(dia);

  const rows = await db.all('SELECT id FROM fpl ORDER BY data_criacao');
  const manifesto = { gerado_em: new Date().toISOString(), schema: SCHEMA_ID, total: rows.length, ficheiros: [] };
  for (const r of rows) {
    const c = await toCanonico(r.id);
    if (!c) continue;
    const nome = `fpl-${c.numero_processo.replace(/\//g, '_')}.json`;
    fs.writeFileSync(path.join(dia, nome), JSON.stringify(c, null, 2), 'utf8');
    manifesto.ficheiros.push({ id: c.id, numero: c.numero_processo, ficheiro: nome });
  }
  fs.writeFileSync(path.join(dia, '_index.json'), JSON.stringify(manifesto, null, 2), 'utf8');
  return { dia, total: manifesto.total, pasta: dia };
}

let timer = null;

export function iniciarBackupPeriodico() {
  if (timer) return;
  const intervaloMs = (config.backup.intervaloHoras || 24) * 3600_000;
  // Primeira execução 1 minuto após o arranque (não bloqueia o boot)
  setTimeout(() => correrBackup().catch(e => console.warn('[backup]', e.message)), 60_000).unref?.();
  timer = setInterval(() => {
    correrBackup().catch(e => console.warn('[backup]', e.message));
  }, intervaloMs);
  timer.unref?.();
}

export function pararBackupPeriodico() {
  if (timer) { clearInterval(timer); timer = null; }
}
