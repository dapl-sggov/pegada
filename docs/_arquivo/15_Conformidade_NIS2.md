# Conformidade NIS2 — análise da aplicação

**Versão:** 1.0 — Maio 2026
**Aplicação:** FPL Ponte (Pegada Legislativa do Governo)
**Autor:** DAPL/DSSD — Secretaria-Geral do Governo
**Quadro legal:** Diretiva (UE) 2022/2555 (NIS2); transposição nacional pelo Decreto-Lei n.º 65/2021 (revisto) e legislação subsequente

> **Posição de partida.** A NIS2 aplica-se a entidades essenciais, e a Administração Pública central encontra-se no perímetro. **O cumprimento da NIS2 tem de ser verificado relativamente à aplicação inteira** — não apenas aos processos institucionais que correm em redor dela. Este documento faz essa verificação: identifica os 10 requisitos do art. 21.º da Diretiva, mostra onde a aplicação já os cumpre (com referência ao código e à documentação), assinala o que está parcial, e enumera o que depende da integração com processos da DSTD.

---

## 1 · Princípios

1. **Defesa em profundidade.** Cada controlo é aplicado no menor número de camadas necessárias mas nunca apenas numa.
2. **Tudo dentro da RING.** Sem face pública para a internet, sem dependências externas obrigatórias, sem CDNs.
3. **Evidência verificável.** Cada requisito tem ficheiro e linha de código (ou documento) que o prova. Auditorias futuras devem encontrar a evidência sem caça ao tesouro.
4. **Degradação graciosa.** A aplicação não bloqueia operações de negócio por falha de infraestrutura externa — apenas por falha de regra de validação.

---

## 2 · Matriz de conformidade (art. 21.º NIS2)

| Alínea | Requisito | Estado | Onde está a evidência |
|---|---|---|---|
| a | Análise de riscos e segurança dos SI | **Cumpre** | `docs/09_Threat_Model_Comprovativo.md`, `docs/11_Threat_Model_Sistema.md` |
| b | Tratamento de incidentes | **Parcial** | `docs/06 §7.3`; falta integração com SOC central da DSTD |
| c | Continuidade, backups, gestão de crises | **Parcial** | `docs/06 §5`; falta validação trimestral do restore |
| d | Segurança na cadeia de fornecimento | **Cumpre** | SBOM SPDX, `npm audit` em CI, self-hosting de fontes |
| e | Segurança no desenvolvimento e tratamento de vulnerabilidades | **Cumpre** | CI com `npm audit`, code review obrigatório, `assertConfigProducao` em `config.js` |
| f | Avaliação periódica da eficácia das medidas | **A iniciar** | Métricas em `/metrics`, testes 28 backend + 5 e2e; falta auditoria de segurança formal recorrente |
| g | Ciber-higiene e formação | **Dependente** | Falta programa formal (DSTD ou DAPL/DSSD) |
| h | Criptografia e encriptação | **Cumpre na app · depende em repouso** | Ed25519, SHA-256, HMAC-SHA256, TLS no proxy; encriptação em repouso depende dos volumes da DSTD |
| i | Recursos humanos, controlos de acesso, gestão de ativos | **Cumpre na app** | RBAC, scope por gabinete server-side, auditoria de tentativas; integração CMDB depende da DSTD |
| j | Autenticação multifator | **Cumpre · falta política de obrigatoriedade** | TOTP RFC 6238 em `src/totp.js`; falta forçar 2FA para `SGGOV_ADMIN` |

**Resumo:** 5 cumprem, 3 parciais, 1 a iniciar, 1 dependente. **Nenhum requisito está em incumprimento total.** Os parciais e dependentes resolvem-se por integração com processos institucionais da DSTD — não exigem reescrita da aplicação.

---

## 3 · Análise detalhada

### a) Análise de riscos e segurança dos SI

**Cumpre.** Existem dois threat models documentados:

- `docs/09_Threat_Model_Comprovativo.md` — análise focada no comprovativo criptográfico (vetores de adulteração, replay, comprometimento de chave, alg-swap).
- `docs/11_Threat_Model_Sistema.md` — análise sistémica (auth, escopo por gabinete, anexos, webhooks, RBAC, integrações externas).

Ambos seguem o quadro STRIDE adaptado e identificam controlos. As decisões arquitecturais (confinamento à RING, JWS Ed25519, ausência de federação OIDC pública) são justificadas em `docs/07_Adaptacao_Brainstorming.md`.

