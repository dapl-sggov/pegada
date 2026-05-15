# Testes end-to-end — FPL Ponte

Suíte de testes Playwright que cobre o fluxo principal da aplicação no
browser. Complementa os testes de domínio (`backend/test/dominio.test.js`)
e de integração HTTP (`backend/test/integracao.test.js`).

## Instalação

```bash
cd app/e2e
npm install
npx playwright install chromium
```

A primeira execução descarrega o browser Chromium (~120 MB) — necessário
uma única vez por máquina.

## Execução

```bash
npm test           # corre todos os specs em modo headless
npm run test:ui    # modo interativo com inspeção visual
npm run test:report  # abre o relatório HTML após uma corrida
```

O Playwright arranca automaticamente o backend (`bootstrap.js`) com BD
SQLite em memória, semeia dois utilizadores (`maria.silva@gov.pt` PF e
`carla.almeida@gov.pt` Admin), e corre os specs contra
`http://127.0.0.1:4001`. Após os testes a BD desaparece — cada execução
parte de estado limpo.

## Cenários cobertos

| Spec | Cenário |
|---|---|
| `fluxo-m0.spec.js` | Login PF → criar FPL → preencher Bloco B → validar M0 → confirmar comprovativo |
| | Cabeçalhos de segurança (`/health` traz CSP, X-Frame-Options, etc.) |
| | JWKS expõe chave pública Ed25519 |
| | Declaração de acessibilidade disponível e conforme DL 83/2018 |
| | `/metrics` no formato Prometheus |

## CI

Em ambiente de CI (`process.env.CI` definido), o Playwright **nunca**
reutiliza um servidor existente — arranca sempre um novo `bootstrap.js`
limpo, garantindo isolamento entre execuções.
