# FPL Ponte — Pegada Legislativa do Governo

**Junho 2026 · v2.0**

Operacionalização da Pegada Legislativa do Governo durante o período em que o SmartLegis ainda não a incorpora. Sistema **deliberadamente temporário** (~18-24 meses), dimensionado para ser arquivado quando o seu sucessor (SmartLegis ou Plataforma IntGov da UnIT) entrar em produção.

📍 **Demonstração interativa:** https://dapl-sggov.github.io/pegada/demo/
📍 **Página institucional:** https://dapl-sggov.github.io/pegada/

---

## Estado atual (1 página)

### ✅ O que funciona hoje

**Backend (1500 LOC, 7/7 testes smoke OK)**
- API REST completa com sessão por cookie httpOnly
- Driver `mock` para DEV (login só com email) + stub `entra` para produção
- SQLite com 12 tabelas + migrações idempotentes
- CRUD completo de FPL (Blocos A, B, D.1, D.2, D.3, E)
- Máquina de estados M0/M2/M3/M4/M5 com validação de transições
- Ingestão de JSON do INTEGRA (UnIT) para o Bloco D.3
- JSON canónico (`fpl-ponte/v1`) para export/import e backup
- Geração de HTML estático da ficha pública (com hash SHA-256)
- Backup diário automático para pasta filesystem (SharePoint em produção)
- 5 endpoints `/admin/*`: estado, audit log, integridade, utilizadores

**Frontend SPA (estilo painel, fiel ao demo)**
- Login com role-cards + opção Entra ID
- Dashboard com KPIs clicáveis + cards de "próxima ação" por FPL ativa
- Lista de FPL com filtros, chips e mini-cronograma por linha
- Vista de detalhe (estilo painel-handoff): breadcrumb + título + estado + stepper horizontal de 5 marcos + body em grelha 2-colunas com pc-cards por bloco
- Modais centradas para editar Blocos B / E e gerir audições D.1/D.2
- Import JSON INTEGRA com drag-drop em modal
- Admin SGGOV: 4 separadores (Estado, Audit log, Integridade, Utilizadores)
- Cronograma vertical como sub-vista
- Geração e download da ficha pública / JSON canónico

**Operação**
- 22 ficheiros JS frontend, todos `node --check` OK
- CI com 1 só job (lint + test + smoke) — passa
- Push automático para GitHub Pages (demo + mock + docs)

### 🟡 O que está em stub / aguarda

- **Entra ID OIDC callback** — tem o endpoint `/auth/entra/start` que redireciona, mas o callback devolve 501 até a DSTD fornecer `ENTRA_TENANT_ID`/`CLIENT_ID`/`CLIENT_SECRET`. Sem credenciais não dá para autenticar via Microsoft 365.
- **Pasta OneDrive da UnIT** — o sistema sabe ingerir JSON do INTEGRA mas é upload manual no frontend. Quando a DSTD configurar acesso à pasta OneDrive da UnIT na RING, basta escrever um pequeno worker de polling.

### 🔴 O que ficou explicitamente fora do âmbito

(Decisão de simplificação — ver `docs/_arquivo/` para a versão v1.0 que tinha isto.)

- Comprovativos criptográficos JWS Ed25519 + JWKS
- PostgreSQL, Redis, MinIO/S3, SMTP
- LDAP/HTTP directory adapters, TOTP, federação simulada
- Threat model formal, DPIA extensa, declaração de acessibilidade longa
- Polling automático do DRE, webhook ConsultaLex
- Dashboards complexos com gráficos / timeline / KPIs ricos
- Sistema de notificações em tempo real (SSE)

### 💰 Custos previstos

| Item | Mensal |
|---|---|
| VM DSTD (partilhada) | ~€0 |
| Storage SQLite + ficheiros | ~€0 |
| Entra ID + SharePoint | €0 (licença M365 Gov existente) |
| **Operação** | ~1 dia-pessoa/mês |
| **Saída para sucessor** | 1-2 dias (one-off) |

---

## Arranque local (DEV)

```bash
cd app/backend
npm install
npm run migrate
npm run seed
npm run dev
```

Abrir http://localhost:3717/ e clicar num role-card (ex.: Maria Silva). Sem password no modo `mock`. Detalhe passo-a-passo: ver `docs/06_Operacao.md` ou perguntar à equipa.

