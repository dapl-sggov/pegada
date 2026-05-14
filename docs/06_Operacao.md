# Runbook de Operação — FPL Ponte

**Destino:** infraestrutura on-premises do CEGER · Operação: SGGOV interna
**Versão:** v0.2 → v1.0 · Maio 2026

---

## 1. Arquitetura de implantação

```
                         ┌────────────────────────┐
   Internet / RCM48 ────▶ │  Reverse proxy (TLS)   │   nginx ou HAProxy
                         │  no perímetro CEGER     │   termina TLS 1.3
                         └───────────┬────────────┘
                                     │ HTTP interno
                         ┌───────────▼────────────┐
                         │   app (container)      │   Node.js 22
                         │   FPL Ponte backend    │   imagem GHCR
                         │   + frontend estático  │   1+ réplicas
                         └─┬─────────┬─────────┬──┘
                           │         │         │
              ┌────────────▼─┐ ┌─────▼─────┐ ┌─▼──────────┐
              │ PostgreSQL 16│ │  Redis 7  │ │   MinIO    │
              │ (relacional) │ │ (cache/   │ │ (anexos,   │
              │              │ │  sessões) │ │  S3 API)   │
              └──────────────┘ └───────────┘ └────────────┘
                     │                              │
              ┌──────▼──────┐               ┌───────▼──────┐
              │ Backup WAL  │               │ Backup bucket│
              │ + pg_dump   │               │ (snapshot)   │
              └─────────────┘               └──────────────┘
```

Todos os componentes correm em containers. Nenhum depende de serviço de cloud comercial — requisito de soberania cumprido.

---

## 2. Pré-requisitos no CEGER

| Recurso | Mínimo v1.0 | Recomendado |
|---|---|---|
| CPU | 2 vCPU (app) + 2 (dados) | 4 + 4 |
| RAM | 4 GB total | 8 GB |
| Disco | 50 GB | 100 GB (cresce ~30 GB/ano com anexos) |
| SO host | Linux com Docker 24+ / Podman 4+ | + Docker Compose v2 |
| Rede | Porta 443 exposta via reverse proxy; 3717 só interno | — |
| Backup | Volume separado para `pg_data` e `minio_data` | Storage WORM para retenção longa |

A volumetria estimada (ver `02_Arquitetura.md` §3.4) é modesta: ~520 FPL/ano na Fase 1. Um único nó cobre vários anos.

---

## 3. Primeira instalação

### 3.1. Obter a imagem

A imagem é construída pelo workflow `release.yml` e publicada em
`ghcr.io/dapl-sggov/pegada/fpl-app`. Para ambiente sem acesso ao GHCR:

```bash
# Numa máquina com acesso à internet
docker pull ghcr.io/dapl-sggov/pegada/fpl-app:latest
docker save ghcr.io/dapl-sggov/pegada/fpl-app:latest | gzip > fpl-app.tar.gz
# Transferir fpl-app.tar.gz para o CEGER (suporte físico ou canal aprovado)

# No CEGER
docker load < fpl-app.tar.gz
```

### 3.2. Configurar

```bash
cp .env.example .env
# Editar .env — OBRIGATÓRIO alterar antes do arranque:
#   JWT_SECRET        → openssl rand -base64 48
#   CL_WEBHOOK_KEY    → openssl rand -base64 32
#   POSTGRES_PASSWORD → palavra-passe forte
#   MINIO_ROOT_PASSWORD → palavra-passe forte
#   NODE_ENV=production
#   PUBLIC_URL=https://<dominio-real>
#   COOKIE_SECURE=true
#   TRUST_PROXY=true
#   EMAIL_DRIVER=smtp + dados do SMTP do Estado
```

O arranque em `NODE_ENV=production` **recusa segredos com valor de demonstração** (ver `config.js → assertConfigProducao`).

### 3.3. Arrancar

```bash
docker compose up -d postgres redis minio minio-init
# aguardar healthchecks ficarem "healthy"
docker compose up -d app
# aplicar schema + dados iniciais (gabinetes, papéis)
docker compose exec app node src/migrate.js   # cria schema
docker compose exec app node src/seed.js      # apenas na 1.ª vez
```

### 3.4. Verificar

```bash
curl -f http://localhost:3717/health        # {"ok":true,...}
curl -f http://localhost:3717/metrics       # métricas Prometheus
docker compose ps                            # todos "healthy"
```

---

## 4. Operação corrente

### 4.1. Atualizações

```bash
docker compose pull app          # nova imagem
docker compose up -d app         # recriação com zero downtime se 2+ réplicas
docker compose exec app node src/migrate.js   # migrações de schema (idempotentes)
```

As migrações de schema são **idempotentes** (`CREATE TABLE IF NOT EXISTS`,
`ADD COLUMN IF NOT EXISTS`). Correr a migração após cada atualização é seguro.

### 4.2. Logs

```bash
docker compose logs -f app                   # logs estruturados (JSON em produção)
docker compose logs --since 1h app | grep ERROR
```

Logs em formato JSON — encaminháveis para o SIEM nacional se aplicável.

### 4.3. Reiniciar um serviço

```bash
docker compose restart app
```

### 4.4. Consola SQL (diagnóstico)

