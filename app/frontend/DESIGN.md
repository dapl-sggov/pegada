# Design system — FPL Ponte (Pegada Legislativa)

Referência viva para o frontend. Aplica-se a `app/frontend/` e `demo/`.

## Princípios

- **Distintivo, não genérico**. Anti-slop: sem Inter, sem Roboto, sem Space Grotesk, sem gradientes roxos, sem bento boxes, sem glassmorphism.
- **Identidade institucional**. Azul governamental + dourado discreto + serif editorial para títulos. Não é uma SaaS — é uma ferramenta da Administração Pública.
- **Hierarquia clara**. Pesos extremos (200 vs 800), saltos de tamanho 3×, não 1.5×. Eyebrows em 11px Plex Sans 300 uppercase; títulos em 28-36px Fraunces 800.
- **Self-hosted everything**. CSP estrita (`font-src 'self' data:` em `app/backend/src/security.js:33`) — nada de Google Fonts CDN, nada de assets externos.

## Tipografia

| Função | Família | Pesos | Onde |
|---|---|---|---|
| Display (títulos, KPI values, declarações) | **Fraunces** (serif variável) | 200, 400, 800 | `h1` `h2` `h3` `.painel-title` `.page-title` `.kpi .val` `.pc-quote` `.declaration-box` `.crono-title` |
| Body / UI | **IBM Plex Sans** (variável) | 300, 400, 500, 700 | `body`, botões, labels, navegação |
| Mono (IDs, código, datas) | **IBM Plex Mono** | 400, 500 | `.mono` `.cell-titulo .num` `.painel-bcrumb` `.pc-mini-date` |

Todas self-hosted em `assets/fonts/` (ficheiros `.woff2`, subsets latin + latin-ext, `font-display: swap`).

Preload das duas críticas (Fraunces latin 800 + Plex Sans latin 400) em `<head>`.

## Tokens (`app.css`)

### Marca
- `--gov-blue` `#0a3161`
- `--gov-blue-dark` `#06203f`
- `--gov-blue-light` `#1d4d8c`
- `--gov-red` `#c8102e`
- `--gov-gold` / `--gold` `#b08020`

### Superfícies
- `--bg` (fundo de página)
- `--bg-soft` (zonas alternativas)
- `--surface` (cartões, modais)
- `--surface-alt`
- `--sidebar`, `--sidebar-soft`, `--sidebar-divider`, `--sidebar-fg`, `--sidebar-mute` (sidebar sempre escura)
- `--border`, `--border-hair`, `--border-strong`

### Texto
- `--text`, `--text-muted`, `--text-faint`, `--text-mid`, `--text-on-blue`

### Estados
- `--success`, `--success-bg`, `--success-bg-soft`, `--success-border`
- `--warning`, `--warning-bg`, `--warning-bg-soft`
- `--danger`, `--danger-bg`, `--danger-bg-soft`
- `--info`, `--info-bg`, `--info-bg-soft`

### Geometria
- `--radius: 6px` (cartões, badges)
- `--radius-sm: 4px` (inputs, chips)
- `--radius-lg: 10px` (modais, login card)

### Sombras
- `--shadow-lg: 0 8px 24px -8px rgba(10,49,97,.25)` — só para modais, popovers, hover de KPIs
- `--shadow-modal: 0 24px 56px -16px rgba(6,32,63,.45)` — só para modais

Não usar sombras `0 1px 2px rgba(...,.05)` — é o anti-pattern listado.

### Tipografia tokens
- `--fs-xs: 11px`, `--fs-sm: 12px`, `--fs-base: 13px`, `--fs-md: 15px`
- `--fs-lg: 22px`, `--fs-xl: 28px`, `--fs-xxl: 36px` (saltos agressivos)

### Tema
- `[data-tema="auto"]` segue `prefers-color-scheme`
- `[data-tema="claro"]` / `"escuro"` / `"alto-contraste"` forçam manualmente

## Iconografia

Set inline em `src/icons.js`: Lucide-style, stroke 1.75, `currentColor`, 16×16 default.

```js
import { ico } from './icons.js';
ico('dashboard');                 // SVG 16
ico('check', { size: 20 });       // SVG 20
```

**Não usar** glyphs Unicode (▤ ▦ ◔ ⚿ ⎋ ✉) em UI nova. Apenas tolerados em labels de paleta/atalhos legacy.

## Componentes principais

