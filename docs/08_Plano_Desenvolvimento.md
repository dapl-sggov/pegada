# Plano de Desenvolvimento da Plataforma FPL Ponte

**Versão:** 1.0 — Maio 2026
**Âmbito:** roteiro completo do desenvolvimento, do estado atual (v0.2, demonstrável) até à v1.0 operacional na RING
**Pressuposto:** desenvolvimento em sessões de trabalho conjuntas intensivas. As estimativas são em **sessões**, não em semanas de calendário.

> **Como ler este documento.** Cada bloco de trabalho indica:
> 🤖 **o que é feito na sessão** (código, documentação, configuração — autónomo)
> 👤 **o que depende de si** (acessos, decisões, contratos, validações — ações externas)
> ⛔ **bloqueios** — o que tem de estar resolvido antes de avançar.
>
> A secção 9 consolida **todas as ações do utilizador** num único checklist.

---

## 1. Estado atual (ponto de partida)

Já está feito e no repositório `dapl-sggov/pegada`:

| Componente | Estado |
|---|---|
| Documentação técnica (`docs/01`–`07`) | ✅ Análise crítica, arquitetura v2.0, plano, operação, adaptação às decisões de maio |
| Mock institucional (`mock/`) | ✅ Online em GitHub Pages |
| Demonstração interativa autónoma (`demo/`) | ✅ Online — SPA completa, workflow real, comprovativo |
| Sistema funcional v0.2 (`app/`) | ✅ Backend Node + SQLite (modo legado síncrono) + frontend SPA · corre localmente |
| Fase 1 de portabilidade | ✅ `config.js` 12-factor, `docker-compose` (Postgres+Redis+MinIO), `Dockerfile`, `release.yml`, runbook |
| CI/CD + Pages + branch protection | ✅ Workflows a funcionar |

**O que falta para a v1.0 operacional:** o refactor do código para a arquitetura de produção (Postgres assíncrono, MinIO, Redis), o módulo de comprovativo criptográfico, o frontend de produção, testes, integrações reais e o deployment na RING. É isso que este plano detalha.

---

## 2. Visão geral — blocos de trabalho

```
BLOCO A · Refactor para produção         ~7 sessões   (100% autónomo)
BLOCO B · Frontend de produção           ~3 sessões   (autónomo + 1 decisão sua)
BLOCO C · Qualidade e segurança          ~2 sessões   (autónomo)
BLOCO D · Documentos de conformidade     ~2 sessões   (eu redijo, você valida/submete)
BLOCO E · Integrações reais              ~3 sessões   (depende de acessos seus)
BLOCO F · Deployment e go-live           ~2 sessões   (eu preparo, você executa na RING)
                                         ───────────
                                         ~19 sessões de desenvolvimento
```

Os blocos A, B, C e D **não dependem de nada externo** — podemos fazê-los já, em sequência, sem esperar por terceiros. O bloco E depende de acessos que tem de desbloquear em paralelo. O bloco F é o fecho.

---

## 3. BLOCO A — Refactor para produção

Migração do código de SQLite síncrono para a arquitetura-alvo: PostgreSQL assíncrono, object storage MinIO, Redis, e o módulo de comprovativo criptográfico. Feito num branch `feat/portabilidade`, com merge só no fim — o `main` nunca fica partido.

### Sessão A1 — Camada de dados
🤖 `db.js` reescrito para PostgreSQL com pool `pg` e camada de compatibilidade assíncrona (conversão `?`→`$n`); `migrate.js` com schema idempotente (substitui o `init()` espalhado por 4 ficheiros); refactor de `util.js` e `workflow.js`.
👤 Nada.
⛔ Nada — Postgres corre em container local.

### Sessão A2 — Domínio FPL assíncrono
🤖 Refactor de `fpl.js` (criar, editar, versionar, validar marcos) e `auth.js` para async/await.
👤 Nada.

### Sessão A3 — API e segurança assíncronas
🤖 Refactor de `routes.js` (≈30 endpoints) e `security.js` (rate-limit, CSRF, bloqueio de conta) para async; rate-limit passa a usar Redis.
👤 Nada.

### Sessão A4 — Anexos, notificações e adapters de dados
🤖 `storage.js` (abstração filesystem→MinIO/S3, driver configurável); `redis.js` (sessões, cache, filas); refactor de `anexos.js`, `notificacoes.js`, `consultalex.js`, `rtri.js`, `seed.js`.
👤 Nada.