**O que falta:** revisão anual dos threat models, gatilhada por alterações arquiteturais ou novos vetores detetados.

### b) Tratamento de incidentes

**Parcial.**

A aplicação produz:
- Logs JSON estruturados (`LOG_FORMAT=json` em produção).
- Tabela `evento_auditoria` (append-only, IP, user-agent, autor) — `app/backend/src/db.js`.
- Endpoint `/health` para vivacidade — `app/backend/src/server.js:80`.
- Métricas Prometheus em `/metrics`.
- Runbook de rotação de chave por comprometimento — `docs/06 §7.3`.

**O que falta:** procedimento documentado de notificação de incidente conforme NIS2 (alerta inicial em 24h, notificação em 72h, relatório final em 1 mês). Destinatário tem de ser confirmado com a DSTD — provavelmente CNCS via cadeia institucional. Ver §15 do questionário (`docs/14`).

### c) Continuidade da atividade, backups, gestão de crises

**Parcial.**

Definido em `docs/06_Operacao.md §5`:
- Backup automático diário via cron (`pg_dump` para a BD, `mc mirror` para anexos MinIO).
- Retenção 30 dias rolling.
- RPO 24h com `pg_dump`; <5 min com WAL streaming (opcional).
- RTO <1h num único nó.
- Recuperação documentada com comandos exatos.

**O que falta:** teste trimestral formal do restore em ambiente isolado (procedimento existe, falta calendarização e registo). Alinhamento com plano de continuidade institucional da SGGOV — saber se a RING tem janelas de DR exercício obrigatórias.

### d) Segurança na cadeia de fornecimento

**Cumpre.**

- **SBOM** SPDX 2.3 gerado em cada build (`npm sbom --sbom-format=spdx`) — 87 pacotes inventariados.
- **`npm audit`** em CI bloqueia o build se houver vulnerabilidades de severidade `moderate` ou superior.
- **Dependências mínimas:** Express, cookie-parser, cors. Dependências opcionais (`ldapts`, `nodemailer`) só ativam em modo `http`/`smtp`.
- **Fontes web** todas self-hosted em `app/frontend/assets/fonts/` e `demo/assets/fonts/` — zero CDNs.
- **CSP estrita** impede qualquer carregamento de origem externa em runtime.
- **Imagem base** `node:22-alpine` reconstruída a cada CVE relevante.

**O que falta confirmar com a DSTD:** lista branca de bibliotecas (existe?), processo de aprovação para adicionar nova dependência ao SBOM.

### e) Segurança no desenvolvimento, aquisição e manutenção · tratamento de vulnerabilidades

**Cumpre.**

- Repositório `dapl-sggov/pegada` com PR review obrigatório.
- CI corre `npm audit`, `node --test`, e linters em cada PR.
- Segredos nunca em código — validado por `assertConfigProducao()` em `app/backend/src/config.js` (recusa arrancar se `JWT_SECRET`, `CL_WEBHOOK_KEY` ou chave Ed25519 forem valor de demonstração).
- Versionamento semântico nas releases; cada versão tem changelog.
- **Tratamento de vulnerabilidades:** procedimento em `docs/06 §7.3` para rotação de chave; processo de remediação de CVEs documentado.

**O que falta:** pen-test externo (planeado, item da checklist de go-live em `docs/06 §10`).

### f) Avaliação periódica da eficácia das medidas

**A iniciar.**

- Métricas Prometheus em `/metrics`: latência por rota, throughput, erros, FPL criadas/dia, marcos validados, comprovativos emitidos/dia, snapshot de estados de workflow, falhas RTRI, falhas de assinatura.
- Suite de testes: 28 testes de integração no backend + 5 testes end-to-end.

**O que falta:** auditoria de segurança formal recorrente — quem audita, com que frequência, quem recebe o relatório. A DSTD deve definir a cadência institucional (proposta: anual + extraordinária por incidente).

### g) Ciber-higiene e formação

**Dependente.**

A aplicação tem documentação de utilizador (a produzir antes do go-live) e a declaração de acessibilidade em `/declaracao-acessibilidade.html`.

**O que falta:** programa formal de formação obrigatória para Pontos Focais, papéis SGGOV QA e Admin, e GSEPCM. Conteúdo mínimo: tratamento de credenciais, identificação de phishing, política de senhas, uso correto do 2FA, processo de comunicação de incidentes. **Responsabilidade institucional** — DSTD ou DAPL/DSSD a decidir.

