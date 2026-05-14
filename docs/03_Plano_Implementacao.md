# Plano de Implementação — FPL Ponte v1.0

**Versão:** 2.0 — Maio 2026 (revista após decisões do Memorando Executivo e da RCM v2)
**Cronograma:** 11 semanas até ao go-live obrigatório de 27 de julho de 2026
**Equipa:** 7–8 FTE internos SGGOV (ver Nota de Capacidade SGGOV) · gestão exclusivamente SGGOV
**Filosofia:** *deliver early, iterate* — v1.0 deliberadamente minimalista; v2.0 e v3.0 nos meses seguintes.

> **Nota de versão.** Esta v2.0 alinha o plano com as decisões dos documentos de decisão: confinamento à RING (sai a federação OIDC), acoplamento por comprovativo criptográfico (entra um marco de engenharia novo), publicação no Portal do Governo (o portal público sai da app e dá lugar a um módulo de exportação), gestão exclusivamente SGGOV (sai o procedimento de contratação de desenvolvimento). Ver `docs/07_Adaptacao_Brainstorming.md`.

---

## Calendário macro

| Marco | Evento |
|---|---|
| Arranque | Equipa formalmente afeta; ambientes provisionados na RING |
| ~Semana 7 | Núcleo funcional em staging; especificação do comprovativo fechada com a equipa SmartLegis; formação dos pontos focais iniciada |
| ~Semana 10 | Pen-test externo concluído; piloto com dois ministérios |
| ~Semana 11 | Go-live em modo "sombra"; formação concluída |
| **27 julho 2026** | **Entrada em vigor obrigatória** — prazo legal, sem prorrogação. Aplicação plenamente operacional |

O processo de decisão política que antecede o arranque consta dos documentos
de decisão da SGGOV (documentação interna, não versionada neste repositório).

---

## Sequência de marcos de engenharia

| # | Marco | Semana | Critério de aceitação |
|---|---|---|---|
| E1 | Setup técnico na RING | 1 | Repos, CI, ambientes dev/staging na RING operacionais |
| E2 | Fundações de domínio | 2 | Modelo de dados (Postgres), migrations idempotentes, seed |
| E3 | Auth via diretório interno + RBAC | 2-3 | Login contra diretório interno, sessões, papéis, escopo por gabinete, TOTP |
| E4 | Núcleo CRUD FPL | 3-4 | Criar FPL, editar blocos A-E, listar, ler, versionar |
| E5 | Workflow + marcos M0-M5 | 4-5 | Máquina de estados; validações server-side; devolução de pendências |
| **E6** | **Comprovativo criptográfico** | **5-6** | **Emissão Ed25519 nos marcos M0/M3/M4/M5; verificação offline; JWKS; rotação de chaves. Especificação fechada com SmartLegis.** |
| E7 | Bloco D + RTRI (fallback) | 6 | Interações externas; lookup RTRI local; modo degradado manual |
| E8 | Frontend MVP | 4-8 (paralelo) | UI completa para o fluxo M0→M5, incluindo apresentação do comprovativo |
| E9 | Anexos (MinIO) + auditoria | 7 | Upload S3, SHA-256, antivírus, audit log |
| E10 | Notificações internas | 7-8 | Notificações in-app + outbox; sem dependência de SMTP externo no arranque |
| E11 | Bloco G (auditoria QA) | 8 | Pontuação, pedido de correção, fluxo de correção; revogação de comprovativo |
| **E12** | **Exportação para o Portal do Governo** | **8-9** | **Pacotes estruturados (JSON/JSON-LD/CSV); lote por data; vocabulário OCDE. Transferência manual operável pela SGGOV.** |
| E13 | Hardening segurança | 9-10 | OWASP, headers, rate limit, CSRF; *threat modeling* do comprovativo |
| E14 | Observabilidade | 10 | Métricas Prometheus, dashboards, SLOs, healthchecks |
| E15 | Acessibilidade WCAG 2.2 AA | 10-11 | Auditoria axe-core + teste com leitor de ecrã; auditoria externa |
| E16 | Pen-test externo | 11 | Findings críticos resolvidos; superfície reduzida pelo confinamento à RING |
| E17 | Piloto 2 ministérios | 11 | Cenários reais em staging; recolha de feedback |
| E18 | Go-live na RING | 12 | Sistema em produção na RING; formação concluída; modo sombra 22-27 jul |

Face à v1.0 do plano: **E6 (comprovativo) é novo**; **E12 deixou de ser "portal público" e passou a "exportação"**; as tarefas de federação OIDC foram **removidas** de E3; o marco de contratação de empresa de desenvolvimento foi **removido** (gestão exclusivamente SGGOV).

---

## Detalhe dos marcos com maior mudança

### E1 — Setup técnico na RING (semana 1)
- Repositório Git, CI (lint + smoke test), ambientes dev/staging **na RING**
- Docker Compose: Postgres + Redis + MinIO + app (ver `docker-compose.yml`)
- Sem provisionamento de ambiente exposto à internet — nenhuma fase do projeto o exige
- Cofre de segredos para a chave privada Ed25519

### E3 — Auth via diretório interno + RBAC (semana 2-3)
- *Adapter* de autenticação contra o **diretório interno dos serviços** (LDAP/AD)
- No protótipo, *adapter* com utilizadores locais que simula o diretório; em produção, configuração aponta ao diretório real — sem refactor
- TOTP obrigatório para SGGOV_ADMIN e SGGOV_QA
- **Sem federação OIDC** — removido por decisão (confinamento à RING)
- RBAC com escopo por gabinete

