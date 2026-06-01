# FPL Ponte — versão simplificada

**Junho 2026 · v2.0**

> Operacionalização da Pegada Legislativa do Governo durante o período
> em que o SmartLegis ainda não a incorpora. Sistema **deliberadamente
> temporário**, dimensionado para ser arquivado quando o seu sucessor
> (SmartLegis ou Plataforma IntGov da UnIT) entrar em produção.

## Filosofia

Esta versão (v2.0) substitui a v1.0 RC, que estava sobre-engenheirada
para um sistema com horizonte de vida de 18-24 meses. Foram cortados:

- Comprovativos JWS Ed25519 + cadeia de chaves
- PostgreSQL, Redis, MinIO/S3
- SMTP outbox + worker, SSE em tempo real
- Adapter de diretório LDAP/HTTP + TOTP + federação simulada
- Polling DRE e webhooks ConsultaLex
- Threat model, DPIA extenso, declaração de acessibilidade longa
- Dashboards de KPIs e cronograma painel
- Auditoria QA estruturada (passou a viver no audit log)

O que ficou:

- 1 processo Node.js · ~1500 LOC
- SQLite (1 ficheiro) + filesystem para anexos
- Auth Entra ID (stub) + driver `mock` para dev
- JSON canónico da FPL (substituibilidade)
- HTML estático da ficha pública (sem deploy automático)
- Hash SHA-256 da publicação (igual ao INTEGRA da UnIT)
- Backup diário em pasta sincronizada com SharePoint

## Modelo de dados — Blocos da FPL

| Bloco | Conteúdo | Origem |
|---|---|---|
| A | Identificação (número, tipo, título, gabinete, coproponentes) | Sistema |
| B | Enquadramento (origem, síntese do problema, AIN) | Ponto focal |
| **D.1** | **Audições obrigatórias** (CES, ANMP, parceiros sociais...) | Ponto focal |
| **D.2** | **Audições promovidas pelo GSEPCM** (discricionárias) | Ponto focal / GSEPCM |
| **D.3** | **Interações INTEGRA (pré-processo)** — read-only | Upload JSON UnIT |
| E | Consulta pública (link + n.º contributos + síntese) | Ponto focal |

> **Bloco D dividido em três:** o nosso âmbito são as interações **durante**
> o processo legislativo (D.1 obrigatórias, D.2 GSEPCM). Os contactos
> **pré-processo** nos gabinetes (com representantes de interesses,
> Lei 5-A/2026) são geridos pelo INTEGRA da UnIT — o seu JSON é ingerido
> e mostrado na ficha como contexto histórico (D.3).

## Estados / Marcos

```
RASCUNHO  ──M0──▶  EM_RSE  ──M2──▶  EM_CONSULTA_PUBLICA
                                          │
                                         M3 (informativo, fim CP)
                                          ▼
                                   EM_CONSULTA_PUBLICA
                                          │
                                         M4
                                          ▼
                                        EM_CM  ──aprovar──▶  APROVADO  ──M5──▶  PUBLICADO
```

- **M0** · Abertura (Bloco B preenchido, síntese ≥ 200c)
- **M2** · Abertura CP (link ConsultaLex registado)
- **M3** · Encerramento CP (n.º de contributos + síntese ≥ 200c)
- **M4** · Pré-CM (decisão+justificação preenchidas para audições que responderam)
- **M5** · Publicação (referência DR; hash SHA-256 gravado)

Sem comprovativos criptográficos. Sem declaração de completude assinada.
A integridade do que se publica é o hash SHA-256 do JSON canónico,
gravado em M5. Se for preciso provar autoria/momento, o audit log e os
snapshots de versão chegam.

## Estrutura do repositório

```
Sistema/
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
│   │   │   ├── backup.js       Backup periódico para pasta SharePoint
│   │   │   ├── anexos.js       Anexos no filesystem
│   │   │   ├── routes.js       Endpoints REST
│   │   │   ├── seed.js         Dados demo
│   │   │   └── util.js
│   │   ├── test/
│   │   │   └── smoke.test.js   7 testes (schema, seed, canónico, ficha,
│   │   │                       audições, ingestão INTEGRA, marco M0)
│   │   └── package.json        Apenas: express + cookie-parser
│   ├── frontend/               SPA (painel design, mantida)
│   └── e2e/
├── demo/                       Demonstração interativa standalone
├── mock/                       Página institucional de apresentação
└── docs/
    ├── 02_Arquitetura.md       (atualizada para v2.0)
    ├── 06_Operacao.md          (atualizada para v2.0)
    ├── 14_Questionario_Infraestrutura.md   (questões para DSTD)
    └── _arquivo/               (docs históricos da v1.0)
```

## Arranque local (DEV)

```bash
cd app/backend
npm install
npm run migrate
npm run seed
npm run dev
```

Visita http://localhost:3717/ e entra com `maria.silva@maen.gov.pt`
(qualquer email do seed funciona; não há password no modo `mock`).

## Arranque em produção (DSTD)

1. **VM Linux pequena** (2 vCPU / 4 GB RAM / 20 GB disco), Node 22+, sem
   acesso à internet pública (só intranet do Governo).
2. Configurar Entra ID:
   ```
   AUTH_DRIVER=entra
   ENTRA_TENANT_ID=...
   ENTRA_CLIENT_ID=...
   ENTRA_CLIENT_SECRET=...
   ENTRA_REDIRECT_URI=https://fpl.gov.pt/api/auth/entra/callback
   ENTRA_ADMIN_MAP="admin1@sggoverno.gov.pt:SGGOV_ADMIN;qa@sggoverno.gov.pt:SGGOV_QA"
   ```
3. Backup para pasta SharePoint:
   ```
   BACKUP_DIR=/mnt/sharepoint-fpl/backup
   ```
   Em produção esta pasta é o ponto de montagem do cliente OneDrive
   sincronizado com SharePoint. Não usamos Graph API — basta escrever
   ficheiros, o sync trata do resto.
4. `npm install && npm run migrate && npm start` atrás de um reverse-proxy
   (Apache / Nginx) com TLS.

## Custos

| Item | Mensal |
|---|---|
| VM DSTD (partilhada) | ~€0 |
| Storage SQLite + ficheiros | ~€0 (alguns GB) |
| MSAL / Entra ID | €0 (licença M365 Gov existente) |
| SharePoint backup | €0 (licença M365 Gov existente) |
| **Operação** | ~1 dia-pessoa/mês |

## Saída (quando o sucessor estiver pronto)

1. Exportar JSON canónico em massa: `GET /api/export/canonicos`
2. Esse JSON é o **único formato** que o sucessor precisa de aceitar.
3. Decomissionar VM. Manter cópia do SQLite + backup SharePoint para
   arquivo.

Tempo estimado: **1-2 dias**.

## Componentes adicionais (não fazem parte do sistema)

- `demo/` — Demonstração interativa autónoma (HTML+JS), útil para mostrar
  externamente sem dependências do backend.
- `mock/` — Página institucional de apresentação (republic-style),
  publicada em GitHub Pages.
- `docs/_arquivo/` — Documentos da versão anterior (v1.0 RC). Mantidos
  para histórico mas não refletem a v2.0.

## Versão e licença

- **v2.0.0-simplificado** · 1 de Junho de 2026
- Licença: ver `LICENSE`
- Histórico de simplificação: ver `docs/_arquivo/`
