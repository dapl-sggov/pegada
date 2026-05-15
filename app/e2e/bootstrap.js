// bootstrap.js — Arranca um backend FPL Ponte em modo "e2e": SQLite em
// memória, semeado, com chave de comprovativo efémera. Reutiliza o
// `buildApp` exportado por `src/server.js`.
//
// O Playwright invoca este script via `webServer.command`.

import { fileURLToPath } from 'node:url';
import path from 'node:path';

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'sqlite::memory:';
process.env.COMPROVATIVO_ALLOW_EPHEMERAL = 'true';
process.env.RATE_LIMIT_DISABLE = '1';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendSrc = path.resolve(__dirname, '../backend/src');

// Importa os módulos do backend
const { buildApp } = await import(`file://${backendSrc.replace(/\\/g, '/')}/server.js`);
const auth = await import(`file://${backendSrc.replace(/\\/g, '/')}/auth.js`);
const { db } = await import(`file://${backendSrc.replace(/\\/g, '/')}/db.js`);

const { app } = await buildApp({ servirFrontend: true, iniciarWorkers: false });

// Seed mínimo para e2e
await db.run("INSERT INTO gabinete (id, sigla, nome) VALUES ('mae','MAE','Ministério do Ambiente e da Energia')");
const maria = await auth.createUser({ email: 'maria.silva@gov.pt', nome_completo: 'Maria Silva', password: 'demo1234', nif: '100000001' });
await auth.assignRole(maria, 'PONTO_FOCAL', 'mae');
const carla = await auth.createUser({ email: 'carla.almeida@gov.pt', nome_completo: 'Carla Almeida', password: 'demo1234', nif: '100000006' });
await auth.assignRole(carla, 'SGGOV_ADMIN');

const PORT = Number(process.env.PORT) || 4001;
app.listen(PORT, () => {
  console.log(`[e2e] FPL Ponte a escutar em http://127.0.0.1:${PORT}`);
});