- `.btn` `.btn.primary` `.btn.success` `.btn.danger` `.btn.ghost` `.btn.sm`
- `.card` `.card-head` `.card-body` `.card-empty`
- `.kpi` (estático) e `.kpi-btn` (clicável, drill-down) — usar `.kpi-btn` em todos os dashboards consistentemente
- `.tbl` `.tbl-sortable` (clique no `<th data-sort>` cicla `asc`/`desc`, indicador ▲▼ automático)
- `.badge.dot` (estados) + variantes `criado` `elaboracao` `consulta` `rse` `cm` `aprovado` `publicado` `revisao`
- `.tag.tipo-DL` `.tipo-PL` `.tipo-RCM` `.tipo-DR` (cores semânticas por tipo de diploma)
- `.chip` `.chip .x` (filtros ativos, removíveis individualmente)
- `.alert` (variantes `info` `warning` `danger` `success`)
- `.modal-overlay` `.modal` (com backdrop-filter blur 2px)
- `.toast`

### Painel v1.2

- `.painel-app` (layout), `.painel-side` (sidebar 220px escura), `.painel-main`, `.painel-head`
- `.painel-title` (Fraunces 800, -0.02em)
- `.painel-stepper` `.painel-step` (M0..M5; navegável: clique faz scroll-to-card com highlight)
- `.painel-body` (grelha 2 colunas de `.pc-card`s; entram escalonados via `fadeUp`)
- `.pc-card` `.pc-card.wide` `.pc-card-head` `.pc-card-body`
- `.pc-letter` (badge da letra do bloco; variantes `d` `cmp` `f` `h` `anex`)
- `.pc-kv` `.pc-mini` `.pc-dec` `.pc-bar` `.pc-sig` `.pc-quote`
- `.pc-card.highlight` (animação de 1.2s quando navegado via stepper)
- `.painel-crono` `.crono-cal` `.crono-grid` `.crono-cell` `.crono-ev` `.crono-side`
- `.sse-dot` (`.live` verde, `.polling` dourado) — indicador SSE na sidebar

## Login

- Fundo `#0a3161` sólido + duas faixas verticais (dourado + azul-claro) à direita, evocando a fita da bandeira.
- Sem gradiente azul→azul (default SaaS).
- Role-cards (`.role-grid` `.role-card`) com avatar colorido + nome + papel — substitui o `<button class="demo-user">` legacy.
- Form email/password sempre visível, separado por divisor "ou".

## Animação

- `fadeUp` (cards do detalhe, 35ms ease, escalonado por `nth-child` até 320ms total).
- `rowIn` (linhas de tabela, 25ms ease, escalonado até 100ms).
- `cardHighlight` (1.2s, glow dourado, quando navegado via stepper).
- `modalPop` (entrada de modais).
- Tudo respeita `prefers-reduced-motion: reduce` (ver `app.css` final).

## Routing

Hash-based (`router.js`): `#/dashboard`, `#/lista`, `#/fpl/<id>`, `#/fpl/<id>/cronograma`.

- `setView('detalhe', { fplId, sub: 'cronograma' })` atualiza state + hash + render.
- `popstate` e `hashchange` reverte para o estado correto.
- Deep-link funciona: refresh ou colar URL mantém vista de detalhe / cronograma.

## Anti-padrões a evitar

- Fontes: Inter, Roboto, Open Sans, Lato, Arial, system-ui sem fallback custom, Space Grotesk.
- Bento boxes 2×2 genéricos. Three-up feature cards.
- Pills/`rounded-full` em todos os botões.
- Cantos `rounded-xl` por defeito.
- Múltiplas sombras a 0.1 opacidade.
- Gradientes roxos sobre branco; indigo→violet hero washes.
- `glassmorphism` over-the-top.
- Cores descritivas ("azul moderno", "verde discreto"). Sempre valores hex.

## Verificação visual (manual)

Antes de submeter mudança de UI:

1. Arrancar `docker-compose up` em `Sistema/`.
2. Abrir `http://localhost:3717/` — login Maria Silva (`maria.silva@gov.pt` / `demo1234`).
3. Verificar:
   - Fontes carregam (DevTools Network → font; sem 404).
   - Console sem warnings CSP.
   - Hash routing: `http://localhost:3717/#/fpl/<id>/cronograma` abre direto.
   - Cronograma: `‹` / `›` mudam mês.
   - Lista: clique em `<th>` ordena; chips aparecem ao filtrar.
   - Detalhe: clique no step M3 leva ao Card D com highlight dourado.
4. Demo: `http://localhost:3717/demo/` ou ficheiro direto. Mesmos checks (sem login externo).

## Ficheiros-chave

- `app/frontend/app.css` — folha única (~1100 linhas)
- `app/frontend/src/icons.js` — set SVG
- `app/frontend/src/router.js` — hash router
- `app/frontend/src/shell.js` — sidebar + sse-dot
- `app/frontend/src/views/*.js` — vistas
- `demo/demo.css` — versão standalone do design
- `demo/demo.js` — SPA da demo (vanilla, sem build)
- `app/backend/src/security.js` — CSP (impede CDNs externos)