### Sessão A5 — Módulo de comprovativo criptográfico ⭐
🤖 `comprovativo.js` — geração de par de chaves Ed25519, emissão de JWS compacto nos marcos M0/M3/M4/M5, cálculo de `snapshot_hash`, tabelas `comprovativo` e `chave_assinatura`, endpoint `/.well-known/fpl-jwks.json`, endpoint de verificação, rotação de chaves por `kid`. Integração na máquina de estados.
👤 Nada para o desenvolvimento. (A *especificação conjunta* com a equipa do SmartLegis — ver Bloco D/E — pode correr em paralelo.)

### Sessão A6 — Exportação e diretório interno
🤖 Módulo `export.js` (pacotes estruturados JSON/JSON-LD/CSV para o Portal do Governo, vocabulário OCDE); reposicionamento dos endpoints `/api/publico/*` → `/api/export/*`; adapter de autenticação com driver `local` (utilizadores na BD) e `ldap` (diretório real) — o `local` simula o diretório para desenvolvimento.
👤 Nada.

### Sessão A7 — Adapters externos e integração end-to-end
🤖 Adapters RTRI e Consulta.Lex com modo `mock` e `http`; teste end-to-end da stack Docker completa (app+Postgres+Redis+MinIO); correção de tudo o que aparecer; **merge do branch `feat/portabilidade` para `main`**.
👤 Validar a stack a correr (`docker compose up`) e dar feedback.

**Resultado do Bloco A:** o sistema corre na arquitetura de produção, em containers, com comprovativo criptográfico funcional — ainda com integrações em modo `mock`.

---

## 4. BLOCO B — Frontend de produção

O frontend atual (`app/frontend`) é vanilla JS funcional. Cobre o essencial mas precisa de ser completado para a v1.0.

### Sessão B1 — Decisão de stack + fundações
👤 **Decisão necessária:** manter o frontend em vanilla JS (zero build, máxima portabilidade, já funciona) **ou** migrar para React (alinhado com a arquitetura original, mais fácil de evoluir, exige passo de build). Recomendação: **manter vanilla JS para a v1.0** — funciona, é portável, e a migração para React pode ser v2.0. Decide-se em 5 minutos no início da sessão.
🤖 Adaptação do frontend à API nova: comprovativo, exportação, endpoints reposicionados; cliente de API atualizado.

### Sessão B2 — Cobertura funcional completa
🤖 Todos os blocos A–G editáveis; UI de emissão e visualização de comprovativo; gestão de anexos (upload, download, visibilidade); fluxo de auditoria QA; histórico/timeline; notificações; portal de exportação para a SGGOV.

### Sessão B3 — Acessibilidade WCAG 2.2 AA
🤖 Auditoria com `axe-core` integrada no CI; correção de contraste, foco, ARIA, navegação por teclado, leitor de ecrã; declaração de acessibilidade.
👤 Nada para a implementação. (A *auditoria externa certificada* é uma ação separada — ver secção 9.)

**Resultado do Bloco B:** interface de produção completa e acessível.

---

## 5. BLOCO C — Qualidade e segurança

### Sessão C1 — Testes automatizados
🤖 Testes unitários (validação de marcos, comprovativo, regras de negócio), testes de integração (endpoints com base de dados real em container), cobertura mínima definida; tudo integrado no CI.

### Sessão C2 — Testes e2e + observabilidade + hardening
🤖 Testes end-to-end com Playwright (fluxo M0→M5, bloqueio, comprovativo); endpoint `/metrics` Prometheus + dashboards; revisão de hardening (threat modeling do comprovativo, headers, dependências, SBOM); correções.

**Resultado do Bloco C:** sistema testado, observável, com fundações de segurança sólidas.

---

## 6. BLOCO D — Documentos de conformidade

Documentos que **eu redijo em sessão** e que **você valida e submete** pelos canais próprios.

### Sessão D1 — DPIA + threat model
🤖 Avaliação de Impacto sobre a Proteção de Dados (DPIA) completa — base legal, categorias de dados, fluxos, medidas, riscos residuais; modelo de ameaças formal.
👤 Validar com o Encarregado de Proteção de Dados da SGGOV; **submeter à CNPD** (parecer prévio, exigido antes da apresentação da RCM à reunião preparatória do CM).

### Sessão D2 — Especificação do comprovativo + declaração de acessibilidade
🤖 Caderno de especificação técnica do comprovativo criptográfico para entregar à equipa do SmartLegis (formato exato do JWS, campos, tratamento de erros, chave pública, rotação); declaração de acessibilidade; atualização do runbook.
👤 **Reunião com a equipa do SmartLegis** para fechar a especificação conjunta (a coordenação técnica é feita a montante e fecha-se antes do go-live).