### E6 — Comprovativo criptográfico (semana 5-6) — MARCO NOVO
- Módulo `comprovativo.js`: emissão e verificação
- Geração de par de chaves Ed25519; chave privada no cofre de segredos
- Emissão de JWS compacto nos marcos M0, M3, M4, M5
- Cálculo de `snapshot_hash` (SHA-256 do snapshot canónico)
- Tabelas `comprovativo` e `chave_assinatura`
- Endpoint `GET /api/.well-known/fpl-jwks.json` (consumido pelo SmartLegis)
- Endpoint `POST /api/comprovativos/:jti:verificar` (uso de auditoria)
- Rotação de chaves via `kid`, sem downtime
- Revogação por mudança de estado (`VALIDO`→`SUBSTITUIDO`)
- **Dependência crítica:** especificação conjunta fechada com a equipa do SmartLegis até 30 de junho. Esta coordenação é feita a montante e não se repete depois do go-live.

### E12 — Exportação para o Portal do Governo (semana 8-9)
- Módulo `export.js`
- `GET /api/export/fpl/:id` — pacote de uma FPL publicada, com filtro de visibilidade
- `GET /api/export/lote?desde=` — lote para sincronização periódica
- `GET /api/export/datasets/fpl.{json,csv,jsonld}` — datasets agregados, JSON-LD com vocabulário OCDE
- **Não há portal público servido pela app.** A app gera os artefactos; o Portal do Governo serve-os ao público, ao lado da Agenda Pública
- Transferência manual operável pela SGGOV no arranque; automatização posterior

---

## Decisões já fechadas (não reabrir)

Os documentos de decisão fecharam o que estava em aberto na v1.0 deste plano:

| Decisão | Resolução |
|---|---|
| Stack de backend | Node.js / Express / PostgreSQL |
| Build vs. Buy | **Build interno**, gestão exclusivamente SGGOV |
| Infraestrutura | **RING** (gerida pela SGGOV pós-integração do CEGER) |
| Operação pós-go-live | **SGGOV interna** |
| Autenticação | Diretório interno + TOTP; **sem OIDC** |
| Exposição de rede | **Confinada à RING**, acesso por VPN |
| Bloqueio | **Comprovativo criptográfico** verificável pelo SmartLegis |
| Publicação pública | **Portal do Governo**, ao lado da Agenda Pública |
| Inclusão de Regulamentos | Não na v1.0 — RCM v2 n.º 2.2/2.3 prevê extensão faseada em 12 meses |
| Retenção de dados | Indefinida para dados FPL (interesse público); logs 5 anos; sessões 30 dias |

---

## Riscos do plano (alinhados com o Memorando)

| Risco | Probabilidade | Mitigação |
|---|:---:|---|
| Capacidade interna SGGOV insuficiente em 12 semanas | Média | Avaliação imediata de competências; reforço pontual (1-2 FTE) por contratação direta + contrato de segurança |
| RTRI não pronto a 27 julho | Alta | Modo *fallback* manual desenhado de origem; sem dependência crítica |
| Especificação do comprovativo demora | Baixa | Equipas internas SGGOV; especificação fechada em maio |
| Pen-test deteta falhas críticas | Média | Buffer de 1 semana; superfície reduzida pelo confinamento à RING |
| Adesão dos pontos focais insuficiente | Média | Submissão bloqueante por comprovativo + formação obrigatória + QA mensal SGGOV |
| Acessibilidade não satisfaz WCAG 2.2 AA | Baixa | Auditoria externa antes do go-live; correções iterativas |
| Indisponibilidade transitória da VPN do Governo | Baixa | Risco operacional já gerido pelo serviço de TI do Estado; a aplicação não introduz risco novo |

---

## Faseamento pós-v1.0

### v2.0 — 31 outubro 2026 — Integrações maturadas
- Sincronização plena com o RTRI (quando a API da AR estiver disponível e contratualizada)
- Otimização do pacote de exportação para o Portal do Governo; automatização da transferência
- API de consulta para investigadores (a partir da RING ou via Portal do Governo)
- Webhook Consulta.Lex (quando disponível)
- Dashboards SGGOV completos

### v3.0 — 31 março 2027 — Cobertura plena
- Suporte a Regulamentos e demais atos (RCM v2, n.º 2.2 — extensão faseada)
- Coexistência com o SmartLegis; migração progressiva de FPL
- Modalidades simplificadas para tipologias de baixo conteúdo discricionário

---

## Pré-condições para o arranque

O cronograma de ~11 semanas só é credível com um conjunto de decisões prévias —
aprovação política do caminho, afetação de recursos internos, abertura de canal
formal com a AR sobre o RTRI e submissão da RCM. O detalhe, os responsáveis e os
prazos dessas decisões constam dos documentos de decisão da SGGOV (documentação
interna, não versionada neste repositório).

O essencial para o planeamento de engenharia: **cada semana de atraso nas
decisões prévias comprime proporcionalmente o tempo de desenvolvimento**, e existe
uma data a partir da qual a equipa interna já não consegue ser alocada em tempo
útil para garantir o go-live no prazo legal.
