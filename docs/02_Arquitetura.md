# Arquitetura do Sistema FPL Ponte

**Versão:** 1.0 — Maio 2026
**Âmbito:** Aplicação autónoma de Pegada Legislativa, transitória até integração no SmartLegis
**Princípio orientador:** *standalone por design, integrável por construção, deliberadamente minimalista para o go-live*

---

## 1. Visão de alto nível

A aplicação é um **modular monolith** com três blocos lógicos:

```
┌─────────────────────────────────────────────────────────────────┐
│                       UTILIZADORES                              │
│  Pontos focais  │  GSEPCM  │  SGGOV  │  Público  │  Sistemas    │
└────────────┬─────────────┬──────────┬───────────┬───────────────┘
             │             │          │           │
             ▼             ▼          ▼           ▼
┌─────────────────────────────────────────────────────────────────┐
│              FRONTEND (React/Vite SPA)                          │
│  • Aplicação interna (SGGOV + gabinetes)                        │
│  • Portal público (renderizado a partir da mesma API)           │
└─────────────────────────────────────────────────────────────────┘
                            │ HTTPS / JSON
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND (Node.js + Express)                  │
│                                                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────┐   │
│  │  Auth /     │  │  Domínio     │  │  Adapters externos    │   │
│  │  Sessões    │  │  FPL + WF    │  │  RTRI │ CLex │ DRE    │   │
│  └─────────────┘  └──────────────┘  └───────────────────────┘   │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────┐   │
│  │  Auditoria  │  │  Anexos      │  │  Notificações email   │   │
│  └─────────────┘  └──────────────┘  └───────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│           PERSISTÊNCIA                                          │
│  SQLite (dev/protótipo) ──► PostgreSQL (produção)               │
│  Filesystem (anexos dev) ──► Object storage (anexos prod)       │
└─────────────────────────────────────────────────────────────────┘
```

A escolha de Node.js + Express + SQLite (com migração simples para PostgreSQL) é deliberadamente pragmática: minimiza tempo de bootstrap, garante portabilidade, mantém a porta aberta para reescrita em Java/Spring quando o orçamento e o cronograma o permitirem.

---

## 2. Princípios arquiteturais

### 2.1. Modular monolith
Um único processo, mas internamente dividido em módulos com fronteiras claras. Cada módulo expõe uma interface (funções/serviços) e não conhece os internals dos outros. Critério de fronteira: se um módulo precisar de tocar nas tabelas de outro, é tocar via interface, nunca SQL direto.

Módulos previstos:
- `auth` — autenticação, sessões, gestão de utilizadores
- `fpl` — domínio FPL, blocos A-G, máquina de estados
- `versioning` — snapshots e versão atual
- `audit` — log append-only
- `attachments` — upload, scan, storage
- `rtri` — adapter para a API da AR (com fallback local)
- `consultalex` — adapter para Consulta.Lex (com fallback manual)
- `notifications` — email transacional
- `reports` — geração de relatórios e dashboards
- `public` — endpoints públicos (após M5)

### 2.2. API-first
O frontend consome a mesma API REST que qualquer outro cliente (CLI, futuras integrações). Documentada em OpenAPI 3.1 desde o primeiro endpoint. Isto facilita a migração futura para o SmartLegis: a equipa do SmartLegis substitui o frontend ou consome a API durante a coexistência.

### 2.3. Versionamento por snapshot, não event sourcing puro
Cada edição cria uma nova entrada em `versao_fpl` com o snapshot completo em JSONB. O estado atual fica também em `fpl` para queries rápidas. Auditoria perfeita, custo de implementação aceitável, sem replay para reconstruir estado.

### 2.4. Degradação graciosa
Toda integração externa tem modo degradado:
- RTRI offline → inserção manual com flag "validação pendente"
- Consulta.Lex offline → upload manual de CSV de contributos
- autenticação.gov.pt offline → login local (transitório)
- Email offline → notificações ficam em fila, exibidas no dashboard SGGOV

