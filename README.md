# Sistema FPL Ponte — Pacote completo

**Maio 2026 · Demonstração funcional para a SGGOV · v0.2**

> **Novidades v0.2:** upload de anexos (PDF/DOC/XLS) com SHA-256 e antivírus simulado · notificações in-app + outbox de email · 2FA TOTP RFC 6238 · federação simulada (Cartão de Cidadão / CMD) · webhook Consulta.Lex + import CSV · CSP estrito + CSRF + rate limit + bloqueio de conta · acessibilidade WCAG 2.2 AA (ARIA, focus visível, contraste AA/AAA, skip link).

Este pacote contém quatro componentes:

```
Sistema/
├── docs/                       Documentação técnica
│   ├── 01_Analise_Critica.md   Análise crítica do documento de especificações
│   ├── 02_Arquitetura.md       Arquitetura do sistema FPL Ponte
│   └── 03_Plano_Implementacao.md  Plano de implementação com 17 marcos de engenharia
│
├── mock/                       Mock interativo (HTML standalone)
│   └── index.html              Demonstração visual para apresentação aos decisores
│
└── app/                        Sistema funcional real
    ├── backend/                Node.js + Express + SQLite
    │   ├── package.json
    │   └── src/
    │       ├── server.js       HTTP server + frontend serving
    │       ├── db.js           Schema SQLite (node:sqlite nativo)
    │       ├── auth.js         Login, sessões, RBAC
    │       ├── workflow.js     Máquina de estados + validações por marco
    │       ├── fpl.js          Domínio FPL: criar, editar, versionar, validar
    │       ├── rtri.js         Adapter RTRI (mock local)
    │       ├── routes.js       Endpoints REST
    │       └── seed.js         Dados de demonstração
    ├── frontend/               SPA vanilla JS
    │   ├── index.html
    │   ├── app.css             Design system institucional
    │   └── app.js              SPA completa
    └── data/                   SQLite DB (criada automaticamente)
```

---

## Como executar a demonstração

### 1. Mock visual (zero dependências)

Abra `mock/index.html` num navegador. Funciona sem servidor, com dados pré-povoados. Serve para apresentação aos decisores.

### 2. Sistema funcional

Pré-requisitos: **Node.js 22+** (testado com v24.14).

```bash
cd Sistema/app/backend
npm install
node src/seed.js     # popula a base de dados com utilizadores, gabinetes, FPL exemplo
node src/server.js   # arranca em http://localhost:3717
```

Abrir http://localhost:3717 no navegador.

### 3. Stack completa com Docker (infraestrutura-alvo CEGER)

A partir da v0.2 existe orquestração que reflete a infraestrutura de produção
(PostgreSQL + Redis + MinIO + app), preparada para migração para o CEGER:

```bash
cp .env.example .env       # ajustar segredos (JWT_SECRET, CL_WEBHOOK_KEY, passwords)
docker compose up -d       # sobe postgres + redis + minio + app
```

- App em `http://localhost:3717`
- Consola MinIO em `http://localhost:9001`
- Consola SQL (Adminer): `docker compose --profile tools up -d adminer` → `http://localhost:8080`

> **Estado da migração:** a Fase 1 (infraestrutura: `config.js` 12-factor,
> `docker-compose.yml`, `Dockerfile`, `release.yml`, runbook `docs/06_Operacao.md`)
> está concluída. A Fase 2 — refactor do código de SQLite síncrono para
> PostgreSQL/MinIO/Redis assíncronos — está documentada e em curso num branch
> dedicado. Até estar concluída, o `node src/server.js` continua a usar SQLite
> (modo legado), controlado pela flag `DB_FORCE_SQLITE`.

Ver **[`docs/06_Operacao.md`](docs/06_Operacao.md)** para o runbook completo
de instalação, backup, observabilidade e go-live no CEGER.

### Utilizadores de demonstração

Todos com password `demo1234`:

