# Questionário de pré-instalação — FPL Ponte (Pegada Legislativa)

**Para:** Equipa de gestão da Rede Informática do Governo (RING/DSTD) · Equipa do SmartLegis
**De:** DAPL/DSSD — projeto Pegada Legislativa (Secretaria-Geral do Governo)
**Versão:** 1.0 — Maio 2026
**Resposta pretendida:** [a definir, sugestão de 10 dias úteis]

> Este documento tem duas partes. A primeira (§1–§4) contextualiza a aplicação, o regime legal que ela operacionaliza, e o que o SmartLegis tem de desenvolver para o sistema ficar funcional. A segunda (§5 em diante) é o conjunto de perguntas operacionais para a equipa que gere a infraestrutura onde a aplicação vai correr.
>
> Cada pergunta indica explicitamente **o que depende da resposta** no nosso lado. As respostas vão definir a fase de instalação e o cronograma realista para o go-live (prazo legal: 27 de julho de 2026).

---

## 1 · O que é a Pegada Legislativa, em uma página

A **Lei n.º 5-A/2026** institui a Pegada Legislativa do Governo: para cada diploma elaborado pelo Governo (DL, PL, RCM, DR, despacho normativo) tem de existir uma **Ficha de Pegada Legislativa (FPL)** que documenta, de forma estruturada e auditável:

1. **Quem foi ouvido externamente** durante a elaboração — reuniões, audiências, contributos por escrito (Bloco D).
2. **Quem deu pareceres internos** — DGEG, ERSE, outras autoridades públicas (Bloco C).
3. **Como decorreu a consulta pública** no portal ConsultaLEX (Bloco E).
4. **O que foi incorporado** das contribuições recebidas, com justificação por entrada.
5. **Comprovativos criptográficos** de que o Ponto Focal validou cada marco antes da tramitação avançar.

A Lei n.º 5-A/2026 obriga a documentar interlocutores e contributos no processo legislativo, mas não prescreve o **como** dessa garantia. **Para que a obrigação legal seja cumprida de forma efetiva e não meramente declarativa**, a DAPL/DSSD desenhou um mecanismo técnico de **quatro marcos bloqueantes** (M0/M1/M4/M5) que travam a tramitação do diploma no SmartLegis até a FPL estar devidamente preenchida no momento certo:

| Marco | Designação | Bloqueante? | Quando | O que é exigido |
|---|---|---|---|---|
| **M0** | Abertura | **Sim** | Criação da FPL | Identificação + origem + síntese (≥200 caracteres) |
| **M1** | Pré-RSE | **Sim** | Antes da Reunião de Secretários de Estado | Versão inicial do diploma + Bloco D com interlocutores prévios documentados e decisões preenchidas |
| **M2** | Pós-RSE · Abertura CP | Não | Após RSE, abertura da consulta pública | Versão pós-RSE + referência ConsultaLEX |
| **M3** | Encerramento CP | Não | Após encerramento da CP | Contributos importados + síntese da decisão sobre os contributos |
| **M4** | Pré-CM | **Sim** | Antes do Conselho de Ministros | M1 + M3 (encerramento CP) + auditoria QA sem correções pendentes |
| **M5** | Publicação | **Sim** | Após publicação no DR | M4 + referência DR + URL |

> **Nota importante:** esta arquitetura de marcos bloqueantes é uma **escolha de desenho da DAPL/DSSD**, não uma imposição literal da lei. A lei impõe o preenchimento da FPL; os marcos M0/M1/M4/M5 e o seu acoplamento ao SmartLegis são a forma técnica que encontrámos para tornar essa obrigação efetiva em vez de declarativa. A consulta pública corre **entre a RSE e o Conselho de Ministros** e a opção por travar a tramitação no SmartLegis em M1, M4 e M5 é a forma de garantir que (a) há interlocutores prévios documentados antes da RSE, (b) há contributos da CP tratados antes do CM, e (c) o DR só é publicado com a FPL fechada.
>
> **Porquê a CP depois da RSE:** a Reunião de Secretários de Estado produz a versão do diploma sobre a qual faz sentido ouvir o público. Submeter a CP uma versão pré-RSE expõe a consulta a um texto ainda em transformação política interna; submeter a versão pós-RSE assegura que o público se pronuncia sobre o articulado que o Governo realmente pondera levar a CM.

A consequência operacional é a **vinculação do SmartLegis ao estado da FPL**: sem prova válida de M1/M4, o SmartLegis tem de recusar tramitar a minuta. É este acoplamento que torna o regime efetivo.

## 2 · A aplicação FPL Ponte — visão funcional

A FPL Ponte é uma aplicação web interna, sem face para a internet pública, alojada na RING. Tem três classes de utilizadores:

- **Pontos Focais (PF)** — funcionários dos gabinetes ministeriais que criam, preenchem e validam as FPLs do seu ministério.
- **DAPL/DSSD (SGGOV)** — papéis `QA` (auditoria por amostra, Bloco G) e `Admin` (gestão). Internamente, no LDAP, estes papéis correspondem aos grupos `SGGOV_QA` e `SGGOV_ADMIN`.
- **GSEPCM** — equipa que opera o circuito CM. Consulta as FPLs antes de agendar.

### O que o utilizador vê

- **Dashboard** com KPIs do gabinete e FPL recentes.
- **Lista filtrável e ordenável** de FPL.
- **Vista de detalhe** com 9 cartões (A: identificação · B: origem · C: contributos internos · D: interlocutores externos · E: consulta pública · Comprovativos · F: declaração · Anexos · G: auditoria QA), um stepper M0..M5 e um cronograma calendar.
- **Wizard de 3 passos** para registar uma interação externa do Bloco D (núcleo da pegada).
- **Validação de marco** com checklist do que ainda falta antes de cada validação.

