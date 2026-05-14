# Arquitetura do Sistema FPL Ponte

**Versão:** 2.0 — Maio 2026 (revista após decisões do Memorando Executivo e da RCM v2)
**Âmbito:** Aplicação autónoma de Pegada Legislativa, transitória até integração no SmartLegis
**Princípios fixados pela decisão política:** confinamento à RING · acoplamento por comprovativo criptográfico · gestão exclusivamente SGGOV · publicação no Portal do Governo · degradação graciosa para o RTRI

> **Nota de versão.** Esta v2.0 substitui a v1.0 incorporando as seis decisões estruturais dos documentos de decisão (ver `docs/07_Adaptacao_Brainstorming.md`). As mudanças face à v1.0: a aplicação deixa de estar exposta à internet e de federar com o autenticação.gov.pt; o bloqueio passa a fazer-se por comprovativo criptográfico verificável pelo SmartLegis; o portal público sai da aplicação e a publicação passa a ser feita no Portal do Governo.

---

## 1. Visão de alto nível

A aplicação é um **modular monolith** que opera **dentro da Rede Informática do Governo (RING)**, sem qualquer face exposta à internet pública.

```
  ┌──────────────────────────────────────────────────────────────┐
  │                  REDE INFORMÁTICA DO GOVERNO (RING)          │
  │                  acesso mediado por VPN do Governo           │
  │                                                              │
  │   Pontos focais   GSEPCM   SGGOV (QA + admin)                │
  │        │             │          │                           │
  │        └─────────────┴──────────┘                            │
  │                      │ HTTPS interno                         │
  │            ┌─────────▼──────────┐                            │
  │            │  FRONTEND (SPA)    │  servida pelo backend       │
  │            └─────────┬──────────┘                            │
  │                      │                                       │
  │   ┌──────────────────▼───────────────────────────────────┐   │
  │   │            BACKEND (Node.js + Express)               │   │
  │   │                                                      │   │
  │   │  Auth        Domínio FPL    Comprovativo cripto      │   │
  │   │  (dir.       + Workflow     (emissão + verificação)  │   │
  │   │   interno)   M0-M5                                   │   │
  │   │  Auditoria   Anexos         Adapters externos        │   │
  │   │  Notificações Exportação    RTRI │ Consulta.Lex      │   │
  │   └──────────────────┬───────────────────────────────────┘   │
  │                      │                                       │
  │   ┌──────────────────▼───────────────────────────────────┐   │
  │   │  PostgreSQL  │  Redis  │  MinIO (anexos, S3 API)      │   │
  │   └──────────────────────────────────────────────────────┘   │
  │                      │                                       │
  │            ┌─────────▼──────────┐    ┌──────────────────┐    │
  │            │ Comprovativo (JWS) │    │ Pacote estrutu-  │    │
  │            │ → copiado para o   │    │ rado → transferi-│    │
  │            │   SmartLegis       │    │ do p/ Portal Gov │    │
  │            └─────────┬──────────┘    └────────┬─────────┘    │
  └──────────────────────┼────────────────────────┼─────────────┘
                         │ handoff                │ transferência
                         │ máquina-a-máquina      │ controlada
              ┌──────────▼─────────┐    ┌──────────▼──────────┐
              │     SmartLegis     │    │  Portal do Governo  │
              │  verifica o JWS    │    │  publica a FPL ao   │
              │  com chave pública │    │  lado da Agenda     │
              │  e bloqueia se     │    │  Pública            │
              │  inválido          │    │  (acesso público)   │
              └────────────────────┘    └─────────────────────┘
```

Duas fronteiras de saída, ambas **assíncronas e desacopladas**:
1. **Para o SmartLegis** — por comprovativo criptográfico copiado pelo ponto focal (handoff máquina-a-máquina, verificação offline).
2. **Para o Portal do Governo** — por transferência controlada de pacotes estruturados (inicialmente manual, depois automatizada).

A aplicação **não tem dependências síncronas** de nenhum sistema externo. A única integração externa de consumo é o RTRI, com degradação graciosa.

---

## 2. Princípios arquiteturais

### 2.1. Confinamento à RING
A aplicação vive dentro da rede do Governo. O acesso é mediado em duas camadas: (i) VPN do Governo para entrar na RING; (ii) autenticação aplicacional via **diretório interno dos serviços** (LDAP/AD), com TOTP para papéis sensíveis. Não há exposição à internet, não há federação OIDC, não há CORS aberto. A superfície de ataque externa do sistema principal é nula.