| Email | Papel | Gabinete |
|---|---|---|
| `maria.silva@gov.pt` | PONTO_FOCAL | MAE |
| `joao.pereira@gov.pt` | PONTO_FOCAL_ALT | MAE |
| `ana.santos@gov.pt` | PONTO_FOCAL | MS |
| `pedro.lopes@gov.pt` | PONTO_FOCAL | MTSSS |
| `rui.ferreira@sggov.pt` | SGGOV_QA | — |
| `carla.almeida@sggov.pt` | SGGOV_ADMIN | — |
| `gsepcm@gov.pt` | GSEPCM | — |

NIFs para teste da federação simulada: `100000001` (Maria), `100000005` (Rui), `100000006` (Carla), etc.

---

## O que o sistema demonstra

### Submissão bloqueante (núcleo do regime)

A máquina de estados está implementada no servidor. Tente:

1. Criar uma FPL nova (Maria Silva).
2. Tentar validar M0 sem síntese de problema com 200+ caracteres → o servidor devolve **422 com lista de pendências**.
3. Adicionar entrada no Bloco D sem decisão de incorporação.
4. Tentar validar M3 → o servidor devolve as pendências (decisão por preencher) com referência exata à entrada.
5. Preencher a decisão. Tentar M3 outra vez → passa para EM_RSE.

### Validação RTRI

No formulário de Bloco D, comece a escrever "APREN" ou "EDP" no campo de pesquisa RTRI. A pesquisa real-time bate contra a tabela `entidade_rtri` (cache local de 15 entidades reais).

Para entidades sem RTRI (peritos, autoridades públicas), preencha manualmente — o sistema marca `rtri_status = NAO_APLICAVEL`.

### Versionamento e auditoria

Cada PATCH a uma FPL cria entrada em `versao_fpl` com snapshot JSON imutável. Cada operação cria entrada em `evento_auditoria` com IP, user-agent, autor.

Visível no separador "Histórico" da FPL.

### Escopo por gabinete

Maria Silva (MAE) só vê as FPL do MAE. Carla Almeida (SGGOV_ADMIN) vê tudo. Validado server-side em cada endpoint.

### Portal público

`GET /api/publico/fpl` (sem autenticação) devolve apenas FPL com estado=PUBLICADO, com filtro de visibilidade dos campos.

`GET /api/publico/datasets/fpl.csv` devolve dataset agregado em formato aberto.

---

## O que foi adicionado na v0.2

### Anexos (NOVO)
- Upload multipart manual (parser pure-JS, sem dependências externas)
- Tipos aceites: PDF, DOC(X), XLS(X) · máximo 20 MB
- SHA-256 calculado em cada upload
- Scan antivírus simulado (deteta padrões EICAR-like + scripts)
- Quarentena automática para ficheiros infetados
- Visibilidade configurável (Interno / Público após M5)
- Storage filesystem em `app/data/anexos/`
- Endpoint público `GET /api/anexos/:aid` (autorização por escopo de gabinete + visibilidade)
- Eliminação com auditoria

### Notificações (NOVO)
- Tabela `notificacao` + `outbox_email`
- Templates por tipo de evento (M3, M4, auditoria QA, consulta.lex, correção)
- Bell de notificações no topbar com badge de não lidas
- Modal de gestão (marcar lida, abrir FPL associada, marcar todas)
- Polling automático a cada 30s
- "Outbox" SMTP simulado, visível pela SGGOV_ADMIN, com worker de envio simulado

### 2FA TOTP (NOVO)
- Implementação RFC 6238 pure-JS (`src/totp.js`)
- Compatível com Google Authenticator, Microsoft Authenticator, Authy
- Setup com chave manual exibida (sem QR — CSP estrito não permite imagens externas)
- Login pede código quando 2FA está ativo
- Desativação requer confirmação

### Federação simulada autenticação.gov.pt (NOVO)
- Fluxo OAuth-like: `/api/auth/federacao/start` → página `/federacao-simulada.html` → callback
- Mapeia NIF → utilizador local
- State token expira em 5 min
- Substitui apenas o IdP real; arquitetura permite trocar por OIDC verdadeiro com mudança trivial

### Webhook Consulta.Lex (NOVO)
- `POST /api/hooks/consulta-lex` autenticado por `X-CL-Key` (chave pré-partilhada)
- Importa contributos para tabela `contributo_consulta` + atualiza Bloco E
- Notifica pontos focais do gabinete proponente
- **Fallback manual:** import CSV via UI (`POST /api/fpl/:id/consulta-lex/import-csv`)