### O que acontece a cada validação de marco bloqueante

1. O Ponto Focal clica "Validar M1".
2. O servidor verifica todas as regras (síntese ≥200 chars, decisões preenchidas, auditoria sem correções, etc.) e devolve **422 com lista de pendências** se alguma falhar.
3. Se passar, o servidor:
   - Calcula um SHA-256 canónico do snapshot da FPL nesse momento.
   - Emite um **JWS Ed25519** com `{ iss, sub, fpl_id, marco, validado_em, validado_por, snapshot_hash, jti, iat, exp }`.
   - Persiste o JWS na tabela `comprovativo` (10 anos de retenção).
   - Atualiza o estado da FPL e cria uma entrada de auditoria imutável.
4. O Ponto Focal pode ver o comprovativo no card "Comprovativos", copiar o JWS e colá-lo no SmartLegis.

A chave **privada** Ed25519 que assina os comprovativos vive no cofre de segredos da RING — nunca na BD, nunca versionada. A chave **pública** correspondente é distribuída ao SmartLegis (1) por canal out-of-band com hash assinado e (2) via endpoint `/.well-known/fpl-jwks.json` para descoberta.

### Arquitetura técnica resumida

- **Backend** Node.js 22 + Express, sem frameworks pesados.
- **Frontend** vanilla JavaScript modular, sem build step, servido pelo Express.
- **Base de dados** PostgreSQL 16.
- **Cache / rate-limit** Redis 7.
- **Object storage** MinIO (S3-compatível) para anexos PDF/DOC/XLS até 20 MB.
- **Comprovativo** Ed25519 nativo do Node `crypto`.
- **Autenticação** contra o diretório interno via LDAP (adapter `diretorio.js` com fallback `local`).
- **CSP estrita** sem CDNs externos — todas as fontes (Fraunces, IBM Plex Sans, IBM Plex Mono) são **self-hosted** em `assets/fonts/`.
- **Tudo dockerizado** — ver `docker-compose.yml` e `docs/06_Operacao.md`.

### Integrações externas (todas com `mock`/`manual` como fallback)

| Sistema | Direção | Estado |
|---|---|---|
| Diretório interno do Governo (LDAP/AD) | FPL → AD | Adapter pronto, falta endpoint LDAP |
| SMTP do Estado | FPL → SMTP | Adapter pronto (outbox), falta host SMTP |
| RTRI da Assembleia da República | FPL ↔ AR | Adapter pronto, falta acordo de uso da API |
| ConsultaLEX | ConsultaLEX → FPL (webhook HMAC) | Adapter pronto, falta coordenar com a DSTD (que gere o ConsultaLEX) |
| Diário da República | FPL → DRE (polling) | Adapter pronto, falta confirmar API com o INCM |
| SmartLegis | FPL → SmartLegis (cópia JWS) | **Especificação fechada (`docs/12`); falta implementação no SmartLegis** |
| Portal do Governo | FPL → Portal | Endpoints prontos, falta confirmar formato com a equipa do portal |

A aplicação **arranca e opera** com todas as integrações em modo `mock`/`manual`. Cada uma ativa-se independentemente, por configuração, sem deploy combinado.

## 3 · O que o SmartLegis tem de desenvolver

Esta secção condensa o que está em `docs/12_Especificacao_Comprovativo_SmartLegis.md` — ler em conjunto. É o ponto-chave para a equipa do SmartLegis: a integração é assíncrona, sem chamadas síncronas à FPL Ponte. Toda a verificação é local com bibliotecas de criptografia standard.

> **Enquadramento:** a verificação criptográfica que pedimos ao SmartLegis para implementar decorre da **arquitetura de marcos bloqueantes desenhada pela DAPL/DSSD** (ver §1), não diretamente do texto da lei. A lei dá o mandato de garantir a Pegada; a arquitetura técnica — com JWS Ed25519 a circular entre a FPL Ponte e o SmartLegis — é a opção de desenho que escolhemos para tornar esse mandato exequível. É por isso que precisamos que o SmartLegis colabore na implementação.

### 3.1 Funcionalidade mínima a desenvolver

**Etapa 1 — verificador offline (~6 semanas de desenvolvimento estimadas).**

1. **Receção do JWS.** Na fase inicial, por cópia/cola do Ponto Focal no SmartLegis (campo de texto na minuta). Mais tarde, via API.
2. **Verificação criptográfica** seguindo o algoritmo em `docs/12 §4`:
   - Decompor o JWS em header, payload, assinatura.
   - Verificar que `alg = EdDSA` (recusar `"none"`, recusar qualquer outro algoritmo).
   - Verificar que `typ = "fpl-comprovativo+jws"`.
   - Selecionar a chave Ed25519 pelo `kid` (chave previamente entregue e registada localmente como chave de confiança — `"pinned"` em terminologia técnica; o JWKS é apenas mecanismo de descoberta).
   - Verificar a assinatura sobre `header.payload`.
   - Verificar `iat` (não no futuro além de 60s de skew), `exp` (não no passado).
   - Verificar `iss = "fpl.gov.pt"` e `marco ∈ {M0, M1, M4, M5}`.
3. **Regra de aceitação por estado da tramitação** (`docs/12 §4.1`):
   - Submissão a RSE: exige **M0 + M1** válidos.
   - Submissão a CM: exige **M0 + M1 + M4** válidos.
   - Publicação no DR: exige **M0 + M1 + M4 + M5** válidos.
4. **Bloqueio** da tramitação se qualquer comprovativo exigido falhar, com a mensagem de erro reportada (formato, alg-recusado, kid-desconhecido, assinatura-invalida, iat-no-futuro, expirado, iss-recusado, marco-recusado).
5. **Logging local** dos resultados de verificação para auditoria.

