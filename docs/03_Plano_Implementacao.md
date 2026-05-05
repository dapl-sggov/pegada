# Plano de Implementação — FPL Ponte v1.0

**Cronograma alvo:** Maio–Julho 2026 (12 semanas)
**Equipa-base:** 1 tech lead + 2 backend + 2 frontend + 1 DevOps + 1 QA + 0,5 UX (≈7,5 FTE)
**Filosofia:** *deliver early, iterate*. v1.0 deliberadamente minimalista; v2.0 e v3.0 nos meses seguintes.

---

## Sequência de marcos de engenharia

| # | Marco | Semana | Critério de aceitação |
|---|---|---|---|
| E1 | Setup técnico | 1 | Repos, CI, ambientes dev/staging operacionais |
| E2 | Fundações de domínio | 2 | Modelo de dados implementado, migrations, seed |
| E3 | Auth + RBAC | 2-3 | Login, sessões, papéis, escopo por gabinete |
| E4 | Núcleo CRUD FPL | 3-4 | Criar FPL, editar Bloco A+B, listar, ler |
| E5 | Workflow + marcos | 4-5 | M0..M5 com validações server-side; estados na DB |
| E6 | Bloco D + RTRI mock | 5-6 | Adicionar interações, validar com mock RTRI local |
| E7 | Frontend MVP | 4-7 (paralelo) | UI completa para fluxo M0→M5 |
| E8 | Anexos + auditoria | 6-7 | Upload, download, log de eventos |
| E9 | Notificações | 7 | Email transacional ou queue local |
| E10 | Bloco G (auditoria QA) | 8 | Pontuação, pedido de correção |
| E11 | Portal público | 8-9 | Lista + detalhe FPL publicadas |
| E12 | Hardening segurança | 9-10 | OWASP, headers, rate limit, pen-test interno |
| E13 | Performance + observabilidade | 10 | Métricas, dashboards, SLOs medidos |
| E14 | Acessibilidade WCAG 2.2 AA | 10-11 | Auditoria axe-core sem failures |
| E15 | Pen-test externo | 11 | Findings críticos resolvidos |
| E16 | Piloto 2 ministérios | 11 | Cenários reais executados em staging |
| E17 | Go-live produção | 12 | Sistema em produção, formação concluída |

---

## Detalhe por marco

### E1 — Setup técnico (semana 1)

**Tarefas:**
- Repositório Git (GitHub/GitLab) com branch protection
- Estrutura monorepo: `backend/`, `frontend/`, `shared/`
- CI básico: lint, typecheck, test
- Ambiente dev local com Docker Compose (Node + Postgres + MinIO)
- Ambiente staging provisionado (cloud nacional ou CEGER)
- Documentação README + ARCHITECTURE.md

**Entregáveis:** repositório operacional, build verde, ambiente dev funcional

### E2 — Fundações de domínio (semana 2)

**Tarefas:**
- Migrations para todas as tabelas (Knex.js)
- Seed de gabinetes (15-20 ministérios + estruturas)
- Seed de papéis e utilizadores teste
- Seed de entidades RTRI mock (50-100 entidades realistas)
- Tipos TypeScript partilhados entre backend e frontend
- Validadores Zod para todas as entidades

### E3 — Auth + RBAC (semana 2-3)

**Tarefas:**
- Endpoint POST /api/auth/login com bcrypt
- JWT cookie httpOnly
- Middleware de autenticação
- Middleware de autorização por papel + escopo de gabinete
- TOTP opcional (speakeasy)
- Endpoint /api/auth/me
- Página de login no frontend
- Logout
- Reset de password (token email)

### E4 — Núcleo CRUD FPL (semana 3-4)

**Tarefas:**
- POST /api/fpl (criar com bloco A mínimo)
- GET /api/fpl (lista paginada com filtros: estado, gabinete, q, datas)
- GET /api/fpl/:id (detalhe completo)
- PATCH /api/fpl/:id (atualiza A, B, E)
- Geração automática de número de processo (formato: ANO/SIGLA/NNNN)
- Versionamento: cada PATCH cria entrada em versao_fpl
- GET /api/fpl/:id/versoes
- GET /api/fpl/:id/versoes/:n
- Aplicação de RBAC: ponto focal só vê FPL do seu gabinete; SGGOV vê tudo

