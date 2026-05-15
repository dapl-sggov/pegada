# Runbook de Operação — FPL Ponte

**Versão:** 2.0 — Maio 2026 (revista após decisões do Memorando Executivo e da RCM v2)
**Destino:** Rede Informática do Governo (RING), gerida pela SGGOV (pós-integração do CEGER)
**Operação:** SGGOV interna · **Acesso:** mediado por VPN do Governo

> **Nota de versão.** Esta v2.0 alinha o runbook com o confinamento à RING, a autenticação via diretório interno, o comprovativo criptográfico e a publicação no Portal do Governo. Ver `docs/07_Adaptacao_Brainstorming.md`.

---

## 1. Arquitetura de implantação

```
┌──────────────────────────────────────────────────────────────────┐
│            REDE INFORMÁTICA DO GOVERNO (RING)                    │
│            acesso mediado por VPN do Governo                     │
│                                                                  │
│   Pontos focais / SGGOV ──VPN──▶ Reverse proxy interno (TLS)     │
│                                          │                       │
│                              ┌───────────▼────────────┐          │
│                              │   app (container)      │          │
│                              │   FPL Ponte backend    │  1+      │
│                              │   + frontend estático  │  réplicas│
│                              └─┬────────┬────────┬───┬┘          │
│                                │        │        │   │           │
│                  ┌─────────────▼┐ ┌─────▼────┐ ┌─▼───▼────────┐  │
│                  │ PostgreSQL 16│ │ Redis 7  │ │   MinIO      │  │
│                  └──────────────┘ └──────────┘ └──────────────┘  │
│                                │                                 │
│                  ┌─────────────▼──────────────┐                  │
│                  │  Cofre de segredos          │                  │
│                  │  (chave privada Ed25519     │                  │
│                  │   do comprovativo)          │                  │
│                  └─────────────────────────────┘                  │
│                                                                  │
│   Saídas assíncronas (sem dependência síncrona):                 │
│     • Comprovativo JWS  → copiado pelo ponto focal p/ SmartLegis │
│     • Pacote estruturado → transferido p/ Portal do Governo      │
└──────────────────────────────────────────────────────────────────┘
```

Não há nenhuma face exposta à internet pública. Todos os componentes correm em containers, dentro da RING. Nenhum depende de serviço de cloud comercial — requisito de soberania cumprido e reforçado pelo confinamento.

---

## 2. Pré-requisitos na RING

| Recurso | Mínimo v1.0 | Recomendado |
|---|---|---|
| CPU | 2 vCPU (app) + 2 (dados) | 4 + 4 |
| RAM | 4 GB total | 8 GB |
| Disco | 50 GB | 100 GB (cresce ~30 GB/ano com anexos) |
| SO host | Linux com Docker 24+ / Podman 4+ | + Docker Compose v2 |
| Rede | Acesso apenas a partir da RING; reverse proxy interno com TLS | — |
| Cofre de segredos | Ficheiro protegido ou HashiCorp Vault | Vault |
| Backup | Volume separado para `pg_data` e `minio_data` | Storage WORM para retenção longa |

A volumetria estimada (ver `02_Arquitetura.md`) é modesta: ~520 FPL/ano na Fase 1. Um único nó cobre vários anos.

---

## 3. Primeira instalação

### 3.1. Obter a imagem

A imagem é construída pelo workflow `release.yml` e publicada em `ghcr.io/dapl-sggov/pegada/fpl-app`. Para a RING (sem acesso ao GHCR):

```bash
# Numa máquina com acesso à internet
docker pull ghcr.io/dapl-sggov/pegada/fpl-app:latest
docker save ghcr.io/dapl-sggov/pegada/fpl-app:latest | gzip > fpl-app.tar.gz
# Transferir fpl-app.tar.gz para a RING (canal aprovado)

# Na RING
docker load < fpl-app.tar.gz
```

### 3.2. Gerar a chave do comprovativo criptográfico

```bash
# Par de chaves Ed25519 para a assinatura dos comprovativos
openssl genpkey -algorithm ed25519 -out fpl-comprovativo.pem
openssl pkey -in fpl-comprovativo.pem -pubout -out fpl-comprovativo.pub.pem

# A chave PRIVADA vai para o cofre de segredos (permissões 600, dono restrito)
# A chave PÚBLICA é partilhada com a equipa do SmartLegis
```

A chave privada **nunca** é versionada nem guardada na base de dados. É injetada via `COMPROVATIVO_PRIVATE_KEY_PATH` (caminho protegido) ou `COMPROVATIVO_PRIVATE_KEY_PEM` (do cofre).

### 3.3. Configurar