**Etapa 2 — consulta de revogação (opcional, para mitigar comprometimento de chave).**

- Endpoint `POST /api/comprovativos/verificar` na FPL Ponte que devolve estado atual do `jti` (`VALIDO`/`REVOGADO`/`EXPIRADO`/`DESCONHECIDO`).
- O SmartLegis usa-o durante os 90 dias seguintes a uma rotação de chave por comprometimento.

### 3.2 Bibliotecas recomendadas

Ed25519 é nativo em Node.js (>=18), Java (Nimbus JOSE+JWT 9.x), .NET (`Microsoft.IdentityModel.Tokens` 7.x), Python (`joserfc`). Detalhes em `docs/12 §8`.

**Não usar** implementações que aceitem `alg: none` por defeito ou implementações próprias de Ed25519 sem revisão criptográfica.

### 3.3 Vetores de teste

A FPL Ponte disponibilizará seis vetores em `/api/.well-known/fpl-test-vectors.json` (`docs/12 §7`). A integração só é considerada conforme quando o SmartLegis passa nos **seis vetores** (TV1–TV6). Os dois sistemas testam-no em conjunto em ambiente de homologação antes do go-live.

### 3.4 Plano conjunto

| # | Tarefa | Responsável | Prazo proposto |
|---|---|---|---|
| 1 | Validação do `docs/12` por ambas as equipas | DAPL/DSSD + SmartLegis | T0 |
| 2 | Geração da chave Ed25519 de produção | DAPL/DSSD + DSTD + EPD | T0 + 2 sem |
| 3 | Entrega out-of-band da chave pública ao SmartLegis | DAPL/DSSD → SmartLegis | T0 + 3 sem |
| 4 | Implementação do verificador no SmartLegis | SmartLegis | T0 + 6 sem |
| 5 | Testes conjuntos com TV1–TV6 | DAPL/DSSD + SmartLegis | T0 + 8 sem |
| 6 | Go-live em produção | Ambos | T0 + 10 sem |

## 4 · O que está pronto do nosso lado vs. o que depende de vós

| Componente | Estado |
|---|---|
| Backend completo (workflow, marcos, validações, comprovativos, anexos, auditoria) | **Pronto** |
| Frontend completo (dashboard, lista, detalhe, cronograma, wizard, login) | **Pronto** |
| Self-host de fontes, SVG icons, hash router, anim, sortable, chips | **Pronto** |
| `docker-compose.yml` com Postgres + Redis + MinIO + app | **Pronto** |
| Dockerfile com utilizador não-root | **Pronto** |
| CSP estrita, CSRF, rate-limit, bloqueio de conta, 2FA TOTP | **Pronto** |
| Especificação técnica do comprovativo para o SmartLegis (`docs/12`) | **Pronto** |
| Contratos de integração externa (`docs/13`) | **Pronto** |
| Runbook de operação (`docs/06`) | **Pronto** |
| Threat models (`docs/09`, `docs/11`) | **Pronto** |
| DPIA (`docs/10`) | **Pronto, aguarda validação EPD + CNPD** |
| Imagem Docker publicada em GHCR | **Pronto** (`ghcr.io/dapl-sggov/pegada/fpl-app`) |
| Implementação do verificador no SmartLegis | **Depende do SmartLegis** |
| VM/container host na RING, recursos atribuídos | **Depende da DSTD** |
| Reverse proxy interno + TLS | **Depende da DSTD** |
| LDAP/AD endpoint para diretório | **Depende da DSTD** |
| SMTP relay do Estado | **Depende da DSTD** |
| Cofre de segredos para a chave Ed25519 | **Depende da DSTD** |
| Acordo de uso da API RTRI da AR | **Depende da AR + SGGOV** |
| Coordenação com DSTD (que opera o ConsultaLEX) e acordo com o INCM (DRE) | **Depende da DSTD (ConsultaLEX) e do INCM + SGGOV (DRE)** |
| Conformidade NIS2 da aplicação | **Análise técnica completa em `docs/15_Conformidade_NIS2.md`** · falta integração institucional (ver §15) |

---

# Parte II · Perguntas para a equipa que gere a RING

> Para cada pergunta, indica-se o **impacto** da resposta no nosso lado: o que muda na configuração da aplicação, no cronograma ou nos requisitos.

## 5 · Plataforma e recursos

**5.1.** Onde vai correr a aplicação: VM dedicada, container num cluster partilhado, Kubernetes interno, ou outro modelo?
- *Impacto:* afeta a entrega (imagem Docker tarball vs. push para registry interno) e o modelo de réplicas. O `docker-compose.yml` que entregamos serve para single-host; para Kubernetes preparamos manifests.

**5.2.** Sistema operativo do host disponível? (Versão de Linux, Docker/Podman/containerd, versões.)
- *Impacto:* validação de compatibilidade da nossa imagem (`node:22-alpine`). Se Podman, validamos rootless mode.

**5.3.** Recursos mínimos pré-aprovados para esta aplicação: vCPU, RAM, disco?
- *Estimativa nossa:* 4 vCPU + 8 GB RAM + 100 GB disco cobre vários anos (volumetria estimada: ~520 FPL/ano na Fase 1).

**5.4.** Quantos ambientes vão existir? (dev, staging/homologação, produção). Há separação física ou lógica entre eles?
- *Impacto:* condiciona o número de chaves Ed25519 (uma por ambiente — nunca reutilizar a chave de produção fora de produção) e o número de instâncias dos serviços de dados.

**5.5.** Quem é o responsável pelo ciclo de vida da VM/container host? Janela de manutenção definida?
- *Impacto:* coordenação de atualizações da imagem da app (`docker compose pull && up -d app`).

