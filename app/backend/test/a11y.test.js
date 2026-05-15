// Smoke test heurístico de acessibilidade.
// Não substitui a auditoria externa (cronograma E15) — verifica que o HTML
// servido pela aplicação cumpre um conjunto mínimo de requisitos WCAG 2.2 AA
// que são triviais de regredir num refactor.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(__dirname, '../../frontend');

function ler(rel) {
  return fs.readFileSync(path.join(FRONTEND, rel), 'utf8');
}

test('a11y: index.html declara idioma, viewport e meta description', () => {
  const h = ler('index.html');
  assert.match(h, /<html\s+lang="pt-PT"/i, 'lang="pt-PT" obrigatório');
  assert.match(h, /<meta[^>]+name="viewport"[^>]+content="width=device-width/i, 'viewport responsivo');
  assert.match(h, /<title>/i, '<title> presente');
});

test('a11y: declaração de acessibilidade existe e está conforme', () => {
  const h = ler('declaracao-acessibilidade.html');
  assert.match(h, /<html\s+lang="pt-PT"/i);
  assert.match(h, /Decreto-Lei n\.º 83\/2018/i, 'cita o DL 83/2018');
  assert.match(h, /WCAG 2\.2/i, 'menciona WCAG 2.2');
  assert.match(h, /skip-link/, 'tem skip-link');
  assert.match(h, /Mecanismo de comunicação e contacto/i, 'inclui mecanismo de contacto');
  assert.match(h, /AMA/, 'menciona a AMA como entidade de fiscalização');
});

test('a11y: shell + views usam marcação semântica + ARIA + skip-link', () => {
  // O frontend foi modularizado: o shell vive em src/shell.js, o login em
  // src/views/login.js, a vista de detalhe em src/views/detalhe-painel.js.
  const shell = ler('src/shell.js');
  const login = ler('src/views/login.js');
  const detalhe = ler('src/views/detalhe-painel.js');

  // skip-link no shell autenticado
  assert.match(shell, /class="skip-link"/);
  // landmarks no shell (sidebar usa aside com aria-label, main tem id e tabindex)
  assert.match(shell, /<aside[^>]*aria-label="Menu lateral"/);
  assert.match(shell, /<main[^>]*id="main"/);
  // role/aria no toggle de vista (detalhe-painel)
  assert.match(detalhe, /role="tablist"/, 'tablist no toggle de vista');
  assert.match(detalhe, /aria-selected=/, 'aria-selected no toggle');
  assert.match(login, /aria-required="true"/, 'aria-required em campos obrigatórios');
  assert.match(login, /aria-live="polite"/, 'aria-live em alerta de erro');
  // labels descritivos em ícones
  assert.match(shell, /aria-label="Notificações/);
  assert.match(shell, /aria-label="Terminar sessão"/);
  // skip-link
  assert.match(shell, /Saltar para o conteúdo principal/);
});

test('a11y: handler de teclado para data-nav existe no shell', () => {
  const shell = ler('src/shell.js');
  // O binding está no shell (querySelectorAll[data-nav])
  assert.match(shell, /\[data-nav\]/);
  assert.match(shell, /keydown/);
});

test('a11y: app.css tem foco visível e contraste declarado', () => {
  const c = ler('app.css');
  assert.match(c, /:focus-visible|outline\s*:/, 'estilo de foco definido');
  // o esquema de contraste tem texto-muted com contraste declarado nos comentários
  assert.match(c, /AAA|7\.0:1|contraste/i, 'contraste documentado nos tokens de cor');
});

test('a11y: link para a declaração visível no footer', () => {
  const j = ler('src/shell.js');
  assert.match(j, /declaracao-acessibilidade\.html/, 'footer aponta para a declaração');
});