### Bloco G — fluxo de auditoria QA completo (NOVO)
- Modal "Nova auditoria" para SGGOV (pontuação 0-100, observações, pedido de correção)
- Tab Bloco G no detalhe da FPL
- Fluxo de correção: `PENDENTE` → ponto focal "iniciar" → `EM_CURSO` → "submeter" → `SUBMETIDA` → SGGOV "aprovar" → `CONCLUIDA`
- Notifica em cada transição
- Bloqueia M4 enquanto houver pedidos de correção pendentes

### Hardening de segurança (NOVO)
- **CSRF**: double-submit cookie (`fpl_csrf`) + header `x-csrf-token` em todas as mutações
- **Rate limiting**: 240/min geral; 20/5min por IP + 5/5min por email no login
- **Bloqueio de conta**: 8 tentativas falhadas em 30min ⇒ bloqueio 30min
- **CSP estrito**: `default-src 'self'`, `script-src 'self'`, sem `unsafe-eval`, sem origens externas
- **Outros headers**: HSTS (em produção), X-Frame-Options DENY, Permissions-Policy restritiva, COOP/CORP same-origin
- **Tentativas registadas**: tabela `tentativa_login` para auditoria; visível no dashboard SGGOV

### Acessibilidade WCAG 2.2 AA (NOVO)
- **Contraste**: cor `--text-muted` agora tem ratio 7.0:1 (AAA), `--text-faint` 4.5:1 (AA)
- **Skip link** "Saltar para conteúdo principal" (visível em foco)
- **Focus visível**: outline duplo (azul gov / dourado) em botões e links
- **ARIA**: `role`, `aria-label`, `aria-current`, `aria-selected`, `aria-required`, `aria-live`, `aria-labelledby`
- **Tabs com keyboard**: setas implícitas via tab order
- **Modais**: `aria-label` "Fechar"
- **Demo-users como `<button>`**: navegáveis por teclado
- **Bell de notificações**: `aria-label` dinâmico com contagem
- **`hidden` em vez de `display:none`** nas tabs (correto para leitores de ecrã)

## O que ficou explicitamente fora desta entrega

- **Federação OIDC real com autenticação.gov.pt** — exige processo formal AMA. A federação simulada está pronta a ser substituída.
- **API RTRI real da AR** — exige acordo formal e API documentada. Cache local com 15 entidades reais.
- **SMTP real** — implementação trivial via Nodemailer + SMTP do Governo. Outbox está pronta para o consumir.
- **ClamAV real** — interface está abstraída em `scanForViruses()`. Trocar por daemon ClamAV é trivial.
- **PostgreSQL** — SQLite é suficiente para protótipo. Migração para PG: trocar driver e adaptar 2-3 queries específicas.
- **Pen-test externo** — exige empresa certificada. As fundações OWASP estão postas.
- **Auditoria WCAG 2.2 AA externa** — exige avaliador externo. Todas as boas-práticas técnicas estão aplicadas.
- **Kubernetes / cloud nacional** — fora do âmbito do protótipo.

---

## Endpoints principais (v0.2)