## 6 · Rede e DNS

**6.1.** Que **VLAN** será atribuída à aplicação? Que outras VLANs (utilizadores, serviços de dados, monitorização) precisam de acesso à VLAN da aplicação?
- *Impacto:* matriz de firewall.

**6.2.** Que **nome DNS interno** será atribuído? Sugestão: `fpl.gov.pt`. A escolha tem de ser fechada **antes da geração da chave Ed25519**, porque o `iss` do JWS é hardcoded no payload e mudar implica nova chave.
- *Impacto:* hardcoded em `app/backend/src/comprovativo.js` e em `docs/12 §2.3`.

**6.3.** **Certificado TLS** para o nome DNS interno: emitido pela CA interna do Governo? Wildcard ou específico? Quem renova e com que cadência?
- *Impacto:* o reverse proxy precisa do certificado; o `node` interno usa HTTP simples (terminação no proxy).

**6.4.** Que **reverse proxy** está em uso na RING para aplicações internas? (Nginx, HAProxy, Traefik, outro.) Há template padrão?
- *Impacto:* fornecemos as nossas regras (`X-Forwarded-For`, body limit 25 MB para anexos, SSE timeout suficiente para o canal de notificações em tempo real, headers de cache nos `/api/*`).

**6.5.** **Firewall egress** — a aplicação precisa de chamadas externas controladas: API do RTRI (`api.ar.parlamento.pt`), API do DRE (`dre.pt`), eventualmente API da ConsultaLEX para validar webhooks. Que política de whitelisting de FQDN existe? Quem aprova adições?
- *Impacto:* sem whitelisting, os modos `http`/`webhook` das integrações ficam em `mock`/`manual` (a app funciona, mas com fallback manual).

**6.6.** **Firewall ingress** — quem pode aceder à aplicação? Pontos focais (todos os ministérios) e equipa DAPL/DSSD (QA e Admin) via VPN, mais o SmartLegis para consulta da chave pública JWKS (`/.well-known/fpl-jwks.json`) e do endpoint de verificação de estado (`/api/comprovativos/verificar`).
- *Impacto:* matriz de origens permitidas; o `Permissions-Policy` e `Cross-Origin-Resource-Policy` da app são `same-origin` por defeito.

## 7 · Acesso de utilizadores

**7.1.** **VPN do Governo** — todos os Pontos Focais (~32 gabinetes ministeriais, podendo expandir) e a equipa DAPL/DSSD vão aceder à app via VPN existente? Há limites de utilizadores simultâneos?
- *Impacto:* dimensionamento; SLA do utilizador final depende da VPN, não só da app.

**7.2.** Há **single sign-on** (SSO) interno em uso na RING? Que protocolo — SAML, OIDC, Kerberos? Disponível para esta aplicação ou só LDAP bind?
- *Impacto:* se houver SSO, evitamos pedir password no nosso login (o adapter `diretorio.js` pode acomodar OIDC com pequeno trabalho extra). Se não, ficamos no LDAP bind com 2FA TOTP.

**7.3.** **2FA institucional** — existe? Smart card, token físico, app autenticadora? Ou usamos a nossa implementação TOTP RFC 6238 nativa?
- *Impacto:* a app já tem TOTP funcional; se houver 2FA institucional, desativamos o nosso.

## 8 · Serviços de dados

**8.1.** **PostgreSQL 16** — disponibilizam serviço gerido pela DSTD, ou corremos como container na nossa stack?
- *Impacto:* serviço gerido = backups, replicação, patching tratados pela DSTD. Container = nós tratamos via `pg_dump` no cron (runbook em `docs/06 §5`). Estimativa de volume: ~5 GB/ano (FPL + auditoria), ~30 GB/ano (anexos).

**8.2.** **Redis 7** — idem. Usamos Redis para rate-limit, cache e (futuro) filas. A app tolera Redis indisponível (cai para in-memory), mas com pior performance em multi-réplica.
- *Impacto:* container vs. serviço gerido.

**8.3.** **Object storage S3-compatível** — para os anexos (PDF/DOC/XLS até 20 MB cada). Existe MinIO institucional, ou outra solução S3-compatível na RING?
- *Impacto:* preferimos serviço institucional para isolar storage da app. Se não houver, MinIO em container com volume separado.

**8.4.** **Política de backup** — RPO/RTO esperados? Janela de retenção? Backup off-site/imutável?
- *Sugestão nossa:* RPO 24h (`pg_dump` diário) ou < 5 min (WAL streaming); RTO < 1h num único nó. Retenção 30 dias rolling + arquivo anual.

**8.5.** **Storage WORM** disponível para arquivamento de longo prazo dos comprovativos JWS (retenção legal de 10 anos)?
- *Impacto:* sem WORM, a integridade dos comprovativos é garantida pela assinatura Ed25519 (a chave pública continua válida 10 anos), mas WORM dá defesa adicional.

## 9 · Cofre de segredos

**9.1.** Que solução de **cofre de segredos** está em uso na RING? HashiCorp Vault, CyberArk, KeePass empresarial, ficheiro `.env` protegido, ou outra?
- *Impacto:* a chave **privada Ed25519** do comprovativo é o segredo crítico do sistema. Idealmente vive num cofre que devolve a chave PEM via API ou monta-a como ficheiro com permissões `0600`. A app lê de `COMPROVATIVO_PRIVATE_KEY_PATH` ou `COMPROVATIVO_PRIVATE_KEY_PEM` (vars de ambiente, ver `config.js`).