---

## Arranque em produção (DSTD)

1. **VM Linux pequena** (2 vCPU / 4 GB RAM / 20 GB disco), Node 22+, intranet only.
2. **Configurar Entra ID** (variáveis de ambiente):
   ```
   AUTH_DRIVER=entra
   ENTRA_TENANT_ID=...
   ENTRA_CLIENT_ID=...
   ENTRA_CLIENT_SECRET=...
   ENTRA_REDIRECT_URI=https://fpl.gov.pt/api/auth/entra/callback
   ENTRA_ADMIN_MAP="admin@sggoverno.gov.pt:SGGOV_ADMIN;qa@sggoverno.gov.pt:SGGOV_QA"
   ```
3. **Backup para SharePoint:**
   ```
   BACKUP_DIR=/mnt/sharepoint-fpl/backup
   ```
   Em produção é o ponto de montagem do cliente OneDrive na VM.
4. `npm install && npm run migrate && npm start` atrás de reverse-proxy com TLS.

**Pedido completo à DSTD:** `docs/14_Pedido_DSTD.md` (também em `.docx`).

---

## Modelo de dados — Blocos da FPL

| Bloco | Conteúdo | Origem |
|---|---|---|
| A | Identificação (número, tipo, título, gabinete, coproponentes) | Sistema |
| B | Enquadramento (origem, síntese do problema, AIN) | Ponto focal |
| **D.1** | **Audições obrigatórias** (CES, ANMP, parceiros sociais...) | Ponto focal |
| **D.2** | **Audições GSEPCM** (discricionárias) | Ponto focal / GSEPCM |
| **D.3** | **Interações INTEGRA (pré-processo)** — read-only | Upload JSON UnIT |
| E | Consulta pública (link + n.º contributos + síntese) | Ponto focal |

> **Bloco D dividido em três:** o nosso âmbito são as interações **durante** o processo legislativo (D.1 obrigatórias, D.2 GSEPCM). Os contactos **pré-processo** nos gabinetes (Lei 5-A/2026, RTRI) são geridos pelo INTEGRA da UnIT — o seu JSON é ingerido e mostrado na ficha como contexto histórico (D.3).

## Marcos M0–M5

```
RASCUNHO ──M0──▶ EM_RSE ──M2──▶ EM_CONSULTA_PUBLICA
                                      │
                                      M3 (informativo, fim CP)
                                      ▼
                                EM_CONSULTA_PUBLICA
                                      │
                                      M4
                                      ▼
                                    EM_CM ──aprovar──▶ APROVADO ──M5──▶ PUBLICADO
```

- **M0** · Abertura (Bloco B preenchido, síntese ≥ 200c)
- **M2** · Abertura CP (link ConsultaLex registado)
- **M3** · Encerramento CP (n.º de contributos + síntese ≥ 200c)
- **M4** · Pré-CM (decisão + justificação preenchidas para audições com resposta)
- **M5** · Publicação (referência DR + hash SHA-256 da ficha)

A integridade do que se publica é o hash SHA-256 do JSON canónico, gravado em M5. Sem comprovativos JWS. Sem declaração de completude assinada. Para provar autoria/momento, o audit log e os snapshots de versão chegam.

---

## Estrutura do repositório

```
Sistema/
├── README.md                  ← este ficheiro
├── LICENSE                    ← EUPL-1.2
├── CONTRIBUTING.md
├── app/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── server.js       Arranque + middlewares
│   │   │   ├── config.js       Configuração 12-factor
│   │   │   ├── db.js           SQLite (node:sqlite nativo)
│   │   │   ├── migrate.js      Schema único, idempotente
│   │   │   ├── auth.js         Driver mock + stub Entra ID
│   │   │   ├── security.js     CSRF + rate-limit in-memory + headers
│   │   │   ├── workflow.js     Máquina de estados + validações
│   │   │   ├── fpl.js          Domínio FPL + audições + INTEGRA
│   │   │   ├── canonico.js     JSON canónico (export/import) ★
│   │   │   ├── ficha_publica.js Geração HTML estático
│   │   │   ├── backup.js       Backup periódico
│   │   │   ├── anexos.js       Anexos no filesystem
│   │   │   ├── routes.js       Endpoints REST
│   │   │   ├── seed.js         Dados demo
│   │   │   └── util.js
│   │   ├── test/smoke.test.js  7 testes (schema, seed, canónico,
│   │   │                        ficha, audições, INTEGRA, marco M0)
│   │   └── package.json        Apenas: express + cookie-parser
│   ├── frontend/
│   │   ├── index.html
│   │   ├── app.css             Folha única, replica demo/demo.css
│   │   └── src/                Views, router, state, wizards, utils
│   └── e2e/                    Testes Playwright (opcional)
├── demo/                       Demo interativa autónoma (HTML+JS+localStorage)
├── mock/                       Página institucional (publicada GitHub Pages)
└── docs/
    ├── 02_Arquitetura.md       Arquitetura técnica v2.0
    ├── 06_Operacao.md          Manual de operação
    ├── 14_Pedido_DSTD.md       Pedido formal à DSTD (+ .docx)
    └── _arquivo/               Docs da v1.0 (histórico)
```