### E5 — Workflow + marcos (semana 4-5)

**Tarefas:**
- Implementação da máquina de estados (state machine library ou puro)
- POST /api/fpl/:id/marcos/:marco/validar
- Validações por marco (ver §5 da Arquitetura)
- Devolução estruturada de pendências (lista com path + razão) em 422
- Eventos de auditoria por cada transição
- Bloqueio de transição para trás (exige justificação)
- Endpoint POST /api/fpl/:id/arquivar

### E6 — Bloco D + RTRI mock (semana 5-6)

**Tarefas:**
- Tabela `entrada_bloco_d`
- POST /api/fpl/:id/bloco-d
- PATCH /api/fpl/:id/bloco-d/:eid
- DELETE /api/fpl/:id/bloco-d/:eid (com auditoria)
- Pesquisa RTRI: GET /api/rtri/entidades?q=
- Lookup local primeiro, fallback para mock externo
- Validação cross-field: natureza_juridica=RTRI_INSCRITO ⇒ rtri_id obrigatório
- Marcação rtri_status=PENDENTE quando lookup falha
- Pesquisa ranqueada por similaridade (trigram em PG, custom em SQLite)

### E7 — Frontend MVP (semana 4-7, paralelo)

**Tarefas:**
- Layout base + design system com Radix UI primitives
- Página de lista de FPL com filtros e paginação
- Página de detalhe FPL com tabs (A, B, C, D, E, F, G)
- Formulários para cada bloco com validação client-side (espelhada server-side)
- Componente de timeline da FPL (versões + eventos)
- Componente de validação de marco (mostra pendências, botão validar)
- Componente de upload de anexos
- Estado global: utilizador, FPL atual, lista
- Sistema de notificações in-app (toasts)
- Modo escuro / claro (acessibilidade)
- Indicadores visuais de estado (badges coloridos)

### E8 — Anexos + auditoria (semana 6-7)

**Tarefas:**
- POST /api/fpl/:id/anexos (multipart, max 20MB)
- Validação de mime-type (PDF, DOCX, XLSX)
- Cálculo SHA-256
- Storage filesystem (dev) ou S3-compatible (prod)
- Antivírus em fila assíncrona (ClamAV ou skip em dev)
- GET /api/anexos/:aid (download autenticado)
- Modal de visualização rápida no frontend (PDF inline)
- Audit log para cada operação
- Visão cronológica de eventos por FPL

### E9 — Notificações (semana 7)

**Tarefas:**
- Configuração SMTP
- Templates HTML + texto plano
- Triggers:
  - Validação de marco bloqueante: notifica GSEPCM/SGGOV conforme aplicável
  - Pedido de correção (Bloco G): notifica ponto focal
  - Aprovação de correção: notifica ponto focal
  - Convite a novo utilizador
- Fila local com retry exponencial
- Dashboard de notificações falhadas

### E10 — Bloco G (auditoria QA) (semana 8)

**Tarefas:**
- Tabela auditoria_qa
- POST /api/fpl/:id/auditoria (apenas SGGOV_QA)
- PATCH /api/fpl/:id/auditoria/:aid
- Cálculo automático de pontuação assistida (alguns indicadores)
- Estado da FPL passa a EM_REVISAO_QA quando há pedido de correção
- Workflow de correção: ponto focal recebe, corrige, SGGOV_QA aprova
- Página interna SGGOV de gestão de auditorias

### E11 — Portal público (semana 8-9)

**Tarefas:**
- GET /api/publico/fpl (apenas estado=PUBLICADO)
- GET /api/publico/fpl/:id (campos com visibilidade=Público)
- Filtros: gabinete, ano, tipo, área
- Pesquisa textual
- Página pública sem autenticação
- Layout institucional, branding governamental
- Datasets agregados:
  - GET /api/publico/datasets/fpl.json
  - GET /api/publico/datasets/fpl.csv
  - GET /api/publico/datasets/fpl.jsonld (vocabulário OCDE)
- RSS de novas publicações
- Sitemap