**9.2.** A **chave privada Ed25519** pode ser gerada num **HSM** (Hardware Security Module) ou tem de ser gerada em software (`openssl genpkey -algorithm ed25519`)?
- *Impacto:* HSM aumenta significativamente a robustez contra exfiltração e simplifica o procedimento de revogação. Se HSM, precisamos do protocolo de assinatura (PKCS#11, KMIP) — afeta `comprovativo.js`.

**9.3.** Quem tem **acesso ao cofre** em produção? Procedimento de break-glass?
- *Impacto:* a rotação de chave por comprometimento (`docs/06 §7.3`) exige acesso urgente em 24h.

**9.4.** Outros segredos a alojar: `JWT_SECRET` (sessões), `CL_WEBHOOK_KEY` (HMAC do webhook ConsultaLEX), `SMTP_PASS`, `LDAP_BIND_PASSWORD`, `POSTGRES_PASSWORD`, `MINIO_ROOT_PASSWORD`.
- *Impacto:* o cofre tem de aceitar todos.

## 10 · Distribuição de imagens e código

**10.1.** A RING tem acesso ao **GitHub Container Registry** (`ghcr.io`)? Se não, qual é o canal aprovado para introduzir uma imagem Docker (tarball, registry interno, transferência por canal aprovado)?
- *Impacto:* o nosso workflow `release.yml` publica em GHCR; tens de definir o procedimento de promoção do GHCR → registry interno.

**10.2.** Existe um **registry de imagens** interno (Harbor, Nexus, Artifactory)?
- *Impacto:* simplifica updates contínuos (`docker compose pull` aponta para o registry interno).

**10.3.** Que processo de **revisão de imagem** é exigido antes de aceitar um build em produção? Scan de vulnerabilidades, SBOM, assinatura de imagem com cosign?
- *Impacto:* o nosso CI já produz SBOM SPDX e corre `npm audit`. Se exigirem cosign, ativamos no `release.yml`.

**10.4.** Periodicidade aceitável de **atualizações da imagem** em produção? Há janela de mudança fixa (ex.: quarta à noite)?
- *Impacto:* afeta a resposta a CVEs e a cadência de releases. A app suporta `rolling restart` sem perda (basta uma réplica enquanto a outra atualiza).

## 11 · Monitorização e observabilidade

**11.1.** Existe **Prometheus** centralizado na RING para scraping de métricas das aplicações?
- *Impacto:* o nosso `GET /metrics` está pronto (formato Prometheus em texto). Precisamos do IP/range do scraper para o autorizar no firewall.

**11.2.** **AlertManager** ou equivalente — quem configura os alertas e onde chegam (email, SMS, on-call schedule)?
- *Impacto:* fornecemos um conjunto de alertas recomendados (`docs/06 §6.3`): taxa de 5xx > 1%, latência P95 > 1s, `/health` em falha, falha de emissão de comprovativo (crítico).

**11.3.** Existe **agregação centralizada de logs** (ELK, Loki, Splunk)? Em que formato (JSON estruturado, syslog)?
- *Impacto:* a app produz logs JSON estruturados em `NODE_ENV=production`. Configuramos o driver do Docker para o coletor.

**11.4.** Retenção dos logs (operacionais e de auditoria)? Os logs de auditoria de validação de marcos têm de ser conservados quanto tempo?
- *Sugestão nossa:* 10 anos para a tabela `evento_auditoria` (alinhado com a retenção dos comprovativos). Logs operacionais 90 dias.

**11.5.** A app tem **uptime monitoring** com `/health` (200/503). Quem é responsável pelo dashboard de uptime?

## 12 · Integrações com serviços do Estado

**12.1.** **Diretório interno** (E1 em `docs/13`): LDAP/AD do Governo. Confirmam URL (`ldaps://?:636`?), DN base, conta de bind, mapeamento de grupos LDAP → papéis (`PONTO_FOCAL:<gabinete>`, `SGGOV_QA`, `SGGOV_ADMIN`, `GSEPCM`)?
- *Impacto:* sem isto fica em modo `local` (contas pré-povoadas pela seed) — funciona mas não escala.

**12.2.** **SMTP do Estado** (E3b): que host/porta usar (`mail.gov.pt:587` STARTTLS é a expectativa)? Que endereço usar como `From` (sugestão: `pegada-legislativa@sggoverno.gov.pt`)? Há limites de throughput?
- *Impacto:* sem SMTP, todas as notificações ficam no outbox da BD (visíveis na UI Admin) — funciona mas Pontos Focais não recebem email.

**12.3.** **RTRI da Assembleia da República** (E2): existe acordo de uso da API? Se sim, URL base, formato de autenticação (Bearer token ou mTLS), rate-limit?
- *Impacto:* sem RTRI ficamos com cache local de 15 entidades reais (suficiente para piloto) e inserção manual com `rtri_status = NAO_APLICAVEL`.

**12.4.** **ConsultaLEX** (E3a): sendo o ConsultaLEX operado pela própria DSTD (a mesma direção que opera a RING e o SmartLegis, no perímetro da SGGOV), confirmam que podemos configurar o ConsultaLEX para emitir webhooks para o nosso endpoint `POST /api/hooks/consulta-lex` quando uma consulta fecha? Acordamos internamente a `CL_WEBHOOK_KEY` HMAC e o procedimento de rotação?
- *Impacto:* sem webhook, ponto focal importa CSV manualmente — funciona mas exige passo manual por cada consulta. Por ser tudo DSTD, esta integração é puramente uma coordenação interna entre equipas, sem acordo institucional externo.

**12.5.** **DRE / INCM** (E3c): a API de pesquisa do `dre.pt` está documentada e disponível para uso programático? Que rate-limit aceita?
- *Impacto:* sem DRE, ponto focal regista manualmente os campos `referencia_dr` + `data_publicacao` (M5 não fica bloqueado).

## 13 · Coordenação com a equipa do SmartLegis

> Estas perguntas vão à equipa do SmartLegis (também ela gerida pela DSTD, mas como produto distinto). Listadas em secção própria porque o calendário do SmartLegis condiciona o nosso go-live e o interlocutor é diferente do da infraestrutura.

**13.1.** Existe **calendário de desenvolvimento** alinhado com o nosso prazo legal (27 de julho de 2026)? O SmartLegis consegue ter o verificador implementado e testado nessa data?

**13.2.** Em que linguagem corre o SmartLegis hoje (Java? .NET? outra)? Qual a biblioteca preferida para Ed25519 nessa stack?
- *Impacto:* condiciona o exemplo de código que escrevemos no `docs/12 §8`.

**13.3.** Como vai ser **entregue a chave pública** Ed25519 ao SmartLegis? Sugestão: envelope físico assinado pelo Secretário-Geral + hash SHA-256 da chave registado em ofício. Confirmar canal aceitável.

**13.4.** Onde no fluxo do SmartLegis vai existir o **campo de cópia do JWS**? Em que ecrã? Quem cola o JWS — o Ponto Focal do ministério que submete a minuta, ou o secretariado do CM?
- *Impacto:* fluxo de UX; a app gera o JWS e o utilizador copia.

**13.5.** Como deve o SmartLegis **reportar a falha** ao utilizador quando o JWS é inválido ou está em falta? Mensagem específica por tipo de erro (formato, expirado, kid-desconhecido, etc.) ou genérica?

**13.6.** O SmartLegis aceita um endpoint **secundário de consulta de revogação** (`POST /api/comprovativos/verificar` da FPL Ponte) que será usado durante 90 dias após uma rotação de chave por comprometimento? Pode chamar a FPL Ponte em tempo real?
- *Impacto:* matriz de firewall (SmartLegis → FPL Ponte porta 443 interna).

**13.7.** Quem é o **ponto de contacto operacional 24/7** do SmartLegis para incidentes da chave?

## 14 · Conformidade, RGPD, soberania

**14.1.** A DPIA (`docs/10_DPIA.md`) precisa de **parecer da CNPD**. Quem coordena a submissão — equipa DAPL/DSSD ou inclui DSTD? Prazo estimado?

**14.2.** Há requisitos adicionais de **soberania de dados** que afetem a escolha de imagens base (`node:22-alpine` é OK?), bibliotecas (`crypto` nativo Node, sem libs externas para o JWS) ou infraestrutura?

**14.3.** Auditoria externa de **acessibilidade WCAG 2.2 AA** — a nossa expectativa é que seja a DAPL/DSSD a coordenar a contratação com a DSTD (no quadro dos procedimentos já existentes para outras aplicações da SGGOV). Confirmam este modelo? Que fornecedores estão pré-qualificados? Calendário típico?

**14.4.** **Pen-test externo** — exigência regulatória para apps governamentais novas? Mesmo modelo: a DAPL/DSSD coordena a contratação com a DSTD. Confirmam? Cronograma típico de findings + remediação?

## 15 · Conformidade NIS2

A Diretiva (UE) 2022/2555 (NIS2) aplica-se às entidades essenciais e a Administração Pública central encontra-se no perímetro. Esta secção tem duas partes: **A.** o que a aplicação já cumpre por construção (análise técnica concluída) e **B.** o que depende da DSTD e do CISO institucional para fechar a postura de conformidade ao nível institucional.

### Parte A · Análise da aplicação face à NIS2 (concluída)

A DAPL/DSSD analisou os **10 requisitos do art. 21.º da Diretiva (UE) 2022/2555** aplicados à FPL Ponte. O resultado, com matriz de evidências rastreáveis (ficheiro de código + documento) para cada alínea, está em **`docs/15_Conformidade_NIS2.md`**, que é a referência completa. Em síntese: **5 requisitos cumprem totalmente, 3 estão parciais, 1 está a iniciar, 1 é dependente; nenhum requisito está em incumprimento.** Os gaps remanescentes resolvem-se por integração com processos institucionais — não exigem reescrita da aplicação.

Quadro compacto da auto-avaliação (extrato da matriz do `docs/15 §2`):

| Alínea art. 21.º | Requisito | Estado |
|---|---|---|
| a | Análise de riscos e segurança dos SI | Cumpre |
| b | Tratamento de incidentes | Parcial |
| c | Continuidade, backups, gestão de crises | Parcial |
| d | Segurança na cadeia de fornecimento | Cumpre |
| e | Desenvolvimento seguro e tratamento de vulnerabilidades | Cumpre |
| f | Avaliação periódica da eficácia | A iniciar |
| g | Ciber-higiene e formação | Dependente |
| h | Criptografia e encriptação | Cumpre na app · em repouso depende |
| i | RH, controlos de acesso, gestão de ativos | Cumpre na app · CMDB depende |
| j | Autenticação multifator | Cumpre · falta política de obrigatoriedade |

### Parte B · O que depende da DSTD para fechar conformidade institucional

As perguntas seguintes pedem à DSTD (em articulação com o CISO institucional e, se aplicável, com o CNCS) o que falta para **fechar o que a aplicação já tem** — não para confirmar a existência de processos institucionais em abstrato. Cada pergunta cruza com a alínea correspondente do art. 21.º (ou do art. 23.º para notificação).

**15.1.** **Classificação NIS2 da aplicação** *(enquadramento geral)*. A SGGOV está classificada como entidade essencial sob NIS2 e essa classificação herda-se para a FPL Ponte, ou exige ato formal próprio?
- *Impacto:* confirma se todo o regime NIS2 se aplica desde o dia 1 — e fixa o destinatário formal da nossa análise em `docs/15`.

**15.2.** **CISO institucional** *(enquadramento geral)*. Quem é o responsável de segurança da informação que valida a análise de conformidade NIS2 (`docs/15`) e a configuração de segurança desta aplicação antes do go-live? CISO da SGGOV, CISO transversal ao Governo, ou cargo equivalente na DSTD?
- *Impacto:* nome e procedimento de submissão para agendar a validação. Sem assinatura do CISO no `docs/15`, não arrancamos.

**15.3.** **Template institucional de gestão de risco** *(alíneas a, f)*. Os threat models `docs/09` e `docs/11` cobrem a alínea a). Existe template institucional NIS2 para o qual devamos transpor essa análise (formato/secções obrigatórias) e quem aprova o relatório?
- *Impacto:* se houver template, transpomos a análise existente. Se não houver, propomos o `docs/15` como evidência primária.

