# Análise dos documentos de decisão e mapa de adaptação

**Fonte:** documentos de decisão da SGGOV (Memorando Executivo, projeto de RCM
v2, minuta de carta à AR, nota interna de capacidade) — documentação de
trabalho interna, não versionada neste repositório público.

**Data:** Maio 2026

> Este documento regista apenas as **implicações técnicas e arquiteturais** das
> decisões tomadas. Elementos de natureza política, orçamental ou de processo
> decisório interno não são reproduzidos.

---

## 1. O que mudou

Os documentos de decisão consolidam o regime e fixam escolhas que, no trabalho técnico anterior (`docs/01` a `docs/06`), estavam em aberto ou assumidas de outra forma. Seis mudanças têm impacto direto na arquitetura e no código.

### 1.1. Confinamento à RING — a aplicação não é exposta à internet

**Decisão:** a aplicação FPL opera exclusivamente dentro da Rede Informática do Governo (RING), com acesso mediado por VPN. Não há exposição à internet pública.

**Consequências técnicas:**
- **Elimina-se a federação OIDC** com o autenticação.gov.pt. A identidade é mediada em duas camadas: (i) acesso à RING via VPN; (ii) autenticação aplicacional via **diretório interno dos serviços** + TOTP para papéis sensíveis.
- A superfície de ataque externa do sistema principal é reduzida a zero.
- Simplificam-se os requisitos de *hardening*, certificação e operação.
- O **portal público deixa de ser servido pela aplicação**. A app só tem a face interna.

### 1.2. Acoplamento por comprovativo criptográfico — substitui a "submissão bloqueante interna"

**Decisão:** em cada marco bloqueante (**M0, M3, M4, M5**), a aplicação FPL gera um **comprovativo criptográfico assinado**. O ponto focal copia-o para o campo correspondente no SmartLegis, que o **verifica localmente com a chave pública partilhada** e bloqueia a tramitação se a verificação falhar.

**Consequências técnicas:**
- É preciso um **módulo novo de emissão e verificação de comprovativos** (assinatura Ed25519 ou ECDSA P-256, gestão de chaves, JWS compacto).
- A comunicação FPL↔SmartLegis é **máquina-a-máquina por handoff**, não integração síncrona nem coordenação humana periódica.
- O conceito de "submissão bloqueante" que estava implementado **dentro** da app passa a ter um segundo nível: a app continua a impedir a validação de marco sem cumprir as regras (validação interna), **e adicionalmente** emite o comprovativo que torna o cumprimento verificável por um sistema terceiro.
- Marcos bloqueantes passam a ser **quatro** (M0, M3, M4, M5) — M5 (publicação) também emite comprovativo. Antes M5 era apenas conclusivo.

### 1.3. Publicação no Portal do Governo — não num portal próprio nem no Consulta.Lex

**Decisão:** após M5, os dados públicos da FPL são publicados no **Portal do Governo**, ao lado da **Agenda Pública dos membros do Governo** (em criação). Juntos formam o repositório integrado de transparência institucional do Executivo.

**Consequências técnicas:**
- A publicação é feita por **transferência controlada de conteúdos estruturados a partir da RING** — inicialmente manual, automatizada à medida que o volume justificar.
- A app precisa de um **módulo de exportação** que gere os pacotes estruturados (JSON/JSON-LD/CSV) para publicação no Portal do Governo.
- Os endpoints `/api/publico/*` que estavam na app principal são **reposicionados**: a app gera os artefactos; o Portal do Governo serve-os.
- O Consulta.Lex mantém o seu papel próprio de plataforma de consulta pública e alimenta o Bloco E.

### 1.4. Gestão exclusivamente SGGOV — sem contratação externa de desenvolvimento

**Decisão:** desenvolvimento e operação na mesma casa. A integração do CEGER na SGGOV consolidou a capacidade técnica e a competência funcional. A gestão interna do SmartLegis, do Consulta.Lex e do Portal do Governo coloca todos os sistemas envolvidos sob o mesmo teto.

**Consequências:**
- Não há procedimento de contratação de empresa de desenvolvimento — o desenvolvimento interno arranca sem o prazo de um procedimento de contratação pública.
- A equipa que constrói é a equipa que opera — sem custo de transferência, sem *vendor lock-in*.
- **Não há grupo de coordenação permanente SGGOV–GSEPCM.** A coordenação técnica com a equipa do SmartLegis (especificação do comprovativo) é feita a montante, na conceção, e fecha-se antes do go-live.
- O dimensionamento de equipa e a estratégia de cobertura de eventuais défices de capacidade constam da nota interna de capacidade — não reproduzida aqui.

### 1.5. A RCM v2 fixa o quadro normativo

A `RCM_Modelo_v2.docx` traduz tudo isto em norma:
- **n.º 4** — submissão bloqueante **por comprovativo criptográfico** explicitamente (a progressão depende da apresentação do comprovativo; a ausência ou invalidade bloqueia tecnicamente, sem intervenção humana).
- **n.º 6** — gestão integral do regime pela SGGOV; **n.º 6.3** dispensa estruturas de coordenação permanente.
- **n.º 9** — publicação no **Portal do Governo**, articulada com a Agenda Pública.
- **n.º 11** — solução tecnológica desenvolvida e mantida internamente, a operar **exclusivamente no perímetro da RING**, com acesso por VPN e autenticação via diretório interno.
- **n.º 11.4** — migração futura para o SmartLegis sem perda de dados, mantendo continuidade de URLs públicas **no Portal do Governo**.
- **n.º 12** — submissão prévia à CNPD; SGGOV como responsável pelo tratamento.