### h) Políticas e procedimentos sobre criptografia e encriptação

**Cumpre na aplicação · depende em repouso.**

| Camada | Algoritmo | Onde |
|---|---|---|
| Comprovativos | **Ed25519 (RFC 8037)** | `app/backend/src/comprovativo.js` — assinatura nativa `crypto` |
| Snapshots | SHA-256 canónico | mesmo módulo |
| Webhook ConsultaLEX | HMAC-SHA256 com timestamp e janela 5 min | `app/backend/src/consultalex.js` |
| Sessão e CSRF | JWT HS256 + double-submit cookie | `app/backend/src/auth.js`, `security.js` |
| 2FA | TOTP RFC 6238 (HMAC-SHA1, 30 s, 6 dígitos) | `app/backend/src/totp.js` |
| Passwords | bcrypt (12 rounds) | `app/backend/src/auth.js` |
| TLS | Terminado no reverse proxy interno (TLS 1.2+) | infraestrutura DSTD |

**O que falta:** encriptação em repouso dos volumes Postgres e MinIO. Depende da configuração da plataforma de armazenamento que a DSTD vier a fornecer (LUKS, dm-crypt, ou equivalente gerido). Cofre de segredos para a chave privada Ed25519 — ver §9 do questionário (`docs/14`).

### i) Recursos humanos, controlos de acesso e gestão de ativos

**Cumpre na aplicação · gestão de ativos depende.**

Controlos implementados:

- **RBAC** com quatro papéis (`PONTO_FOCAL`, `PONTO_FOCAL_ALT`, `SGGOV_QA`, `SGGOV_ADMIN`, `GSEPCM`) — `app/backend/src/auth.js`.
- **Escopo por gabinete** enforced server-side em cada endpoint — um PF do MAE não consegue ler FPL do MS, validado em `app/backend/src/fpl.js` em cada rota.
- **Bloqueio de conta** após 8 tentativas falhadas em 30 minutos — `app/backend/src/security.js`.
- **Auditoria de tentativas de login** — tabela `tentativa_login`.
- **Provisionamento just-in-time** via LDAP — quando funcionário entra, conta cria-se no primeiro login com grupos sincronizados. Quando sai, basta remover do grupo LDAP — a aplicação revoga acesso no próximo login.
- **Revogação imediata por admin** — endpoint `/api/admin/utilizadores/:id/revogar` (SGGOV_ADMIN).

**O que falta:** integração com CMDB institucional (a aplicação tem de ser registada como ativo digital). Procedimento de offboarding síncrono via webhook do RH ou diretório — para garantir revogação <1h em vez de "no próximo login".

### j) Autenticação multifator

**Cumpre · falta política de obrigatoriedade.**

- **2FA TOTP** implementado nativamente (`app/backend/src/totp.js`) — RFC 6238, compatível com Google Authenticator, Microsoft Authenticator, Authy.
- Setup com chave manual exibida (sem QR — CSP estrito não permite imagens externas).
- Validação no login; bloqueia se ativo e código errado.

**O que falta:** política de **2FA obrigatório** para papéis sensíveis. Proposta:
- `SGGOV_ADMIN`: 2FA **obrigatório**, não desativável pelo próprio.
- `SGGOV_QA`, `GSEPCM`: 2FA **recomendado** com alerta diário se desativado.
- `PONTO_FOCAL`: 2FA **opcional** mas incentivado na formação.

Confirmar com a DSTD se há política institucional de autenticação forte que se sobreponha (smart card, chave física).

---

## 4 · Notificação de incidentes (art. 23.º)

A NIS2 (art. 23.º) exige três janelas temporais:

| Janela | Tipo | Conteúdo |
|---|---|---|
| **24 horas** | Alerta inicial | Suspeita de incidente significativo, indicação de ato ilícito ou efeito transfronteiriço |
| **72 horas** | Notificação completa | Avaliação inicial do incidente, indicadores de comprometimento, vetor, ações em curso |
| **1 mês** | Relatório final | Descrição detalhada, causa raiz, medidas corretivas, lições aprendidas |

**Capacidade técnica do nosso lado:**

- Deteção: alertas Prometheus + AlertManager (alarmes definidos em `docs/06 §6.3`).
- Investigação: logs JSON, `evento_auditoria`, `tentativa_login`, dumps periódicos da BD.
- Comunicação: a definir canal e destinatário com a DSTD (ver §15.4 do questionário).