A aplicação **nunca bloqueia operações por falha de sistema externo**. Bloqueia apenas por falha de validação de regra de negócio.

### 2.5. Submissão bloqueante
A máquina de estados impede transições para M3, M4, M5 sem cumprimento dos requisitos. Isto está na lógica do servidor, não no frontend. Não há forma de contornar.

### 2.6. Auditoria por construção
Cada alteração de FPL, anexo, entrada, validação de marco gera evento em `evento_auditoria`. Tabela append-only (DELETE/UPDATE revogados ao nível do utilizador da aplicação). Cada evento contém autor, IP, timestamp, payload.

---

## 3. Modelo de dados (esquema simplificado para v1.0)

```sql
-- Utilizadores
CREATE TABLE utilizador (
    id TEXT PRIMARY KEY,                  -- UUID
    nif TEXT UNIQUE,
    email TEXT NOT NULL UNIQUE,
    nome_completo TEXT NOT NULL,
    password_hash TEXT NOT NULL,          -- bcrypt
    totp_secret TEXT,                      -- 2FA opcional
    ativo INTEGER NOT NULL DEFAULT 1,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Gabinetes (áreas governativas)
CREATE TABLE gabinete (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    sigla TEXT NOT NULL,
    ministerio TEXT,
    ativo INTEGER NOT NULL DEFAULT 1
);

-- Atribuições de papel
CREATE TABLE atribuicao_papel (
    utilizador_id TEXT NOT NULL,
    papel TEXT NOT NULL,                   -- 'PONTO_FOCAL', 'PONTO_FOCAL_ALT', 'GSEPCM', 'SGGOV_QA', 'SGGOV_ADMIN'
    gabinete_id TEXT,                       -- escopo opcional
    desde TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ate TEXT,
    PRIMARY KEY (utilizador_id, papel, gabinete_id)
);

-- FPL — entidade raiz
CREATE TABLE fpl (
    id TEXT PRIMARY KEY,                    -- UUID
    numero_processo TEXT UNIQUE NOT NULL,   -- gerado automaticamente
    tipo_diploma TEXT NOT NULL,             -- DL, PL, DR, RCM_NORMATIVA, DESPACHO_NORMATIVO
    titulo TEXT NOT NULL,
    titulo_curto TEXT,
    gabinete_id TEXT NOT NULL REFERENCES gabinete(id),
    coproponentes TEXT,                      -- JSON array de gabinete_id
    estado_workflow TEXT NOT NULL DEFAULT 'CRIADO',
    -- Bloco B
    tipo_origem TEXT,                        -- PROGRAMA_GOVERNO, TRANSPOSICAO_UE, ...
    referencia_origem TEXT,
    sintese_problema TEXT,
    avaliacao_previa BOOLEAN,
    -- Bloco E
    consulta_lex_ref TEXT,
    consulta_lex_inicio TEXT,
    consulta_lex_fim TEXT,
    consulta_lex_n_contributos INTEGER,
    consulta_lex_sintese TEXT,
    consulta_lex_decisao TEXT,
    -- Marcos validados (timestamps)
    m0_validado_em TEXT,
    m0_validado_por TEXT,
    m1_validado_em TEXT,
    m2_validado_em TEXT,
    m3_validado_em TEXT,
    m3_validado_por TEXT,
    m3_declaracao_completude TEXT,
    m4_validado_em TEXT,
    m4_validado_por TEXT,
    m5_validado_em TEXT,
    -- Metadata
    referencia_dr TEXT,
    data_criacao TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_publicacao TEXT,
    versao_atual INTEGER NOT NULL DEFAULT 1,
    regime_simplificado TEXT,                -- NULL, 'URGENTE', 'TRANSPOSICAO_LITERAL', 'CLASSIFICADO'
    CONSTRAINT estado_valido CHECK (estado_workflow IN
        ('CRIADO','EM_ELABORACAO','EM_CONSULTA_INTERNA',
         'EM_CONSULTA_PUBLICA','EM_RSE','EM_CM',
         'APROVADO','PUBLICADO','EM_REVISAO_QA','ARQUIVADO','REJEITADO_M0'))
);

-- Bloco C — entradas de contributos internos
CREATE TABLE entrada_bloco_c (
    id TEXT PRIMARY KEY,
    fpl_id TEXT NOT NULL REFERENCES fpl(id),
    data TEXT NOT NULL,
    entidade TEXT NOT NULL,
    cargo TEXT,
    forma TEXT NOT NULL,                     -- PARECER_ESCRITO, REUNIAO, AUDIENCIA
    objeto TEXT NOT NULL,
    sintese_posicao TEXT NOT NULL,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Bloco D — interações externas (núcleo da pegada)
CREATE TABLE entrada_bloco_d (
    id TEXT PRIMARY KEY,
    fpl_id TEXT NOT NULL REFERENCES fpl(id),
    data TEXT NOT NULL,
    forma TEXT NOT NULL,                     -- REUNIAO, AUDIENCIA, VIDEOCONFERENCIA, CORRESPONDENCIA, CONTRIBUTO_ESPONTANEO, OUTRA
    entidade_designacao TEXT NOT NULL,
    rtri_id TEXT,
    rtri_status TEXT,                        -- NULL, VALIDADO, PENDENTE, INVALIDO, NAO_APLICAVEL
    natureza_juridica TEXT NOT NULL,         -- RTRI_INSCRITO, RTRI_FORCA_LEI, ACADEMIA_PERITO, AUTORIDADE_PUBLICA, OUTRA
    pessoas_governo TEXT NOT NULL,           -- JSON array
    pessoas_interlocutor TEXT,                -- JSON array
    objeto TEXT NOT NULL,
    sintese_posicao TEXT NOT NULL,
    decisao_incorporacao TEXT,                -- INCORPORADA, PARCIALMENTE_INCORPORADA, NAO_INCORPORADA, SEM_OBJETO
    justificacao_decisao TEXT,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TEXT
);

-- Anexos
CREATE TABLE anexo (
    id TEXT PRIMARY KEY,
    fpl_id TEXT NOT NULL REFERENCES fpl(id),
    bloco TEXT NOT NULL,                     -- 'C', 'D', 'E'
    entrada_id TEXT,
    nome_original TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    tamanho_bytes INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    visibilidade TEXT NOT NULL DEFAULT 'INTERNO',
    upload_por TEXT NOT NULL REFERENCES utilizador(id),
    upload_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    antivirus_status TEXT NOT NULL DEFAULT 'PENDENTE'
);

-- Versão (snapshot imutável)
CREATE TABLE versao_fpl (
    id TEXT PRIMARY KEY,
    fpl_id TEXT NOT NULL REFERENCES fpl(id),
    numero INTEGER NOT NULL,
    autor_id TEXT NOT NULL REFERENCES utilizador(id),
    timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    snapshot TEXT NOT NULL,                  -- JSON
    marco_validado TEXT,
    UNIQUE (fpl_id, numero)
);

-- Eventos de auditoria
CREATE TABLE evento_auditoria (
    id TEXT PRIMARY KEY,
    fpl_id TEXT,
    tipo_evento TEXT NOT NULL,
    autor_id TEXT,
    timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    payload TEXT NOT NULL,                   -- JSON
    ip_origem TEXT,
    user_agent TEXT
);

-- Cache RTRI
CREATE TABLE entidade_rtri (
    rtri_id TEXT PRIMARY KEY,
    designacao TEXT NOT NULL,
    natureza_juridica TEXT,
    ativo INTEGER NOT NULL DEFAULT 1,
    data_inscricao TEXT,
    ultima_sincronizacao TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Auditoria QA (Bloco G)
CREATE TABLE auditoria_qa (
    id TEXT PRIMARY KEY,
    fpl_id TEXT NOT NULL REFERENCES fpl(id),
    auditor_id TEXT NOT NULL REFERENCES utilizador(id),
    data_auditoria TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    pontuacao INTEGER NOT NULL CHECK (pontuacao BETWEEN 0 AND 100),
    observacoes TEXT,
    pedido_correcao INTEGER NOT NULL DEFAULT 0,
    descricao_correcao TEXT,
    estado_correcao TEXT DEFAULT 'PENDENTE'  -- PENDENTE, EM_CURSO, CONCLUIDA
);
```