```
# Auth + 2FA + Federação
POST   /api/auth/login                          — login (cookie httpOnly + JWT)
POST   /api/auth/logout
GET    /api/auth/me
GET    /api/auth/csrf                           — obter token CSRF
POST   /api/auth/totp/setup                     — gera secret TOTP
POST   /api/auth/totp/activate                  — ativa após confirmar código
POST   /api/auth/totp/disable
GET    /api/auth/federacao/start                — inicia fluxo CMD/CC
POST   /api/auth/federacao/callback             — completa fluxo

# Domínio FPL
GET    /api/gabinetes
GET    /api/fpl
POST   /api/fpl
GET    /api/fpl/:id
PATCH  /api/fpl/:id/bloco-b
PATCH  /api/fpl/:id/bloco-e
POST   /api/fpl/:id/bloco-c
POST   /api/fpl/:id/bloco-d
PATCH  /api/fpl/:id/bloco-d/:eid
POST   /api/fpl/:id/marcos/:marco/validar
GET    /api/fpl/:id/versoes
GET    /api/fpl/:id/eventos

# Anexos (NOVO)
GET    /api/fpl/:id/anexos
POST   /api/fpl/:id/anexos                      — multipart (PDF/DOC/XLS, ≤20MB)
GET    /api/anexos/:aid                         — download autorizado
DELETE /api/anexos/:aid

# RTRI
GET    /api/rtri/entidades?q=
GET    /api/rtri/entidades/all
GET    /api/rtri/entidades/:rtriId

# Auditoria QA + fluxo correção (NOVO)
POST   /api/fpl/:id/auditoria
PATCH  /api/fpl/:id/auditoria/:aid              — fluxo PENDENTE→EM_CURSO→SUBMETIDA→CONCLUIDA
GET    /api/fpl/:id/auditoria

# Notificações (NOVO)
GET    /api/notificacoes
POST   /api/notificacoes/:id/lida
POST   /api/notificacoes/lidas-todas
GET    /api/admin/outbox                        — apenas SGGOV_ADMIN
POST   /api/admin/outbox/processar

# Webhook Consulta.Lex (NOVO)
POST   /api/hooks/consulta-lex                  — autenticado por X-CL-Key
POST   /api/fpl/:id/consulta-lex/import-csv     — fallback manual
GET    /api/fpl/:id/contributos-cl

# Pública
GET    /api/publico/fpl
GET    /api/publico/fpl/:id
GET    /api/publico/datasets/fpl.json
GET    /api/publico/datasets/fpl.csv
GET    /api/publico/datasets/fpl.jsonld         — vocabulário OCDE 2024 (NOVO)

# Admin
GET    /api/admin/dashboard                     — KPIs + tentativas falhadas 24h
```

---

## Estrutura da BD

10 tabelas principais (ver `src/db.js` para schema completo):

- `utilizador` + `atribuicao_papel` + `gabinete` — pessoas e RBAC
- `fpl` — entidade raiz da Ficha
- `entrada_bloco_c` — contributos internos
- `entrada_bloco_d` — interações externas (núcleo da pegada)
- `versao_fpl` — snapshots imutáveis
- `evento_auditoria` — log append-only
- `entidade_rtri` — cache local
- `auditoria_qa` — Bloco G (auditoria SGGOV)
- `anexo` — referências a documentos (storage não implementado nesta demo)

---

## Próximos passos

As decisões estruturais foram tomadas pelos documentos de decisão da SGGOV
(Memorando Executivo v5 + RCM v2) — ver **[`docs/07_Adaptacao_Brainstorming.md`](docs/07_Adaptacao_Brainstorming.md)**.
O quadro técnico ficou:

- **Confinamento à RING** — aplicação não exposta à internet, acesso por VPN, sem federação OIDC
- **Acoplamento por comprovativo criptográfico** — a app emite um JWS Ed25519 em cada marco
  bloqueante (M0/M3/M4/M5); o SmartLegis verifica-o offline e bloqueia a tramitação se inválido
- **Publicação no Portal do Governo** — a app exporta pacotes estruturados; o portal serve-os
  ao público, ao lado da Agenda Pública dos membros do Governo
- **Gestão exclusivamente SGGOV** — build interno, sem contratação externa de desenvolvimento

Caminho para a v1.0 de produção:

1. **Fase 1 — Infraestrutura de portabilidade** ✅ concluída (config 12-factor, Docker Compose
   com Postgres+Redis+MinIO, Dockerfile, release.yml, runbook `docs/06`)
2. **Fase 2 — Refactor do código** (branch dedicado): SQLite→Postgres assíncrono, storage→MinIO,
   Redis, **módulo de comprovativo criptográfico**, módulo de exportação para o Portal do Governo
3. Auth via diretório interno dos serviços (LDAP/AD) — *adapter* substitui o login local
4. Pen-test externo · auditoria de acessibilidade WCAG 2.2 AA
5. Piloto com 2 ministérios · go-live na RING até 27 de julho de 2026 (prazo legal)

Cronograma de engenharia: ~11 semanas a partir do arranque da equipa.

---

*FPL Ponte v0.2 · SGGOV · Maio 2026 · Demonstração funcional · documentação revista após decisões de maio*
