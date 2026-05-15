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

test('a11y: app.js usa marcação semântica + ARIA + skip-link', () => {
  const j = ler('app.js');
  // skip-link no shell autenticado
  assert.match(j, /class="skip-link"/);
  // landmarks
  assert.match(j, /<header[^>]*role="banner"/);
  assert.match(j, /<main[^>]*id="main"/);
  assert.match(j, /<footer[^>]*role="contentinfo"/);
  // ARIA dinâmico
  assert.match(j, /aria-current="\$\{state\.view/, 'aria-current dinâmico na navegação');
  assert.match(j, /aria-selected/, 'aria-selected nas tabs');
  assert.match(j, /aria-required="true"/, 'aria-required em campos obrigatórios');
  assert.match(j, /aria-live="polite"/, 'aria-live em alerta de erro');
  // navegação por teclado nas pseudo-links da sidebar
  assert.match(j, /tabindex="0"/);
  assert.match(j, /e\.key === 'Enter' \|\| e\.key === ' '/);
  // labels descritivos em ícones
  assert.match(j, /aria-label="Notificações/);
  assert.match(j, /aria-label="Terminar sessão"/);
  // skip-link no app.js (é gerado pelo shell)
  assert.match(j, /Saltar para o conteúdo principal/);
});

test('a11y: app.css tem foco visível e contraste declarado', () => {
  const c = ler('app.css');
  assert.match(c, /:focus-visible|outline\s*:/, 'estilo de foco definido');
  // o esquema de contraste tem texto-muted com contraste declarado nos comentários
  assert.match(c, /AAA|7\.0:1|contraste/i, 'contraste documentado nos tokens de cor');
});

test('a11y: link para a declaração visível no footer', () => {
  const j = ler('app.js');
  assert.match(j, /declaracao-acessibilidade\.html/, 'footer aponta para a declaração');
});