---

## 4. Endpoints da API (excerto)

```
# Auth
POST   /api/auth/login                      # email + password (+ TOTP opcional)
POST   /api/auth/logout
GET    /api/auth/me                         # perfil + papéis

# FPL
GET    /api/fpl                              # lista paginada com filtros
POST   /api/fpl                              # cria FPL (M0 implícito após preenchimento mínimo)
GET    /api/fpl/:id                          # detalhe
PATCH  /api/fpl/:id                          # atualiza campos do bloco A/B/E
GET    /api/fpl/:id/versoes
GET    /api/fpl/:id/versoes/:n
POST   /api/fpl/:id/marcos/:marco/validar    # M0..M5
POST   /api/fpl/:id/arquivar

# Bloco C
POST   /api/fpl/:id/bloco-c
PATCH  /api/fpl/:id/bloco-c/:eid
DELETE /api/fpl/:id/bloco-c/:eid

# Bloco D
POST   /api/fpl/:id/bloco-d
PATCH  /api/fpl/:id/bloco-d/:eid
DELETE /api/fpl/:id/bloco-d/:eid

# Anexos
POST   /api/fpl/:id/anexos                   # multipart
GET    /api/anexos/:aid                      # download autenticado

# RTRI
GET    /api/rtri/entidades?q=                # pesquisa local + fallback API AR
GET    /api/rtri/entidades/:rtriId

# Auditoria QA (apenas SGGOV_QA)
POST   /api/fpl/:id/auditoria
PATCH  /api/fpl/:id/auditoria/:aid

# Pública
GET    /api/publico/fpl                      # lista pública (apenas PUBLICADO)
GET    /api/publico/fpl/:id                  # detalhe público
GET    /api/publico/datasets/fpl.json        # dataset agregado JSON
GET    /api/publico/datasets/fpl.csv         # dataset agregado CSV
GET    /api/publico/datasets/fpl.jsonld      # JSON-LD vocabulário OCDE

# Admin
GET    /api/admin/utilizadores
POST   /api/admin/utilizadores
GET    /api/admin/auditoria                  # log de eventos
GET    /api/admin/dashboard                  # KPIs internos
```

