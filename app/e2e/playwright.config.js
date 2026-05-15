// playwright.config.js — Configuração dos testes end-to-end da FPL Ponte.
//
// O Playwright arranca o backend automaticamente (`webServer`) com BD SQLite
// em memória, executa o `seed.js` e depois corre os specs contra o servidor.
// Após os testes a BD desaparece.

import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.E2E_PORT || 4001;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,         // os testes partilham estado (FPL criada no M0 é usada no M3)
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'pt-PT',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: {
    command: `node bootstrap.js`,
    env: {
      PORT: String(PORT),
      DATABASE_URL: 'sqlite::memory:',
      NODE_ENV: 'test',
      COMPROVATIVO_ALLOW_EPHEMERAL: 'true',
      RATE_LIMIT_DISABLE: '1',
    },
    url: `${BASE_URL}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
