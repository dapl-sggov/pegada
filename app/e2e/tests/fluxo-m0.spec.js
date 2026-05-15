// fluxo-m0.spec.js — Cenário end-to-end principal.
// Login PF → criar FPL → preencher Bloco B → validar M0 → confirmar
// emissão do comprovativo e mudança de estado para EM_ELABORACAO.

import { test, expect } from '@playwright/test';

test.describe('Fluxo M0 ponta-a-ponta', () => {

  test('Maria PF cria FPL, valida M0 e vê o comprovativo', async ({ page }) => {
    await page.goto('/');

    // Login
    await expect(page.getByRole('heading', { name: 'Pegada Legislativa do Governo' })).toBeVisible();
    await page.getByLabel('Email').fill('maria.silva@gov.pt');
    await page.getByLabel('Palavra-passe').fill('demo1234');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();

    // Shell autenticado — sidebar visível
    await expect(page.getByRole('link', { name: /Nova FPL/i })).toBeVisible({ timeout: 10_000 });

    // Abrir formulário de nova FPL (via sidebar — role=link)
    await page.getByRole('link', { name: /Nova FPL/i }).click();
    await expect(page.getByRole('heading', { name: /Bloco A/i })).toBeVisible({ timeout: 10_000 });

    // Preencher Bloco A
    await page.locator('select[name="tipo_diploma"]').selectOption('DL');
    await page.locator('input[name="titulo"]').fill('Decreto-Lei E2E — Aprova o regime experimental de teste integrado');
    await page.locator('input[name="titulo_curto"]').fill('E2E Regime experimental');

    // Preencher Bloco B
    await page.locator('select[name="tipo_origem"]').selectOption('INICIATIVA_MINISTERIO');
    const sintese = 'O presente diploma estabelece um regime experimental para validar, em ambiente controlado, ' +
                    'soluções inovadoras com vista a corrigir lacunas regulatórias identificadas no setor. ' +
                    'A solução proposta cria condições para participação dos vários intervenientes, eliminando ' +
                    'barreiras administrativas e garantindo proteção dos consumidores e dos direitos fundamentais.';
    await page.locator('textarea[name="sintese_problema"]').fill(sintese);

    // Submeter — cria FPL + Bloco B + tenta validar M0 automaticamente
    await page.getByRole('button', { name: /Criar FPL e validar M0/i }).click();

    // Confirmar que ficamos na vista de detalhe da FPL com estado "Em elaboração"
    // (transição M0: CRIADO → EM_ELABORACAO)
    await expect(page.getByText('Em elaboração').first()).toBeVisible({ timeout: 10_000 });

    // O tab "Comprovativos" mostra 1 (M0 foi emitido)
    await expect(page.getByRole('tab', { name: /Comprovativos\s*1/i })).toBeVisible({ timeout: 10_000 });

    // Ir ao tab dos comprovativos e confirmar que aparece o jti do M0
    // (formato: cmp_M0-<uuid>). O JWS completo só aparece no modal "Ver comprovativo".
    await page.getByRole('tab', { name: /Comprovativos/i }).click();
    await expect(page.locator('body')).toContainText(/cmp_M0-/);
    await expect(page.getByText('✓ emitido').first()).toBeVisible();
  });

  test('Cabeçalhos de segurança vêm corretos', async ({ request }) => {
    const r = await request.get('/health');
    expect(r.status()).toBe(200);
    const h = r.headers();
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['content-security-policy']).toContain("default-src 'self'");
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  test('JWKS expõe a chave pública Ed25519', async ({ request }) => {
    const r = await request.get('/api/.well-known/fpl-jwks.json');
    expect(r.status()).toBe(200);
    const j = await r.json();
    expect(j.keys[0].kty).toBe('OKP');
    expect(j.keys[0].crv).toBe('Ed25519');
    expect(j.keys[0].kid).toBeTruthy();
  });

  test('Declaração de acessibilidade está disponível e cumpre o DL 83/2018', async ({ page }) => {
    await page.goto('/declaracao-acessibilidade.html');
    await expect(page.getByRole('heading', { name: 'Declaração de Acessibilidade' })).toBeVisible();
    await expect(page.locator('body')).toContainText('Decreto-Lei n.º 83/2018');
    await expect(page.locator('body')).toContainText('WCAG 2.2');
    // skip-link no topo
    await expect(page.locator('.skip-link')).toBeAttached();
  });

  test('/metrics expõe métricas Prometheus após tráfego', async ({ request }) => {
    // gera um hit
    await request.get('/health');
    const r = await request.get('/metrics');
    expect(r.status()).toBe(200);
    const txt = await r.text();
    expect(txt).toMatch(/# TYPE http_requests_total counter/);
    expect(txt).toMatch(/http_request_duration_seconds_bucket/);
    expect(txt).toMatch(/fpl_uptime_seconds/);
  });
});