### E12 — Hardening segurança (semana 9-10)

**Tarefas:**
- Rate limiting (express-rate-limit, Redis em produção)
- Helmet.js para security headers
- CSP estrito com nonces
- Validação CSRF (double submit cookie)
- Audit dependências (npm audit, Snyk)
- SAST: ESLint security plugin + Semgrep
- Logs sem PII (redaction)
- Política de password (mínimo 12 chars, complexidade)
- Bloqueio de conta após N tentativas
- Testes de SQL injection, XSS, IDOR
- Configuração de TLS 1.3 only

### E13 — Performance + observabilidade (semana 10)

**Tarefas:**
- Endpoint /metrics (prom-client)
- Métricas: latência por rota, throughput, errors, conexões DB, fila de notificações
- Dashboards Grafana
- Alertas: 5xx > 1%, latência P95 > 1s, fila > 100
- Endpoint /health (DB, disk, dependências)
- Tracing OpenTelemetry (opcional v1.0)
- Otimização de queries (EXPLAIN, índices)

### E14 — Acessibilidade WCAG 2.2 AA (semana 10-11)

**Tarefas:**
- Auditoria axe-core integrada em CI
- Teste manual com leitor de ecrã (NVDA)
- Foco visível em todos os elementos interativos
- Labels associados a inputs
- Contraste mínimo 4.5:1
- Atalhos de teclado documentados
- Declaração de acessibilidade publicada

### E15 — Pen-test externo (semana 11)

**Tarefas:**
- Empresa externa certificada
- Threat modeling formal
- Testes black-box e grey-box
- Relatório com classificação CVSS
- Plano de correções
- Reteste

### E16 — Piloto 2 ministérios (semana 11)

**Tarefas:**
- Selecionar 2 ministérios voluntários
- Sessão de formação (3h)
- Dados reais em staging
- Acompanhamento durante 1 semana
- Recolha de feedback estruturado
- Ajustes de UX prioritários

### E17 — Go-live produção (semana 12)

**Tarefas:**
- Provisionamento final de produção
- Migration aplicada em produção
- Seed de produção (gabinetes, papéis, primeiros utilizadores)
- DNS + TLS + WAF
- Monitorização ativa
- Runbook on-call
- Comunicação institucional
- Formação síncrona de pontos focais (todos)
- Modo "shadow" 24-48h antes do hard-go-live

---

## Decisões em aberto a fechar antes do início

1. **Stack final**: Node.js (recomendado para velocidade) ou Java/Spring (recomendado para alinhamento institucional)
2. **Cloud**: nacional / CEGER on-prem / comercial soberana
3. **Operação pós-go-live**: SGGOV interno / CEGER / fornecedor
4. **Política de retenção**: indefinido (interesse público) ou prazo
5. **Inclusão de Regulamentos no v1.0**: recomendado *não* — guardar para v3.0

---

## Riscos do plano

| Risco | Mitigação |
|---|---|
| RTRI da AR não pronta | Mock local + reconciliação manual |
| autenticação.gov.pt federação atrasa | Login local + TOTP como modo de arranque |
| Pen-test descobre vulnerabilidades críticas | Buffer de 1 semana antes do go-live |
| Pontos focais não aderem | Comprovativo bloqueante + auditoria SGGOV ativa |
| Equipa de 7,5 FTE não disponível a tempo | Reduzir escopo v1.0 ainda mais; adiar Bloco G para v1.1 |

---

## v1.1 — primeiras 4 semanas pós-go-live

- Correções de UX críticas do feedback dos pontos focais
- Hardening adicional pós pen-test
- Onboarding de todos os ministérios restantes
- Estabilização de notificações
- Otimização de performance hot-spots

## v2.0 — outubro 2026

- Federação OIDC com autenticação.gov.pt
- Webhook Consulta.Lex
- Sincronização bidirecional RTRI
- Bloco G QA automatizado
- Dashboards SGGOV completos
- API pública JSON-LD com vocabulário OCDE

## v3.0 — março 2027

- Suporte a Regulamentos
- Federação SmartLegis (modo coexistência)
- API para investigadores
- Visualizações públicas avançadas