### 2.2. Modular monolith
Um único processo, internamente dividido em módulos com fronteiras claras: `auth`, `fpl`, `workflow`, `comprovativo`, `versioning`, `audit`, `attachments`, `rtri`, `consultalex`, `notifications`, `export`. Um módulo só toca nas tabelas de outro através da sua interface.

### 2.3. Acoplamento por comprovativo, não por integração síncrona
A app não chama o SmartLegis nem é chamada por ele. Em cada marco bloqueante emite um comprovativo criptográfico assinado; o SmartLegis verifica-o offline. Robustez a mudanças de pessoal e a indisponibilidades transitórias de qualquer dos lados.

### 2.4. API-first interno
Toda a funcionalidade é exposta via API REST documentada em OpenAPI 3.1. O frontend é apenas mais um cliente. Facilita a migração futura para o SmartLegis.

### 2.5. Versionamento por snapshot
Cada edição cria uma entrada em `versao_fpl` com o snapshot completo em JSONB. O estado atual também fica em `fpl` para queries rápidas. Sem event sourcing puro.

### 2.6. Degradação graciosa
A única dependência externa relevante é o RTRI. Tudo o resto (Consulta.Lex, email, Portal do Governo) é assíncrono e tem modo manual. A aplicação nunca bloqueia uma operação de negócio por falha de infraestrutura externa — só por falha de regra de validação.

### 2.7. Submissão bloqueante em dois níveis
1. **Interno:** a máquina de estados impede a validação de um marco sem cumprir as regras de completude e fundamentação (lógica no servidor).
2. **Externo:** ao validar um marco bloqueante, a app emite o comprovativo que torna o cumprimento verificável e *enforceable* pelo SmartLegis.

### 2.8. Auditoria por construção
Cada alteração de FPL, anexo, entrada, validação de marco e emissão de comprovativo gera evento em `evento_auditoria` (append-only).

---

## 3. Modelo de dados (esquema para v1.0)

O esquema mantém-se face à v1.0 da arquitetura, com **duas tabelas novas** para o comprovativo criptográfico. Tabelas principais:

- `utilizador` + `atribuicao_papel` + `gabinete` — pessoas e RBAC
- `fpl` — entidade raiz da Ficha (campos mínimos conforme RCM v2 n.º 3.4)
- `entrada_bloco_c` — contributos internos
- `entrada_bloco_d` — interações externas (núcleo da pegada)
- `versao_fpl` — snapshots imutáveis
- `evento_auditoria` — log append-only
- `entidade_rtri` — cache local sincronizável
- `auditoria_qa` — Bloco G (auditoria SGGOV)
- `anexo` — referências a documentos em object storage
- `contributo_consulta` — contributos da consulta pública (Bloco E)
- `notificacao` + `outbox_email` — notificações internas
- `tentativa_login` + `conta_bloqueada` — segurança

**Tabelas novas (comprovativo criptográfico):**

```sql
-- Comprovativos emitidos
CREATE TABLE comprovativo (
  jti           TEXT PRIMARY KEY,           -- identificador único do comprovativo
  fpl_id        TEXT NOT NULL REFERENCES fpl(id),
  numero_processo TEXT NOT NULL,
  marco         TEXT NOT NULL,              -- M0, M3, M4, M5
  validado_por  TEXT NOT NULL,              -- papel + identificação do ponto focal
  snapshot_hash TEXT NOT NULL,              -- SHA-256 do estado da FPL no momento
  kid           TEXT NOT NULL,              -- key id da chave de assinatura usada
  jws           TEXT NOT NULL,              -- o comprovativo completo (JWS compacto)
  emitido_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em     TIMESTAMPTZ,                -- opcional
  estado        TEXT NOT NULL DEFAULT 'VALIDO',  -- VALIDO, REVOGADO, SUBSTITUIDO
  revogado_em   TIMESTAMPTZ,
  motivo_revogacao TEXT
);
CREATE INDEX idx_comprovativo_fpl ON comprovativo(fpl_id, marco);

-- Chaves de assinatura (rotação)
CREATE TABLE chave_assinatura (
  kid           TEXT PRIMARY KEY,
  algoritmo     TEXT NOT NULL DEFAULT 'EdDSA',
  chave_publica TEXT NOT NULL,              -- partilhada com o SmartLegis
  -- a chave privada NÃO fica na base de dados; vive no cofre de segredos
  criada_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  ativa         BOOLEAN NOT NULL DEFAULT TRUE,
  desativada_em TIMESTAMPTZ
);
```