---

## 5. Máquina de estados detalhada

```
                ┌───────────┐
                │  CRIADO   │  (FPL acabou de ser criada)
                └─────┬─────┘
                      │ M0 (ponto focal valida bloco A+B preenchidos)
                      ▼
              ┌────────────────┐
              │ EM_ELABORACAO  │
              └────┬───────────┘
                   │
       ┌───────────┴───────────┐
       │                       │
       │ M1 (opcional)         │
       ▼                       │
┌────────────────────┐         │
│EM_CONSULTA_PUBLICA │         │
└────┬───────────────┘         │
     │ M2                      │
     │                         │
     └────────┬────────────────┘
              │
              │ M3 (validação bloqueante: bloco D completo, declaração F)
              ▼
        ┌──────────┐
        │  EM_RSE  │
        └────┬─────┘
             │ M4 (validação bloqueante: tudo completo, segunda declaração F)
             ▼
        ┌──────────┐
        │  EM_CM   │
        └────┬─────┘
             │ aprovação CM
             ▼
        ┌──────────┐
        │ APROVADO │
        └────┬─────┘
             │ M5 (publicação no DR confirmada)
             ▼
        ┌───────────┐
        │ PUBLICADO │  (estado final: imutável, exposto ao público)
        └───────────┘

  Estados off-path:
  • REJEITADO_M0: ponto focal não consegue completar abertura
  • EM_REVISAO_QA: SGGOV pediu correção (Bloco G)
  • ARQUIVADO: diploma abandonado
```