**Resultado do Bloco D:** conformidade jurídica encaminhada e contrato técnico com o SmartLegis fechado.

---

## 7. BLOCO E — Integrações reais

Cada integração só pode ser ligada quando o respetivo acesso estiver desbloqueado. **Estas dependências têm de ser tratadas por si em paralelo, desde já** — são as únicas que podem atrasar o projeto.

### Sessão E1 — Diretório interno (autenticação)
🤖 Ligar o adapter de autenticação ao diretório interno dos serviços (LDAP/AD); testar login real; manter `local` como fallback.
👤 ⛔ **Fornecer:** endpoint do diretório (LDAP/AD), credenciais de serviço (bind DN), estrutura de grupos/papéis, acesso a partir do ambiente de desenvolvimento ou staging.

### Sessão E2 — RTRI (Assembleia da República)
🤖 Ligar o adapter RTRI à API real da AR; sincronização (batch + delta); reconciliação; o modo `mock`/`fallback` mantém-se para degradação graciosa.
👤 ⛔ **Desbloquear:** carta formal à AR (a minuta já existe em `brainstorming/`); protocolo técnico de interoperabilidade; URL e credenciais da API do RTRI. **Se não estiver pronto a tempo, o sistema opera em fallback manual — não é bloqueante para o go-live.**

### Sessão E3 — Consulta.Lex, DRE e SMTP
🤖 Ligar o webhook do Consulta.Lex (importação automática de contributos para o Bloco E); polling do Diário da República; envio real de email via SMTP do Estado.
👤 ⛔ **Fornecer:** acesso/API do Consulta.Lex (gerido pela SGGOV — interno); dados do servidor SMTP do Estado; confirmação do modo de acesso ao DRE.

**Resultado do Bloco E:** integrações reais ligadas, com fallback garantido onde o terceiro não estiver pronto.

---

## 8. BLOCO F — Deployment e go-live

### Sessão F1 — Preparação do deployment
🤖 Scripts de deployment para a RING; manifestos de orquestração se necessário; geração do par de chaves Ed25519 de produção; afinação do runbook; checklist de go-live; configuração de backup automático e alertas.
👤 ⛔ **Fornecer:** acesso aos ambientes da RING (dev/staging/produção); cofre de segredos; reverse proxy interno com TLS.

### Sessão F2 — Acompanhamento do go-live
🤖 Apoio à execução: resolução de problemas de configuração, ajustes finais, verificação cruzada do comprovativo com o SmartLegis.
👤 Executar a instalação na RING seguindo o runbook; **piloto com 2 ministérios**; **formação dos pontos focais**; modo "sombra"; go-live.

**Resultado do Bloco F:** v1.0 operacional na RING.

---

## 9. Consolidação — TODAS as ações do utilizador

### 9.1. Subscrições e plataformas

A boa notícia: a stack é deliberadamente *open-source* e o sistema corre na RING. **Não há subscrições de software comercial a contratar.** O que existe:

| Item | Estado | Custo |
|---|---|---|
| GitHub (organização `dapl-sggov`) | ✅ Já tem | Gratuito (repo público) |
| GitHub Actions (CI/CD) | ✅ Já ativo | Gratuito no plano atual |
| GitHub Container Registry (imagens Docker) | ✅ Disponível | Gratuito |
| GitHub Pages (mock + demo) | ✅ Já ativo | Gratuito |
| PostgreSQL, Redis, MinIO, Node.js | Open-source | Gratuito |
| Ferramentas de teste (Playwright, axe-core) | Open-source | Gratuito |
| Domínio próprio (opcional, ex.: `transparencia.gov.pt`) | Opcional | Via entidade do Estado, se desejado |

**Conclusão:** zero subscrições comerciais novas. O investimento é em **acessos institucionais** e **contratos de serviço pontuais**, não em SaaS.

### 9.2. Acessos institucionais a obter (na RING e sistemas do Estado)

Tratar **desde já, em paralelo** com os blocos A–D — são o que pode atrasar o projeto:

- [ ] **Ambientes na RING** — dev, staging e produção (para os blocos E e F)
- [ ] **Diretório interno dos serviços** — endpoint LDAP/AD, credenciais de serviço, estrutura de grupos (bloco E1)
- [ ] **API do RTRI da Assembleia da República** — depende de carta formal + protocolo técnico (bloco E2)
- [ ] **Acesso ao Consulta.Lex** — API ou mecanismo de exportação (bloco E3) — gerido internamente pela SGGOV
- [ ] **Servidor SMTP do Estado** — host, porta, credenciais (bloco E3)
- [ ] **Acesso ao Diário da República** — confirmação do modo de consulta (bloco E3)
- [ ] **Cofre de segredos na RING** — Vault ou equivalente (bloco F1)
- [ ] **Reverse proxy interno com TLS** na RING (bloco F1)
- [ ] **Ponto de contacto na equipa do SmartLegis** — para fechar a especificação do comprovativo (bloco D2)

### 9.3. Decisões a tomar

- [ ] **Stack do frontend** — vanilla JS (recomendado para v1.0) ou React. Decide-se no início do bloco B1.
- [ ] **Visibilidade do repositório** — manter público (atual) ou tornar privado. Se privado, exige plano GitHub pago para manter Pages e branch protection.
- [ ] **Domínio público** — manter `dapl-sggov.github.io/pegada` ou registar domínio próprio.
- [ ] **Âmbito do piloto** — quais os 2 ministérios.

### 9.4. Contratos de serviço pontuais

Não são subscrições — são contratações específicas, de curta duração:

- [ ] **Pen-test externo** — empresa certificada. Recomenda-se contratar para a fase final, antes do go-live. (Pode ser a mesma empresa que apoia o *security engineering* — ver nota de capacidade.)
- [ ] **Auditoria de acessibilidade externa** — avaliador certificado WCAG 2.2 AA (exigência do DL 83/2018). A implementação que eu faço (bloco B3) prepara o terreno; a auditoria *certificada* é externa.

### 9.5. Validações e processos seus ao longo do caminho

- [ ] Rever e aprovar a documentação técnica (`docs/01`–`08`)
- [ ] Testar a demo interativa e o sistema em cada marco, dar feedback
- [ ] Validar a DPIA com o EPD e **submetê-la à CNPD**
- [ ] Reunir com a equipa do SmartLegis (especificação do comprovativo)
- [ ] Enviar a carta formal à AR (minuta já redigida)
- [ ] Designar e formar os pontos focais
- [ ] Aprovar os segredos de produção
- [ ] Executar a instalação na RING (com o meu apoio em sessão)

---

## 10. Ordem recomendada e paralelismo

```
JÁ — sem esperar por ninguém:
  ████████████  BLOCO A (refactor produção)        A1→A7
              ████████  BLOCO B (frontend)         B1→B3
                      ████  BLOCO C (qualidade)    C1→C2
                      ████  BLOCO D (conformidade) D1→D2

EM PARALELO — você desbloqueia desde já:
  ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  Acessos institucionais (9.2)
  ▒▒▒▒▒▒▒▒          Carta à AR + protocolo RTRI
  ▒▒▒▒              Contacto equipa SmartLegis

QUANDO OS ACESSOS ESTIVEREM PRONTOS:
                          ██████  BLOCO E (integrações)  E1→E3
                                ████  BLOCO F (go-live)  F1→F2
```

**O ponto-chave:** os blocos A–D (≈14 sessões) podem começar imediatamente e não dependem de nada. O bloco E só depende de si destravar os acessos da secção 9.2 — quanto mais cedo o fizer, menos risco. O bloco F é o fecho.

A única dependência verdadeiramente externa e fora do seu controlo direto é a **API do RTRI da AR** — e mesmo essa não é bloqueante, porque o sistema foi desenhado com *fallback* manual de origem.

---

## 11. Resumo executivo

| | |
|---|---|
| **Sessões de desenvolvimento** | ~19, das quais ~14 sem qualquer dependência externa |
| **Subscrições comerciais a contratar** | Nenhuma |
| **Contratos de serviço pontuais** | 2 (pen-test, auditoria de acessibilidade) |
| **Acessos institucionais a desbloquear** | 9 (secção 9.2) — tratar desde já, em paralelo |
| **Decisões suas** | 4 (secção 9.3) — a primeira no início do bloco B |
| **Maior risco** | API do RTRI da AR — mitigado por *fallback* manual desenhado de origem |
| **Podemos começar** | Imediatamente — bloco A, sessão A1 |

O caminho está desenhado para que o trabalho de engenharia avance sem esperar por terceiros, enquanto você desbloqueia os acessos institucionais em paralelo. Nenhuma peça crítica depende de um fornecedor comercial.