**15.4.** **Canal e destinatário da notificação de incidentes** *(alínea b · art. 23.º)*. A app já produz logs JSON estruturados, `evento_auditoria` append-only e alertas Prometheus (`docs/15 §4`). Falta fixar o canal de comunicação e o destinatário formal (CNCS via cadeia institucional? CISO?) e o sistema de ticketing a utilizar. Confirmar as janelas NIS2 (24h alerta, 72h notificação, 1 mês relatório final) com o procedimento institucional.
- *Impacto:* completa a secção de incident response do runbook (`docs/06`) com contactos e SLAs. Ver também §15.13.

**15.5.** **SOC / SIEM central** *(alínea b)*. A app produz logs JSON estruturados prontos a ingerir. Existe SOC central (CNCS, DSTD, outro) que receba esses logs? Em que formato (JSON nativo, CEF, LEEF, syslog estruturado) e por que transporte?
- *Impacto:* configuramos o driver de logs do Docker para o destino indicado e mapeamos campos. Sem SOC central, o monitoring fica no Prometheus + AlertManager do §11.

**15.6.** **Alinhamento do plano de continuidade** *(alínea c)*. O RPO/RTO da app está definido (`docs/06 §5`: RPO 24h ou <5 min com WAL, RTO <1h). Há tier institucional de criticidade atribuído pela DSTD que imponha mínimos diferentes (replicação síncrona, site secundário, drills DR obrigatórios)?
- *Impacto:* pode obrigar a infraestrutura adicional ou exercícios periódicos que ainda não estão no cronograma.