**Regras de validação de transição (server-side):**

| Marco | Pré-condições |
|---|---|
| M0 | Bloco A completo + Bloco B obrigatórios preenchidos |
| M1 | M0 validado |
| M2 | M1 validado + Bloco E síntese e decisão preenchidas |
| M3 | M0 validado + Bloco D: cada entrada com decisão de incorporação preenchida + Bloco F: declaração assinada |
| M4 | M3 validado + todos os blocos completos + segunda declaração F |
| M5 | M4 validado + referência DR registada |

---

## 6. Fluxos críticos (sequence diagrams)

### 6.1. Criação de FPL e validação M0

```
Ponto Focal      Frontend           Backend           DB
    │              │                   │                │
    │  Login       │                   │                │
    ├─────────────►│                   │                │
    │              │  POST /auth/login │                │
    │              ├──────────────────►│                │
    │              │                   │  SELECT user   │
    │              │                   ├───────────────►│
    │              │                   │◄───────────────┤
    │              │  JWT cookie       │                │
    │              │◄──────────────────┤                │
    │              │                   │                │
    │  Nova FPL    │                   │                │
    ├─────────────►│                   │                │
    │              │  POST /api/fpl    │                │
    │              ├──────────────────►│                │
    │              │                   │  INSERT fpl    │
    │              │                   ├───────────────►│
    │              │                   │  INSERT versao │
    │              │                   ├───────────────►│
    │              │                   │  INSERT evento │
    │              │                   ├───────────────►│
    │              │  201 Created      │                │
    │              │◄──────────────────┤                │
    │              │                   │                │
    │  Preenche A+B│                   │                │
    │              │  PATCH /api/fpl/:id                │
    │              ├──────────────────►│                │
    │              │                   │  validate      │
    │              │                   │  UPDATE fpl    │
    │              │                   │  INSERT versao │
    │              │                   │  INSERT evento │
    │              │                   ├───────────────►│
    │              │  200 OK           │                │
    │              │◄──────────────────┤                │
    │              │                   │                │
    │  Valida M0   │                   │                │
    │              │  POST /api/fpl/:id/marcos/M0/validar│
    │              ├──────────────────►│                │
    │              │                   │  check rules   │
    │              │                   │  UPDATE estado │
    │              │                   │  INSERT versao │
    │              │                   │  INSERT evento │
    │              │                   ├───────────────►│
    │              │  200 OK           │                │
    │              │◄──────────────────┤                │
```

### 6.2. Validação M3 (bloqueante)

```
Backend recebe POST /api/fpl/:id/marcos/M3/validar
  │
  ├─► Verifica autorização (ponto focal do gabinete)
  ├─► Verifica estado atual (deve estar EM_ELABORACAO ou EM_CONSULTA_PUBLICA)
  ├─► Verifica Bloco A: todos campos obrigatórios preenchidos?
  ├─► Verifica Bloco B: tipo_origem + sintese_problema?
  ├─► Verifica Bloco D: para cada entrada → decisao_incorporacao + justificacao?
  ├─► Verifica declaração F assinada com timestamp e identificação
  │
  ├─► Se algum check falha → 422 Unprocessable Entity com lista de pendências
  │
  └─► Se tudo OK:
        ├─► UPDATE fpl SET estado_workflow='EM_RSE', m3_validado_em=now, m3_validado_por=user
        ├─► INSERT versao_fpl com snapshot + marco_validado='M3'
        ├─► INSERT evento_auditoria tipo='M3_VALIDADO'
        ├─► Notificação email para GSEPCM
        └─► 200 OK
```

---

## 7. Stack concreta (v1.0)