```bash
cp .env.example .env
# Editar .env — OBRIGATÓRIO antes do arranque em produção:
#   NODE_ENV=production
#   CONFINADO_RING=true
#   TRUST_PROXY=true
#   COOKIE_SECURE=true
#   JWT_SECRET            → openssl rand -base64 48
#   CL_WEBHOOK_KEY        → openssl rand -base64 32
#   POSTGRES_PASSWORD     → palavra-passe forte
#   MINIO_ROOT_PASSWORD   → palavra-passe forte
#   COMPROVATIVO_PRIVATE_KEY_PATH → caminho da chave Ed25519
#   COMPROVATIVO_KEY_ID   → identificador da chave (ex.: fpl-2026-01)
#   DIRECTORY_DRIVER=ldap + dados do diretório interno dos serviços
#   EMAIL_DRIVER=smtp + dados do SMTP do Estado (ou manter outbox no arranque)
```

O arranque em `NODE_ENV=production` **recusa**: segredos com valor de demonstração, ausência de chave do comprovativo, e CORS com `*` (ver `config.js → assertConfigProducao`).

### 3.4. Arrancar

```bash
docker compose up -d postgres redis minio minio-init
# aguardar healthchecks "healthy"
docker compose up -d app
docker compose exec app node src/migrate.js   # cria/atualiza schema
docker compose exec app node src/seed.js      # apenas na 1.ª vez
```

### 3.5. Verificar

```bash
curl -f http://localhost:3717/health                    # {"ok":true,...}
curl -f http://localhost:3717/metrics                   # métricas Prometheus
curl -f http://localhost:3717/api/.well-known/fpl-jwks.json  # chave pública do comprovativo
docker compose ps                                        # todos "healthy"
```

Confirmar que `/api/.well-known/fpl-jwks.json` devolve a chave pública correta — é o que o SmartLegis vai consumir.

---

## 4. Operação corrente

### 4.1. Atualizações

```bash
docker compose pull app
docker compose up -d app
docker compose exec app node src/migrate.js   # migrações idempotentes
```

### 4.2. Logs

```bash
docker compose logs -f app                    # JSON estruturado em produção
docker compose logs --since 1h app | grep ERROR
```

### 4.3. Consola SQL (diagnóstico)

```bash
docker compose --profile tools up -d adminer  # http://localhost:8080, servidor: postgres
# OU
docker compose exec postgres psql -U fpl -d fpl
```

### 4.4. Publicação no Portal do Governo

Após o marco M5 de cada diploma, a FPL fica pronta para publicação. A transferência para o Portal do Governo faz-se a partir dos endpoints de exportação (acessíveis apenas a papéis SGGOV, a partir da RING):

```bash
# Lote de FPL publicadas desde uma data
curl -s -H "Cookie: $SESSAO_SGGOV" \
  "http://localhost:3717/api/export/lote?desde=2026-07-01" > lote.json

# Datasets agregados
curl -s -H "Cookie: $SESSAO_SGGOV" \
  http://localhost:3717/api/export/datasets/fpl.jsonld > fpl-ocde.jsonld
```

Estes ficheiros são transferidos para o Portal do Governo, onde ficam ao lado da Agenda Pública dos membros do Governo. No arranque a transferência é manual (operada pela SGGOV); automatiza-se à medida que o volume justifica.

---

## 5. Backup e recuperação

### 5.1. Backup automático (cron no host)

```bash
# /etc/cron.daily/fpl-backup
#!/bin/bash
set -e
TS=$(date +%Y%m%d-%H%M)
DEST=/backup/fpl
mkdir -p "$DEST"
# Base de dados
docker compose exec -T postgres pg_dump -U fpl -Fc fpl > "$DEST/db-$TS.dump"
# Anexos (MinIO)
docker run --rm --network fpl-ponte_default -v "$DEST/anexos-$TS:/out" \
  minio/mc sh -c "mc alias set s http://minio:9000 \$ACCESS \$SECRET && mc mirror s/fpl-anexos /out"
# Retenção: 30 dias
find "$DEST" -name 'db-*.dump' -mtime +30 -delete
```

> **A chave privada do comprovativo** é incluída na política de backup do **cofre de segredos**, não nestes backups aplicacionais. A sua perda invalida a capacidade de emitir comprovativos verificáveis pela chave pública já distribuída ao SmartLegis — tratar como segredo crítico.

- **RPO**: 24h com `pg_dump` diário; < 5 min com WAL streaming
- **RTO**: < 1h num único nó

### 5.2. Recuperação

```bash
docker compose stop app
docker compose exec -T postgres pg_restore -U fpl -d fpl --clean < /backup/fpl/db-AAAAMMDD-HHMM.dump
# restaurar anexos do backup do MinIO (mc mirror inverso)
docker compose up -d app
```

Testar a recuperação **trimestralmente** num ambiente isolado.

---

## 6. Observabilidade

### 6.1 Endpoints