**15.7.** **Validação institucional da cadeia de fornecimento** *(alínea d)*. A app cumpre por construção (SBOM SPDX, `npm audit` em CI, fontes self-hosted, dependências mínimas — `docs/15 §3.d`). Existe lista branca/preta institucional de bibliotecas, processo de aprovação de novas dependências, ou scanner SCA institucional pelo qual o SBOM tenha de passar?
- *Impacto:* visibilidade cedo para evitar substituições tardias de dependências.

**15.8.** **Política institucional de autenticação forte** *(alínea j)*. A app já implementa 2FA TOTP RFC 6238 (`src/totp.js`). A proposta interna é 2FA **obrigatório** para `SGGOV_ADMIN`, recomendado para `SGGOV_QA`/`GSEPCM`, opcional para `PONTO_FOCAL`. Existe política institucional que se sobreponha (smart card do CC, FIDO2, outro fator)?
- *Impacto:* FIDO2 ou integração com smart card é ~3-4 semanas de trabalho. Tem de entrar no cronograma se obrigatório.

**15.9.** **Encriptação em repouso dos volumes** *(alínea h)*. A app cifra tudo o que controla (Ed25519, HMAC-SHA256, bcrypt, TLS no proxy — `docs/15 §3.h`). Falta confirmar se os volumes Postgres e MinIO disponibilizados pela RING cifram em repouso por defeito e com que mecanismo de gestão de chaves (TDE nativo, LUKS no host, KMS dedicado).
- *Impacto:* se não houver cifragem por defeito, ativamos TDE/SSE e coordenamos as chaves com o cofre do §9.

**15.10.** **Cadência institucional de auditorias** *(alínea f)*. A app tem métricas em `/metrics` e suite de testes (28 backend + 5 e2e — `docs/15 §3.f`). Falta fixar a cadência de auditoria de segurança formal (proposta: anual + extraordinária por incidente), quem coordena (CNCS, DSTD, externo) e que evidências automáticas devemos expor à equipa auditora.
- *Impacto:* pode exigir exports/relatórios automáticos adicionais no Admin.

**15.11.** **Programa de formação obrigatória** *(alínea g)*. A app tem documentação de utilizador e declaração de acessibilidade. Falta programa formal de ciber-higiene para Pontos Focais, SGGOV QA/Admin e GSEPCM. Quem ministra e com que cadência? Conteúdo mínimo: credenciais, phishing, 2FA, comunicação de incidentes.
- *Impacto:* integra no onboarding dos PF e no calendário de formação institucional.

**15.12.** **Inventário institucional de ativos / CMDB** *(alínea i)*. A app implementa RBAC, escopo por gabinete server-side, bloqueio de conta, auditoria de tentativas (`docs/15 §3.i`). Falta o registo institucional como ativo digital (CMDB) e, idealmente, integração de offboarding via webhook do RH ou diretório para garantir revogação <1h em vez de "no próximo login".
- *Impacto:* CMDB pode ser bloqueante para go-live se for requisito formal; offboarding síncrono é melhoria operacional.