| Camada | Tecnologia | Justificação |
|---|---|---|
| Runtime | Node.js 20 LTS | Maturidade, performance, ecossistema |
| Web framework | Express 4 | Simplicidade, controlo, sem mágica |
| Persistência | better-sqlite3 (dev), pg + Knex (prod) | SQLite para zero-friction; PostgreSQL com migrations Knex em produção |
| Auth | bcrypt + JWT (cookies httpOnly) + speakeasy (TOTP) | Stack standard sem dependências exóticas |
| Validação | Zod | Type-safe schemas server-side |
| Frontend | React 18 + Vite + TypeScript | Padrão moderno, build rápido |
| UI components | Radix UI primitives + CSS custom | Acessibilidade WCAG 2.2 AA out of the box |
| Estado frontend | Zustand + React Query | Simples, sem boilerplate |
| Routing frontend | React Router 6 | Standard |
| Logging | Pino | Estruturado, performante |
| Email | Nodemailer + SMTP gov | Simples, controlável |
| Testes | Vitest + Supertest + Playwright | Cobertura unit + integração + e2e |
| CI/CD | GitHub Actions / GitLab CI | Conforme infraestrutura |
| Container | Docker + docker-compose | Padrão atual |

---

## 8. Modelo de segurança

- **Autenticação**: email + password (bcrypt cost 12) + TOTP opcional para papéis sensíveis
- **Sessões**: JWT em cookie httpOnly, secure, sameSite=strict; expiração 8h
- **CSRF**: token duplo (cookie + header) em todas mutações
- **Rate limiting**: por IP e por user; 100 req/min normal, 10 req/min em endpoints de auth
- **Headers**: HSTS, CSP estrito, X-Frame-Options DENY, Referrer-Policy strict-origin
- **Validação**: Zod no servidor, sempre; nada confia no cliente
- **SQL**: queries parametrizadas via better-sqlite3 / Knex; nunca string concatenation
- **Anexos**: SHA-256 calculado no upload; antivírus em fila assíncrona; visibilidade configurável
- **Logs**: sem PII em logs por defeito; redaction automática

---

## 9. Estratégia de degradação

| Sistema externo | Modo nominal | Modo degradado | Trigger de fallback |
|---|---|---|---|
| RTRI (AR) | Pesquisa via API + cache local | Inserção manual com flag PENDENTE; reconciliação manual semanal | API responde 5xx ou timeout > 5s |
| Consulta.Lex | Webhook para importar contributos | Upload manual de CSV de contributos | Webhook não recebe há > 7 dias após encerramento esperado |
| autenticação.gov.pt | OIDC federado | Login local com email + password + TOTP | Federação não configurada ou indisponível |
| DRE | Polling diário automático | Marcação manual de M5 pelo SGGOV | API DR indisponível por > 24h |
| Email SMTP | Envio em fila | Notificações ficam no dashboard SGGOV até retoma | SMTP rejeita ou timeout |

---

## 10. Caminho para o SmartLegis

A v1.0 expõe API REST com OpenAPI 3.1 documentada. Quando o módulo SmartLegis estiver pronto:

1. **Fase A — Coexistência**: SmartLegis consome `/api/fpl/:id` para ler; toda edição continua na aplicação ponte
2. **Fase B — Migração**: novos diplomas vão para SmartLegis; antigos permanecem; export/import de dados via API
3. **Fase C — Sunset**: todas FPL ativas no SmartLegis; aplicação ponte vira read-only
4. **Fase D — Arquivo**: aplicação ponte arquivada; URLs públicas com redirect 301 para SmartLegis

A migração de dados é facilitada pelo schema flat: cada FPL é um JSON exportável, com versões e eventos associados.

---

## 11. Observabilidade mínima v1.0

- Logging estruturado JSON para stdout (Pino)
- Métricas Prometheus em endpoint `/metrics` (latência, throughput, status code distribution)
- Health check em `/health` (DB connectivity, disk space)
- Dashboard SGGOV interno com KPIs:
  - FPL criadas / dia
  - Marcos validados / dia
  - Pontos focais ativos
  - Distribuição por estado
  - Tempo médio entre M0 e M5
  - Falhas RTRI nas últimas 24h
  - Anexos uploaded / dia

---

## 12. Próximos passos (engenharia)

Ver documento `03_Plano_Implementacao.md`.
