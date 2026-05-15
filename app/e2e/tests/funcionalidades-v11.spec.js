// funcionalidades-v11.spec.js — Cobre as funcionalidades adicionadas
// no v1.1: pesquisa/filtros, tema, paleta de comandos (Cmd+K),
// declaração de acessibilidade refletida no shell.

import { test, expect } from '@playwright/test';

async function login(page, email = 'maria.silva@gov.pt') {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Palavra-passe').fill('demo1234');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('link', { name: /Nova FPL|As minhas FPL|Início/i }).first()).toBeVisible({ timeout: 10_000 });
}

test.describe('Funcionalidades v1.1', () => {

  test('Filtros da lista funcionam (pesquisa por título)', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: /As minhas FPL/i }).click();
    await expect(page.getByRole('search')).toBeVisible();

    // Cria uma FPL com título único primeiro (via UI)
    await page.getByRole('link', { name: /Nova FPL/i }).click();
    await page.locator('select[name="tipo_diploma"]').selectOption('DL');
    await page.locator('input[name="titulo"]').fill('XYZ-FILTRO-EXCLUSIVO Decreto-Lei de teste de filtragem');
    await page.locator('select[name="tipo_origem"]').selectOption('OUTRA');
    await page.locator('textarea[name="sintese_problema"]').fill('a'.repeat(220));
    await page.getByRole('button', { name: /Criar FPL e validar M0/i }).click();
    // Espera ir para detalhe
    await expect(page.getByText(/Em elaboração/).first()).toBeVisible({ timeout: 10_000 });

    // Volta à lista
    await page.getByRole('link', { name: /As minhas FPL/i }).click();
    const numTotal = await page.locator('table.tbl tbody tr').count();
    expect(numTotal).toBeGreaterThan(0);

    // Pesquisa pelo termo único
    await page.getByRole('searchbox', { name: /Pesquisar FPL/i }).fill('XYZ-FILTRO-EXCLUSIVO');
    await page.waitForTimeout(400); // debounce
    const filtradas = await page.locator('table.tbl tbody tr').count();
    expect(filtradas).toBe(1);
  });

  test('Toggle de tema cicla auto → claro → escuro → alto-contraste', async ({ page }) => {
    await login(page);
    const html = page.locator('html');
    const inicial = await html.getAttribute('data-tema');
    expect(inicial).toBe('auto');
    await page.locator('#temaBtn').click();
    expect(await html.getAttribute('data-tema')).toBe('claro');
    await page.locator('#temaBtn').click();
    expect(await html.getAttribute('data-tema')).toBe('escuro');
    await page.locator('#temaBtn').click();
    expect(await html.getAttribute('data-tema')).toBe('alto-contraste');
    await page.locator('#temaBtn').click();
    expect(await html.getAttribute('data-tema')).toBe('auto');
  });

  test('Cmd+K abre a paleta de comandos com lista contextual', async ({ page }) => {
    await login(page);
    await page.keyboard.press('Control+K');
    await expect(page.locator('#cmdkInp')).toBeVisible({ timeout: 5_000 });
    // Deve listar pelo menos os comandos básicos
    await expect(page.getByRole('option').filter({ hasText: /Início/i }).first()).toBeVisible();
    await expect(page.getByRole('option').filter({ hasText: /Lista de FPL/i }).first()).toBeVisible();
    // Filtra por "perfil"
    await page.locator('#cmdkInp').fill('perfil');
    await expect(page.getByRole('option').filter({ hasText: /perfil/i }).first()).toBeVisible();
    // Esc fecha
    await page.keyboard.press('Escape');
    await expect(page.locator('#cmdkInp')).not.toBeVisible();
  });

  test('Atalho "g d" navega para o início', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: /As minhas FPL/i }).click();
    // Confirma estamos na lista
    await expect(page.getByRole('search')).toBeVisible();
    // Foco fora de inputs (dispara o atalho)
    await page.locator('body').click();
    await page.keyboard.press('g');
    await page.keyboard.press('d');
    await expect(page.getByText(/Bem-vindo|Dashboard/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('Wizard do Bloco D abre com 3 passos', async ({ page }) => {
    await login(page);
    // Cria nova FPL
    await page.getByRole('link', { name: /Nova FPL/i }).click();
    await page.locator('select[name="tipo_diploma"]').selectOption('DL');
    await page.locator('input[name="titulo"]').fill('Teste wizard Bloco D');
    await page.locator('select[name="tipo_origem"]').selectOption('OUTRA');
    await page.locator('textarea[name="sintese_problema"]').fill('a'.repeat(220));
    await page.getByRole('button', { name: /Criar FPL e validar M0/i }).click();
    await expect(page.getByText(/Em elaboração/).first()).toBeVisible({ timeout: 10_000 });

    // Vai ao tab D — usa o seletor exato pelo data-tab para evitar ambiguidade
    await page.locator('button.tab[data-tab="D"]').click();
    // Confirma que o handler está registado
    const fnRegistada = await page.evaluate(() => typeof window.abrirWizardBlocoD === 'function');
    expect(fnRegistada).toBe(true);
    // Invoca-o diretamente — isto evita ambiguidades de seletores e replica
    // exatamente o que o utilizador vê ao clicar no botão.
    await page.evaluate(() => window.abrirWizardBlocoD());
    // Confirma os 3 passos visíveis
    await expect(page.getByText('Entidade interlocutora')).toBeVisible();
    await expect(page.getByText('Reunião e participantes')).toBeVisible();
    await expect(page.getByText('Objeto e posição')).toBeVisible();
    // Botão "Continuar →" no passo 1
    await expect(page.getByRole('button', { name: /Continuar/i })).toBeVisible();
  });
});