**15.13.** **Procedimento de notificação de incidentes — janelas do art. 23.º** *(complementa 15.4)*. Confirmar formalmente o procedimento end-to-end para as três janelas da NIS2: **24h** (alerta inicial — quem decide que há "incidente significativo" e contacta quem por que via), **72h** (notificação completa — modelo de relatório), **1 mês** (relatório final — quem assina). A DAPL/DSSD tem capacidade técnica de deteção e investigação (`docs/15 §4`); falta o protocolo institucional para acionar as três janelas.
- *Impacto:* requisito para passar drill anual de incidente (ver `docs/15 §6`) e para evitar incumprimento em incidente real.

## 16 · Cronograma e fronteiras de responsabilidade

**16.1.** Confirmação do **prazo legal**: a entrada em vigor é a 27 de julho de 2026? Há margem ou é hard deadline?

**16.2.** Qual é o **caminho crítico** que a equipa DSTD vê do seu lado? (Aprovação de VLAN? Provisionamento de VM? Acesso ao cofre? Validação NIS2? Outro?) Quanto tempo de calendário consome?

**16.3.** Quem fica responsável pela **operação corrente** após o go-live: equipa DSTD 24/7, equipa DAPL/DSSD em horário útil com escalada para a DSTD, ou modelo misto?
- *Posição nossa:* a aplicação não é crítica em horário noturno (regime legislativo opera em horário institucional). Operação DAPL/DSSD em horário útil é suficiente para v1.0.

**16.4.** **Quem aprova o go-live** — direção da DSTD, Secretário-Geral do Governo, CISO institucional (assinatura NIS2), ambos? Que documentação têm de ver assinada?

---

# Parte III · Checklist final antes do go-live

(Cópia do `docs/06 §10`; ajustar a meio caminho conforme as respostas a este questionário.)

### Infraestrutura
- [ ] Imagem `fpl-app` em registry acessível pela RING
- [ ] VLAN atribuída, firewall configurado, DNS apontado, certificado TLS instalado no proxy
- [ ] Postgres, Redis, MinIO (geridos ou container) com backup configurado
- [ ] Cofre de segredos com a chave privada Ed25519 + restantes segredos

### Segurança
- [ ] Par de chaves Ed25519 gerado em ambiente seguro; pública entregue ao SmartLegis out-of-band
- [ ] Vetores de teste TV1–TV6 verificados pelo SmartLegis com sucesso
- [ ] Pen-test externo concluído e findings críticos resolvidos
- [ ] SBOM SPDX arquivado e validado contra eventual lista branca institucional (NIS2 §15.7)
- [ ] Cifragem em repouso confirmada para Postgres e MinIO (NIS2 §15.9)
- [ ] Logs encaminhados para SOC/SIEM institucional, se aplicável (NIS2 §15.5)

### Conformidade
- [ ] DPIA validada pelo EPD e submetida à CNPD
- [ ] Declaração de acessibilidade publicada em `/declaracao-acessibilidade.html`
- [ ] Auditoria externa WCAG 2.2 AA concluída
- [ ] Documento `docs/15_Conformidade_NIS2.md` revisto pelo CISO institucional
- [ ] Classificação NIS2 confirmada e relatório de risco aprovado pelo CISO institucional (§15.1–15.3)
- [ ] Procedimento de notificação de incidentes (24h/72h/1 mês) documentado no runbook (§15.4, §15.13)
- [ ] Aplicação inscrita no inventário institucional de ativos digitais (§15.12)

### Ligação
- [ ] LDAP/AD ligado (`DIRECTORY_DRIVER=ldap`)
- [ ] SMTP ligado (`EMAIL_DRIVER=smtp`)
- [ ] RTRI / ConsultaLEX / DRE ligados ou confirmação de que ficam em modo manual no piloto
- [ ] SmartLegis valida com sucesso um comprovativo de teste emitido pela FPL Ponte em homologação

### Operação
- [ ] Backup automático agendado e restore testado em ambiente isolado
- [ ] Alertas configurados no AlertManager
- [ ] Pontos focais dos 2 ministérios-piloto formados
- [ ] Runbook (`docs/06`) distribuído à equipa de operação
- [ ] Período "sombra" de 5 dias validado antes da entrada em vigor

---

## Anexos a este questionário

- `docs/02_Arquitetura.md` — arquitetura completa do sistema FPL Ponte
- `docs/06_Operacao.md` — runbook operacional (já referenciado no §6 deste documento)
- `docs/09_Threat_Model_Comprovativo.md` — modelo de ameaças do comprovativo
- `docs/10_DPIA.md` — Data Protection Impact Assessment
- `docs/11_Threat_Model_Sistema.md` — modelo de ameaças sistémico
- `docs/12_Especificacao_Comprovativo_SmartLegis.md` — **especificação técnica do contrato com o SmartLegis** (entrega obrigatória)
- `docs/13_Contratos_Integracao_Externa.md` — adapters de LDAP, RTRI, ConsultaLEX, SMTP, DRE
- `docs/15_Conformidade_NIS2.md` — **análise técnica da aplicação face aos 10 requisitos do art. 21.º** com matriz de evidências (entrega obrigatória para revisão pelo CISO institucional)
- `docker-compose.yml` — stack completa de infraestrutura
- `app/backend/src/security.js` — política de segurança HTTP aplicada
- `app/backend/src/comprovativo.js` — implementação de referência da emissão Ed25519

## Contactos do nosso lado

| Função | Contacto |
|---|---|
| Líder técnico FPL Ponte | [a indicar] |
| Encarregado da Proteção de Dados (EPD) SGGOV | [a indicar] |
| Coordenação executiva | [a indicar] |
| Ponto de contacto 24/7 (incidentes da chave) | [a indicar] |

*Documento gerado em maio de 2026 pelo projeto Pegada Legislativa, DAPL/DSSD (Secretaria-Geral do Governo). Para clarificações sobre qualquer ponto, contactar diretamente o líder técnico.*