A RCM v2 (n.º 3.4) confirma os campos mínimos da FPL, todos já presentes no esquema: identificação e origem do diploma; identificação dos representantes de interesses com referência ao n.º RTRI; data, forma e objeto de cada interação; síntese da posição e contributos escritos; decisão de incorporação com justificação; resultado das consultas públicas.

---

## 4. Endpoints da API (excerto)

```
# Auth (via diretório interno + TOTP)
POST   /api/auth/login                       # credenciais validadas contra diretório interno
POST   /api/auth/logout
GET    /api/auth/me
POST   /api/auth/totp/setup | activate | disable

# FPL e blocos
GET    /api/fpl
POST   /api/fpl
GET    /api/fpl/:id
PATCH  /api/fpl/:id/bloco-b | bloco-e
POST   /api/fpl/:id/bloco-c | bloco-d
PATCH  /api/fpl/:id/bloco-d/:eid
GET    /api/fpl/:id/versoes | eventos

# Marcos + comprovativo criptográfico
POST   /api/fpl/:id/marcos/:marco/validar    # valida marco; se bloqueante, emite comprovativo
GET    /api/fpl/:id/comprovativos            # lista comprovativos emitidos para a FPL
GET    /api/comprovativos/:jti               # detalhe + estado de um comprovativo
POST   /api/comprovativos/:jti:verificar     # verifica um JWS (uso de auditoria)
GET    /api/.well-known/fpl-jwks.json        # chaves públicas (consumido pelo SmartLegis)

# RTRI (consumo, com fallback)
GET    /api/rtri/entidades?q= | /all | /:rtriId

# Auditoria QA (Bloco G — apenas SGGOV)
POST   /api/fpl/:id/auditoria
PATCH  /api/fpl/:id/auditoria/:aid

# Exportação para o Portal do Governo (apenas SGGOV)
GET    /api/export/fpl/:id                   # pacote estruturado de uma FPL publicada
GET    /api/export/lote?desde=               # lote de FPL publicadas desde uma data
GET    /api/export/datasets/fpl.json|.csv|.jsonld   # datasets agregados (vocabulário OCDE)

# Webhook Consulta.Lex (autenticado por chave) + import CSV manual
POST   /api/hooks/consulta-lex
POST   /api/fpl/:id/consulta-lex/import-csv

# Admin
GET    /api/admin/dashboard | outbox
```

Não há `/api/publico/*`. A face pública é o **Portal do Governo**, alimentado pelos endpoints `/api/export/*` (acessíveis apenas a partir da RING, por papéis SGGOV).

---

## 5. Máquina de estados e marcos

```
   [CRIADO] ──M0──> [EM_ELABORACAO] ──(M1)──> [EM_CONSULTA_PUBLICA]
                          │                          │
                          │                         (M2)
                          │                          │
                          └────────M3────────────────┘
                                    │
                                    ▼
                              [EM_RSE] ──M4──> [EM_CM] ──aprovação──> [APROVADO]
                                                                          │
                                                                          M5
                                                                          ▼
                                                                    [PUBLICADO]

   Marcos BLOQUEANTES (emitem comprovativo criptográfico): M0, M3, M4, M5
   Marcos REGISTADOS (não bloqueiam, não emitem comprovativo): M1, M2
```

| Marco | Pré-condições internas | Emite comprovativo? |
|---|---|:---:|
| **M0** — Abertura | Bloco A completo + Bloco B obrigatórios | ✅ |
| M1 — Pré-consulta | M0 validado | ❌ (registado) |
| M2 — Pós-consulta | M1 validado + Bloco E síntese e decisão | ❌ (registado) |
| **M3** — Pré-RSE | M0 + Bloco D com decisão+justificação em todas as entradas + declaração F | ✅ |
| **M4** — Pré-CM | M3 + tudo completo + sem correções QA pendentes + 2.ª declaração F | ✅ |
| **M5** — Publicação | M4 + estado APROVADO + referência DR | ✅ |

A cada marco bloqueante, após a validação interna passar, a app emite o comprovativo (ver §6) e regista-o. O ponto focal copia o comprovativo para o SmartLegis.

---

## 6. Comprovativo criptográfico