---

## Saída para o sucessor

Quando o SmartLegis ou a Plataforma IntGov da UnIT estiverem prontos:

```bash
curl -b cookies https://fpl.gov.pt/api/export/canonicos > fpl-export.json
```

O ficheiro resultante segue o schema `fpl-ponte/v1`. É o único formato que o sucessor precisa de aceitar. Depois, decomissionar a VM, manter cópia do SQLite + backup SharePoint para arquivo. **Tempo estimado: 1-2 dias.**

---

## Histórico de versões

### v2.0 · Junho 2026 — Versão actual (simplificada)

Reescrita radical assumindo natureza temporária do sistema. Substituibilidade via JSON canónico passa a prioridade de design #1. Frontend SPA totalmente alinhado com o look-and-feel do demo standalone.

| Sprint | Foco | Saldo |
|---|---|---|
| **1** | Demolição backend | Removidos JWS, Redis, Postgres, SMTP, LDAP, federação, TOTP, threat model. -60% LOC. |
| **2** | JSON canónico (`fpl-ponte/v1`) | Schema único + export/import + snapshot por versão |
| **3** | Bloco D refeito | D.1 obrigatórias / D.2 GSEPCM / D.3 INTEGRA (read-only) |
| **4** | Ficha pública + backup | HTML estático autocontido com hash SHA-256; backup diário em pasta filesystem |
| **5** | Frontend alinhado com API v2.0 | Reescrita login, dashboard, lista, admin. Wizard de audições. |
| **6** | Views grandes reescritas | -1000 LOC em `detalhe-painel.js`; dashboard/lista coerentes |
| **7** | UX polish + admin substancial | Stepper visual, pc-cards, próxima ação. 5 endpoints `/admin/*` (estado, audit log, integridade, utilizadores) |
| **8** | Fix modais + classes consistentes | `.modal-overlay` (centrado, backdrop blur); eliminado `style="..."` inline pesado |
| **9** | Replicação do CSS do demo na SPA | `app.css` reescrito a partir de `demo/demo.css` com aliases para nomes legados. -368 LOC. Estética idêntica ao demo. |

### v1.0 RC · Maio 2026 — Versão anterior (arquivada)

Sistema completo com selos JWS Ed25519, PostgreSQL, Redis, MinIO, SMTP, LDAP, TOTP, threat model, DPIA, etc. **Sobre-engenheirada** para um sistema com horizonte de vida de 18-24 meses. Substituída pela v2.0. Histórico técnico em `docs/_arquivo/`.

---

## Componentes adicionais (não fazem parte do sistema operacional)

- **`demo/`** — Demo interativa autónoma (HTML+JS+localStorage). Publicada em https://dapl-sggov.github.io/pegada/demo/. Útil para mostrar externamente sem dependências do backend.
- **`mock/`** — Página institucional de apresentação. Publicada em https://dapl-sggov.github.io/pegada/. Contém contexto, marcos, links para a documentação e demo.
- **`docs/_arquivo/`** — Documentos da v1.0 RC. Mantidos para histórico.

---

## Onde discutir

- **GitHub:** https://github.com/dapl-sggov/pegada
- **Contacto:** Bernardo Vidal · `bernardomvidal@gmail.com`

## Licença e versão

- **v2.0.0-simplificado** · Junho 2026
- **EUPL-1.2** — ver `LICENSE`