```bash
docker compose --profile tools up -d adminer
# Adminer em http://localhost:8080 — servidor: postgres
# OU diretamente:
docker compose exec postgres psql -U fpl -d fpl
```

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
docker compose exec -T minio mc mirror --overwrite local/fpl-anexos "$DEST/anexos-$TS/" \
  2>/dev/null || docker run --rm --network fpl-ponte_default \
  -v "$DEST/anexos-$TS:/out" minio/mc sh -c \
  "mc alias set s local http://minio:9000 \$ACCESS \$SECRET && mc mirror s/fpl-anexos /out"

# Retenção: manter 30 dias
find "$DEST" -name 'db-*.dump' -mtime +30 -delete
```

- **RPO** (perda máxima): 24h com `pg_dump` diário; < 5 min se ativar WAL streaming
- **RTO** (tempo de recuperação): < 1h num único nó

### 5.2. Recuperação

```bash
# Parar a app
docker compose stop app
# Restaurar base de dados
docker compose exec -T postgres pg_restore -U fpl -d fpl --clean < /backup/fpl/db-AAAAMMDD-HHMM.dump
# Restaurar anexos
docker run --rm -v /backup/fpl/anexos-AAAAMMDD-HHMM:/in --network fpl-ponte_default \
  minio/mc sh -c "mc alias set s local http://minio:9000 \$ACCESS \$SECRET && mc mirror /in s/fpl-anexos"
# Rearrancar
docker compose up -d app
```

Testar a recuperação **trimestralmente** num ambiente isolado.

---

## 6. Observabilidade

| Endpoint | Conteúdo |
|---|---|
| `GET /health` | Vivacidade: conectividade DB, Redis, storage |
| `GET /metrics` | Métricas Prometheus: latência por rota, throughput, erros, FPL criadas/dia, marcos validados, falhas RTRI |

**Alertas recomendados** (Prometheus/Alertmanager ou equivalente CEGER):
- Taxa de 5xx > 1% durante 5 min
- Latência P95 > 1s durante 10 min
- `/health` em falha durante 2 min → incidente
- Disco do volume `pg_data` ou `minio_data` > 85%
- Falhas RTRI consecutivas > 10 (sinaliza serviço externo em baixo)

A operação não exige plantão 24/7 — o sistema não é crítico em horário
noturno. Cobertura em horário útil é suficiente para a v1.0.

---

## 7. Segurança operacional

- **Segredos**: nunca no `docker-compose.yml`; sempre no `.env` (permissões `600`, dono restrito) ou injetados pelo orquestrador. Migração futura para HashiCorp Vault prevista — `config.js` lê de variável de ambiente independentemente da origem.
- **TLS**: terminado no reverse proxy do CEGER (TLS 1.3). O container `app` só recebe HTTP interno.
- **Utilizador não-root**: a imagem corre como utilizador `fpl` (uid de sistema).
- **Atualizações de segurança**: rebuild da imagem a cada CVE relevante nas dependências (`npm audit` no CI).
- **Rotação de segredos**: `JWT_SECRET` e `CL_WEBHOOK_KEY` rotacionáveis sem downtime relevante (invalida sessões ativas no caso do JWT).
- **Acesso à consola Adminer**: apenas com perfil `tools`, nunca exposto fora da rede de gestão.

---

## 8. Degradação graciosa

O sistema é desenhado para continuar operacional quando dependências
externas falham (ver `02_Arquitetura.md` §9):

| Falha | Comportamento |
|---|---|
| RTRI (AR) indisponível | Inserção manual de entidades com flag "validação pendente" |
| Consulta.Lex indisponível | Import CSV manual pela UI |
| SMTP indisponível | Notificações ficam no outbox; reenvio automático na retoma |
| Redis indisponível | Cai para rate-limit/cache in-memory (perde-se partilha entre réplicas) |
| MinIO indisponível | Upload de anexos bloqueado; resto da aplicação funcional |

A aplicação **nunca bloqueia uma operação de negócio por falha de
infraestrutura externa** — apenas por falha de regra de validação.

---

## 9. Migração futura para o SmartLegis

Quando o módulo nativo do SmartLegis estiver pronto, a FPL Ponte cede o
lugar sem perda de dados (ver `02_Arquitetura.md` §10):

1. A API REST da FPL Ponte (`/api/fpl/...`) é o contrato de exportação
2. Cada FPL é exportável como JSON com versões e auditoria intactas
3. URLs públicas mantêm-se via redirect 301
4. A aplicação fica em modo *read-only* durante a coexistência, depois arquivada

Nenhuma escolha de infraestrutura desta v1.0 cria *lock-in*: Postgres,
Redis e MinIO são standard e os dados são exportáveis em formatos abertos.

---

## 10. Checklist de go-live

- [ ] Imagem `fpl-app` construída a partir de tag `v1.0` e transferida
- [ ] `.env` de produção preenchido e validado (segredos fortes)
- [ ] Postgres, Redis, MinIO com volumes em storage com backup
- [ ] Reverse proxy com TLS 1.3 e certificado válido
- [ ] `node src/migrate.js` + `node src/seed.js` executados
- [ ] Healthcheck verde; `/metrics` a responder
- [ ] Backup automático agendado e testado (restore num ambiente isolado)
- [ ] Alertas configurados
- [ ] Pen-test externo concluído e findings críticos resolvidos
- [ ] DPIA submetida (ver `05_DPIA.md` quando existir)
- [ ] Pontos focais dos 2 ministérios-piloto formados
- [ ] Runbook distribuído à equipa de operação SGGOV