### 6.1. Objetivo
Tornar o cumprimento da pegada **verificável e *enforceable* por um sistema terceiro (o SmartLegis)** sem integração síncrona nem coordenação humana. O que não está validado na FPL não gera comprovativo; sem comprovativo válido, o SmartLegis bloqueia a tramitação (RCM v2, n.º 4).

### 6.2. Formato
**JWS compacto** (JSON Web Signature, RFC 7515), assinatura **Ed25519** (EdDSA, RFC 8037).

Header:
```json
{ "alg": "EdDSA", "typ": "fpl-comprovativo+jws", "kid": "fpl-2026-01" }
```

Payload:
```json
{
  "iss": "fpl.sggov.ring",            // emissor: aplicação FPL
  "sub": "2026/MAE/0042",             // número de processo do diploma
  "fpl_id": "uuid-da-fpl",
  "marco": "M3",
  "validado_em": "2026-04-30T16:05:00Z",
  "validado_por": "PONTO_FOCAL:gab-mae",   // papel + gabinete, não a pessoa
  "snapshot_hash": "sha256:9f2a...",   // hash do estado da FPL no momento
  "jti": "cmp_7Kx9bMnQ...",            // identificador único do comprovativo
  "iat": 1714492200,
  "exp": 1746028200                    // validade longa; revogação via estado
}
```

### 6.3. Emissão
1. O ponto focal valida um marco bloqueante; a validação interna passa.
2. A app calcula `snapshot_hash` = SHA-256 do snapshot canónico da FPL.
3. Assina o JWS com a **chave privada Ed25519** (que vive no cofre de segredos, nunca na base de dados).
4. Persiste o comprovativo na tabela `comprovativo` e regista evento de auditoria.
5. Devolve o JWS ao ponto focal, apresentado num campo *copy-friendly* na UI.

### 6.4. Verificação (lado do SmartLegis)
O SmartLegis verifica **offline**, sem chamar a FPL:
1. Lê o `kid` do header e seleciona a chave pública correspondente (obtida de `/api/.well-known/fpl-jwks.json` ou distribuída uma vez).
2. Verifica a assinatura Ed25519.
3. Verifica `iss`, `sub` (corresponde ao diploma em tramitação), `marco` (corresponde ao ponto de tramitação), `exp`.
4. Se tudo válido → permite a progressão. Caso contrário → **bloqueia**.

### 6.5. Gestão de chaves e rotação
- A chave privada vive no cofre de segredos (em dev, variável de ambiente; em produção, ficheiro protegido ou HashiCorp Vault).
- O `kid` no header permite ter várias chaves válidas em simultâneo.
- Rotação: gera-se uma nova chave, publica-se a pública, marca-se a antiga como inativa para emissão mas mantém-se válida para verificação durante um período de graça. Sem downtime.
- A chave pública é partilhada com a equipa do SmartLegis na fase de conceção (maio) e exposta em `/api/.well-known/fpl-jwks.json` para atualizações.

### 6.6. Revogação
O comprovativo tem validade longa (`exp`). A revogação efetiva faz-se pelo **estado** na tabela `comprovativo` (`VALIDO` → `REVOGADO`/`SUBSTITUIDO`). Quando uma FPL é corrigida após emissão (ex.: pedido de correção QA), o comprovativo anterior é marcado `SUBSTITUIDO` e emite-se um novo. O SmartLegis pode, opcionalmente, consultar `GET /api/comprovativos/:jti` para confirmar o estado — mas a verificação corrente não o exige.

### 6.7. Especificação conjunta
A especificação técnica detalhada (campos exatos, tratamento de erros, formato do `jti`, política de `exp`) é **fechada com a equipa do SmartLegis em maio**, antes do arranque do desenvolvimento, e não muda depois do go-live (Memorando Executivo, §IV).

---

## 7. Autenticação e segurança

### 7.1. Autenticação
- **Camada 1 — RING:** acesso à rede mediado por VPN do Governo (controlo já existente, fora do âmbito desta aplicação).
- **Camada 2 — aplicação:** autenticação contra o **diretório interno dos serviços** (LDAP/AD). No protótipo, um *adapter* de diretório com utilizadores locais simula este comportamento; em produção, liga-se ao diretório real com mudança de configuração, sem refactor.
- **TOTP** obrigatório para papéis sensíveis (SGGOV_ADMIN, SGGOV_QA).
- Sessão em cookie httpOnly + JWT de sessão; expiração 8h.

### 7.2. Não há federação OIDC
Decisão expressa do Memorando (Princípio 1) e da RCM v2 (n.º 11.1). O confinamento à RING torna a federação externa desnecessária e elimina a dependência da AMA para o arranque.