### 1.6. Calendário

O regime tem entrada em vigor obrigatória a **27 de julho de 2026**, prazo
determinado por lei e sem prorrogação administrativa. A partir desta data
conta-se o cronograma de engenharia de ~11 semanas (ver `docs/03`).

O processo de decisão política, a afetação de recursos, os custos e a
calendarização das decisões internas constam dos documentos de decisão da
SGGOV (Memorando Executivo) — documentação interna que, por ser reservada,
não é reproduzida neste repositório público.

---

## 2. O que se mantém válido do trabalho anterior

Nem tudo muda. Continua válido:

- **A análise crítica (`docs/01`)** das fragilidades do documento de especificações original — o diagnóstico mantém-se.
- **O modelo de dados** — `fpl`, blocos A-G, versões, auditoria, entidades RTRI. A RCM v2 confirma os campos mínimos da FPL (n.º 3.4) e estes correspondem ao que está implementado.
- **A máquina de estados M0-M5** — confirmada pela RCM; apenas se acrescenta a emissão de comprovativo nos marcos bloqueantes.
- **A degradação graciosa para o RTRI** — confirmada como princípio (Princípio 4 do memorando).
- **A stack** — Node.js / Express / PostgreSQL confirmada pela nota de capacidade.
- **A Fase 1 de portabilidade** (`config.js`, `docker-compose.yml`, `Dockerfile`, `release.yml`, `docs/06`) — continua válida; precisa apenas de ajustes (ver §3).
- **O faseamento v1.0 / v2.0 / v3.0** — confirmado pelo memorando, com as mesmas datas (27 jul / 31 out / 31 mar).

---

## 3. Mapa de adaptação — o que é alterado neste trabalho

| Artefacto | Ação | Detalhe |
|---|---|---|
| `docs/02_Arquitetura.md` | **Reescrita parcial** | Confinamento RING; módulo de comprovativo criptográfico; autenticação via diretório interno; remoção do portal público da app; módulo de exportação para o Portal do Governo |
| `docs/03_Plano_Implementacao.md` | **Reescrita parcial** | Novo marco de engenharia para o comprovativo criptográfico; ajuste do marco do portal público (passa a "exportação"); remoção de tarefas OIDC; alinhamento com o calendário do memorando |
| `app/backend/src/config.js` | **Adaptação** | Bloco `comprovativo` (chaves, algoritmo, emissor); `network.confinadoRing`; remoção do bloco OIDC ativo (fica nota); `storage`/`redis` mantêm-se |
| `docs/06_Operacao.md` | **Adaptação** | "RING" explícito em vez de "CEGER genérico"; secção sobre acesso por VPN; secção sobre publicação no Portal do Governo; gestão de chaves do comprovativo |
| `docs/01_Analise_Critica.md` | **Adenda** | Nota de fecho a registar que as decisões em aberto identificadas em §4.5 foram entretanto tomadas pelos documentos de decisão |
| `mock/index.html` | **Adaptação** | Secção do comprovativo criptográfico; narrativa de confinamento RING; "Portal do Governo" em vez de "portal público" próprio |
| `README.md` | **Adaptação** | Enquadramento atualizado; nota sobre comprovativo e RING |
| Código (`app/backend/src/`) | **Fase 2** | Novo módulo `comprovativo.js`; ajuste de `workflow.js` (M5 bloqueante); reposicionamento dos endpoints `/api/publico/*` para módulo de exportação |

A adaptação do **código** (último item) integra-se na Fase 2 já planeada (refactor Postgres/MinIO/Redis), agora com mais um módulo: o comprovativo criptográfico.

---

## 4. Especificação do comprovativo criptográfico (resumo)

Detalhe completo em `docs/02_Arquitetura.md` §6. Em síntese:

- **Quando:** emitido na validação dos marcos M0, M3, M4, M5.
- **Conteúdo (payload):** `fpl_id`, `numero_processo`, `marco`, `validado_em`, `validado_por` (papel, não pessoa), `snapshot_hash` (SHA-256 do estado da FPL no momento), `jti` (identificador único), `iss` (emissor: aplicação FPL), `iat`/`exp`.
- **Assinatura:** Ed25519 (chave privada na FPL; chave pública partilhada com o SmartLegis). Formato JWS compacto.
- **Verificação:** o SmartLegis verifica a assinatura offline com a chave pública. Não há chamada de rede entre os sistemas — *handoff* assíncrono.
- **Revogação:** a FPL mantém um registo dos `jti` emitidos e do seu estado; um endpoint de consulta de estado permite à SGGOV auditar, mas não é necessário para a verificação corrente.
- **Rotação de chaves:** `kid` no header do JWS; o SmartLegis aceita um conjunto de chaves públicas válidas; rotação sem downtime.

---

## 5. Recomendação

O trabalho técnico anterior estava bem encaminhado e a maioria mantém-se. As seis decisões dos documentos de brainstorming **simplificam** a arquitetura mais do que a complicam:

- O confinamento à RING **remove** a complexidade da federação OIDC e do *hardening* de exposição pública.
- O comprovativo criptográfico **substitui** a necessidade de integração síncrona com o SmartLegis por um mecanismo mais robusto e mais simples de operar.
- A gestão exclusivamente SGGOV **remove** o risco de procedimento de contratação e a coordenação interinstitucional permanente.

A única peça genuinamente nova a construir é o **módulo de comprovativo criptográfico** — e essa é uma peça pequena, bem delimitada e de baixo risco técnico.

Procede-se à adaptação dos documentos e da configuração nesta sessão; a adaptação do código integra-se na Fase 2.