| Endpoint | Conteúdo |
|---|---|
| `GET /health` | Vivacidade: conectividade Postgres, Redis, storage, cofre de chaves |
| `GET /metrics` | Prometheus: latência por rota, throughput, erros, FPL criadas/dia, marcos validados, **comprovativos emitidos/dia**, snapshot de estados de workflow |
| `GET /api/.well-known/fpl-jwks.json` | Chave(s) pública(s) do comprovativo — monitorizar disponibilidade |

### 6.2 Métricas expostas em `/metrics`

| Métrica | Tipo | Labels |
|---|---|---|
| `http_requests_total` | counter | `method`, `route` (com IDs colapsados em `:id`), `status` |
| `http_request_duration_seconds` | histogram (buckets 5 ms → 10 s) | `method`, `route`, `status` |
| `fpl_marcos_validados_total` | counter | `marco` (M0..M5), `resultado` (`ok`/`bloqueado`) |
| `fpl_comprovativos_emitidos_total` | counter | `marco` |
| `fpl_estado_workflow` | gauge (snapshot por scrape) | `estado` (CRIADO, EM_ELABORACAO, ...) |
| `fpl_uptime_seconds` | gauge | — |
| `process_resident_memory_bytes`, `process_heap_bytes` | gauge | — |

Implementação minimalista sem dependências em `app/backend/src/metrics.js`. Em produção, restringir o endpoint `/metrics` por firewall ao scraper interno (Prometheus na RING).

### 6.3 Alertas recomendados

- Taxa de 5xx > 1% durante 5 min
- Latência P95 > 1s durante 10 min
- `/health` em falha durante 2 min → incidente
- Disco de `pg_data` ou `minio_data` > 85%
- Falha na emissão de comprovativo (erro de assinatura) → incidente imediato
- `rate(fpl_marcos_validados_total{resultado="bloqueado"}[5m])` anormalmente alto → indica problema de UX ou conteúdo
- Falhas RTRI consecutivas > 10 → serviço externo em baixo (não bloqueia operação)

Operação em horário útil é suficiente para a v1.0 — o sistema não é crítico em horário noturno.

---

## 7. Segurança operacional

### 7.1 Princípios

- **Confinamento à RING**: a aplicação não tem origem pública. A maioria dos vetores de ataque externos não se aplica. O *hardening* concentra-se na superfície interna.
- **Acesso**: mediado por VPN do Governo (camada 1) + autenticação contra o diretório interno dos serviços com TOTP para papéis sensíveis (camada 2).
- **Chave do comprovativo (Ed25519)**: vive no cofre de segredos, permissões `600`, dono restrito. Rotação via `kid` — gera-se nova chave, publica-se a pública, mantém-se a antiga válida para verificação durante o período de graça. Nunca na base de dados, nunca versionada.
- **Segredos**: nunca no `docker-compose.yml`; sempre no `.env` protegido ou injetados pelo orquestrador. Migração para HashiCorp Vault prevista — `config.js` lê de variável de ambiente independentemente da origem.
- **TLS**: terminado no reverse proxy interno da RING. O container `app` recebe HTTP interno.
- **Utilizador não-root**: a imagem corre como utilizador `fpl`.
- **Atualizações de segurança**: rebuild da imagem a cada CVE relevante (`npm audit` no CI).

### 7.2 Headers HTTP (verificáveis em `GET /health`)