**O que falta:** runbook de incidente específico (passos do alerta à comunicação CNCS), template do relatório, drill anual.

---

## 5 · Dependências da DSTD (cruzamento com `docs/14 §15`)

Itens em que a conformidade NIS2 da aplicação só fica fechada quando a DSTD responder:

| # | Item | Pergunta no `docs/14` |
|---|---|---|
| 1 | Classificação NIS2 da aplicação como entidade essencial (herdada da SGGOV?) | §15.1 |
| 2 | CISO institucional que valida configuração de segurança | §15.2 |
| 3 | Template institucional de gestão de risco a preencher | §15.3 |
| 4 | Canal e prazo de notificação de incidentes (CNCS via que entidade?) | §15.4 |
| 5 | SOC/SIEM central — formato de logs aceite | §15.5 |
| 6 | Alinhamento RPO/RTO com plano de continuidade institucional | §15.6 |
| 7 | Lista branca/preta de bibliotecas; processo de aprovação | §15.7 |
| 8 | Política de autenticação forte institucional | §15.8 |
| 9 | Encriptação em repouso dos volumes (Postgres/MinIO) | §15.9 |
| 10 | Cadência de auditorias NIS2 formais; quem coordena | §15.10 |
| 11 | Programa de formação obrigatória | §15.11 |
| 12 | Inventário CMDB e processo de registo | §15.12 |

---

## 6 · Plano de verificação periódica

| Verificação | Cadência | Responsável | Output |
|---|---|---|---|
| Revisão dos threat models | Anual + por incidente | DAPL/DSSD | Atualização de `docs/09`, `docs/11` |
| Pen-test externo | Anual | DAPL/DSSD coordena, externa executa | Relatório arquivado |
| Teste de restore (RTO/RPO) | Trimestral | DSTD/DAPL/DSSD | Registo em runbook |
| Drill de notificação de incidente | Anual | DAPL/DSSD + DSTD | Registo de tempos efetivos vs. SLA NIS2 |
| Auditoria de segurança formal | Anual | DSTD (ou independente) | Relatório de gaps |
| Revisão de dependências (SBOM) | Mensal | CI automático + revisão humana trimestral | Diff SBOM |
| Validação de rotação de chave Ed25519 | Anual | DAPL/DSSD + SmartLegis | `docs/06 §7.3` executado em homologação |
| Auditoria de logs de acesso anómalo | Mensal | SGGOV_ADMIN | Dashboard `evento_auditoria` |
| Revisão de utilizadores e papéis | Trimestral | SGGOV_ADMIN + RH | Diff face ao LDAP |
| Atualização da declaração de acessibilidade | Anual + por mudança UI | DAPL/DSSD | `/declaracao-acessibilidade.html` |

---

## 7 · Evidências documentais agregadas

| Documento | Cobre requisitos |
|---|---|
| `docs/06_Operacao.md` | b, c, e, h, i (parcialmente todos) |
| `docs/09_Threat_Model_Comprovativo.md` | a |
| `docs/10_DPIA.md` | a, i (overlap RGPD) |
| `docs/11_Threat_Model_Sistema.md` | a |
| `docs/12_Especificacao_Comprovativo_SmartLegis.md` | h |
| `docs/13_Contratos_Integracao_Externa.md` | d, b |
| `docs/14_Questionario_Infraestrutura.md` | dependências institucionais (todos) |
| `docs/15_Conformidade_NIS2.md` *(este)* | índice consolidado |
| `app/backend/src/security.js` | i, j (CSRF, headers, rate limit) |
| `app/backend/src/totp.js` | j |
| `app/backend/src/comprovativo.js` | h |
| `app/backend/src/auth.js` | i |
| `app/backend/test/` | f (testes) |
| `.github/workflows/*.yml` | d, e (CI, SBOM, audit) |

---

## 8 · Conclusão

A aplicação está **arquitetonicamente conforme** com os requisitos técnicos da NIS2 que dependem do código. O que falta é **fechar a integração institucional** com os processos da DSTD: notificação de incidentes, SOC central, encriptação em repouso, CMDB, formação, auditorias formais. Nenhum dos *gaps* exige reescrita da aplicação — todos são integração ou política.

Este documento deve ser atualizado:
- Quando qualquer requisito mudar de estado (parcial → cumpre, etc.).
- Quando for publicada legislação adicional de transposição.
- Antes de cada auditoria formal.
- Após cada incidente significativo.

**Próxima revisão prevista:** 6 meses após o go-live.