### 7.3. Hardening
- CSRF (double-submit cookie), rate limiting, bloqueio de conta após N tentativas — já implementados.
- CSP estrito, HSTS (em produção), X-Frame-Options DENY, Permissions-Policy restritiva.
- O confinamento à RING **simplifica** o hardening: sem origem pública, a maioria dos vetores de ataque externos não se aplica.
- Validação server-side sempre (Zod); queries parametrizadas.

### 7.4. Dados pessoais (RGPD)
- Base legal: cumprimento de obrigação legal (Lei 5-A/2026 e RCM).
- A SGGOV é responsável pelo tratamento (RCM v2, n.º 12.2).
- DPIA submetida à CNPD **antes** da apresentação da RCM à reunião preparatória do CM (RCM v2, n.º 12.1) — ver `docs/05_DPIA.md` quando existir.

---

## 8. Exportação para o Portal do Governo

A aplicação **não serve a face pública**. Após M5, gera **pacotes estruturados** que são transferidos para o Portal do Governo:

- `GET /api/export/fpl/:id` — uma FPL publicada, com filtro de visibilidade dos campos (só "público").
- `GET /api/export/lote?desde=` — lote de FPL publicadas desde uma data, para sincronização periódica.
- `GET /api/export/datasets/fpl.{json,csv,jsonld}` — datasets agregados; o JSON-LD usa o vocabulário OCDE para *legislative footprint*.

O Portal do Governo serve estes conteúdos ao público, ao lado da **Agenda Pública dos membros do Governo**. Juntos formam o repositório integrado de transparência institucional do Executivo (RCM v2, n.º 9.2). A transferência é inicialmente manual (operada pela SGGOV) e automatizada à medida que o volume justificar.

---

## 9. Stack tecnológica

| Camada | Tecnologia | Nota |
|---|---|---|
| Runtime | Node.js 22 LTS | Confirmado pela nota de capacidade SGGOV |
| Web framework | Express 4 | Simplicidade, controlo |
| Persistência | PostgreSQL 16 | Em container; SQLite só em modo legado de transição |
| Cache / sessões / filas | Redis 7 | Em container |
| Object storage | MinIO (S3-compatível) | Em container, dentro da RING |
| Comprovativo | Ed25519 via `node:crypto` | Sem dependências externas |
| Auth | Adapter de diretório (LDAP/AD) + TOTP pure-JS | Diretório real em produção |
| Frontend | SPA (vanilla JS na v0.2; React previsto) | Servida pelo backend |
| Containerização | Docker + Docker Compose | Manifestos K8s se a operação exigir |
| Observabilidade | Prometheus + logs estruturados | Grafana opcional |

---

## 10. Vista de implantação

```
┌──────────────────────────────────────────────────────────────┐
│              RING — gerida pela SGGOV (ex-CEGER)             │
│                                                              │
│   Reverse proxy interno (TLS)                                │
│            │                                                 │
│   ┌────────▼─────────┐                                       │
│   │  app (1+ réplicas)│  imagem Docker (GHCR → RING)         │
│   └────────┬──────────┘                                      │
│            │                                                 │
│   ┌────────┼────────────┬──────────────┐                     │
│   ▼        ▼            ▼              ▼                     │
│ Postgres  Redis       MinIO        Cofre de segredos         │
│ (+backup) (HA)        (+backup)    (chave privada Ed25519)   │
└──────────────────────────────────────────────────────────────┘
```

Ambientes: **dev** (Docker Compose local), **staging** (réplica na RING), **produção** (RING). Sem ambiente exposto à internet em nenhuma fase.

---

## 11. Caminho para o SmartLegis

Quando o módulo nativo do SmartLegis estiver pronto (RCM v2, n.º 11.4):
1. **Coexistência** — o SmartLegis consome a API da FPL Ponte; toda a edição continua na FPL Ponte.
2. **Migração** — novos diplomas vão para o SmartLegis; antigos permanecem; export/import via API.
3. **Sunset** — FPL Ponte em modo *read-only*.
4. **Arquivo** — URLs públicas no Portal do Governo mantidas via redirect 301.

O comprovativo criptográfico já estabelece o contrato técnico entre os dois sistemas — a migração é uma evolução, não uma rutura.

---

## 12. Próximos passos (engenharia)

Ver `docs/03_Plano_Implementacao.md`.