| Header | Valor |
|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; …` (sem `unsafe-inline` em scripts) |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cross-Origin-Resource-Policy` | `same-origin` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` (apenas produção) |
| `Cache-Control` (em `/api/*`) | `no-store, no-cache, must-revalidate` |

Auditoria automática em `backend/test/integracao.test.js` (rejeita regressões).

### 7.3 Procedimento de rotação da chave Ed25519

**Rotação programada (anual):**
1. Gerar novo par com `node -e "..."` ou via HSM, em ambiente seguro.
2. Anunciar a rotação ao SmartLegis com **30 dias de antecedência** (ver `docs/12_Especificacao_Comprovativo_SmartLegis.md` §5).
3. Adicionar a nova chave à tabela `chave_assinatura` com `ativa = 1`; manter a antiga `ativa = 1` durante a transição.
4. `COMPROVATIVO_PRIVATE_KEY_PATH` apontado para a nova chave; reiniciar o serviço (rolling restart, sem downtime).
5. Após **90 dias** marcar `revogada_em` na chave antiga e remover do JWKS — manter o registo na BD por 10 anos para verificação retroativa.

**Rotação por compromisso (urgente):**
1. Detetar via alarme (alteração não autorizada na tabela `comprovativo_chave` ou ficheiro da chave).
2. Marcar todos os comprovativos da chave como `estado = REVOGADO` na BD.
3. Gerar nova chave + atualizar JWKS num único deploy atómico.
4. Notificar o SmartLegis em **24 horas** (ofício + email + nova chave pinada).
5. Informar a CNPD se houver indícios de exposição de dados pessoais (art. 33.º RGPD).

### 7.4 SBOM e dependências

- `npm sbom --sbom-format=spdx` gera o SBOM SPDX 2.3 do backend (87 pacotes).
- O ficheiro `app/backend/sbom-spdx.json` **não é versionado** — regenera-se a cada build.
- `npm audit` corre no CI; o build falha se houver vulnerabilidades de severidade `moderate` ou superior.

---

## 8. Degradação graciosa

| Falha | Comportamento |
|---|---|
| RTRI (AR) indisponível | Inserção manual de entidades com flag "validação pendente" |
| Consulta.Lex indisponível | Import CSV manual pela UI |
| SMTP indisponível | Notificações ficam no outbox; reenvio na retoma |
| Redis indisponível | Cai para rate-limit/cache in-memory |
| MinIO indisponível | Upload de anexos bloqueado; resto da aplicação funcional |
| Portal do Governo indisponível | A exportação acumula; a publicação faz-se na retoma — não bloqueia a operação interna |
| SmartLegis indisponível | A FPL emite comprovativos na mesma; o ponto focal cola-os quando o SmartLegis retomar — *handoff* assíncrono |

A aplicação **nunca bloqueia uma operação de negócio por falha de infraestrutura externa** — apenas por falha de regra de validação.

---

## 9. Migração futura para o SmartLegis

Quando o módulo nativo do SmartLegis estiver pronto (RCM v2, n.º 11.4):
1. O SmartLegis consome a API da FPL Ponte para ler
2. Cada FPL é exportável como JSON com versões, auditoria e comprovativos intactos
3. URLs públicas mantêm-se no Portal do Governo via redirect 301
4. A FPL Ponte fica *read-only* durante a coexistência, depois arquivada

O comprovativo criptográfico já é o contrato técnico entre os dois sistemas — a migração é uma evolução, não uma rutura. Nenhuma escolha de infraestrutura desta v1.0 cria *lock-in*: Postgres, Redis e MinIO são standard e os dados são exportáveis em formatos abertos.

---

## 10. Checklist de go-live

### Infraestrutura
- [ ] Imagem `fpl-app` construída a partir de tag `v1.0` e transferida para a RING
- [ ] Postgres, Redis, MinIO com volumes em storage com backup
- [ ] Reverse proxy interno da RING com TLS e certificado válido
- [ ] `.env` de produção preenchido e validado (`CONFINADO_RING=true`, segredos fortes, chave do comprovativo)

### Segurança
- [ ] Par de chaves Ed25519 do comprovativo gerado em ambiente seguro; privada no cofre de segredos com `0600`; **pública entregue à equipa do SmartLegis** (out-of-band)
- [ ] Especificação do comprovativo (`docs/12_Especificacao_Comprovativo_SmartLegis.md`) fechada com a equipa do SmartLegis (até 30 jun)
- [ ] **Vetores de teste** (TV1–TV6) verificados pelo SmartLegis com sucesso
- [ ] Pen-test externo concluído e findings críticos resolvidos
- [ ] `npm audit` no CI sem vulnerabilidades `moderate` ou superior
- [ ] SBOM SPDX gerado e arquivado no repositório de artefactos

### Conformidade
- [ ] **DPIA** (`docs/10_DPIA.md`) validada pelo EPD da SGGOV
- [ ] **DPIA** submetida à CNPD para parecer prévio (antes da apresentação da RCM à reunião preparatória do CM)
- [ ] **Threat model** sistémico (`docs/11_Threat_Model_Sistema.md`) revisto e aprovado
- [ ] **Declaração de acessibilidade** publicada (`/declaracao-acessibilidade.html`)
- [ ] **Auditoria externa de acessibilidade** WCAG 2.2 AA concluída (cronograma E15)

### Ligação
- [ ] Autenticação ligada ao diretório interno dos serviços (`DIRECTORY_DRIVER=ldap`)
- [ ] `node src/migrate.js` + `node src/seed.js` executados
- [ ] Healthcheck verde; `/metrics`, `/api/.well-known/fpl-jwks.json` a responder
- [ ] Verificação cruzada: o SmartLegis valida um comprovativo de teste emitido pela FPL

### Observabilidade e operação
- [ ] Backup automático agendado e testado (restore em ambiente isolado)
- [ ] Alertas configurados (Prometheus + AlertManager — ver §6.3)
- [ ] Suite de testes verde (28 backend + 5 e2e) na pipeline de CI
- [ ] Pontos focais dos 2 ministérios-piloto formados
- [ ] Runbook distribuído à equipa de operação SGGOV
- [ ] Modo "sombra" 22-27 jul validado
