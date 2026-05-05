# Análise Crítica do Documento de Especificações Técnicas

**Documento analisado:** `Pegada_Legislativa_Aplicacao_Nativa.md` (v0.1, Maio 2026)

**Data da análise:** 2026-05-04

**Autor:** Equipa SGGOV — análise técnica de suporte à decisão

---

## Sumário executivo da análise

O documento é **substancialmente sólido na identificação dos requisitos funcionais e na arquitetura conceptual**, mas contém **lacunas operacionais críticas** que comprometem a viabilidade do prazo de 27 de julho de 2026 e exigem decisão política e técnica imediata. As principais fragilidades são:

1. **Cronograma irrealista** para qualquer das três opções propostas (Build, Buy, Híbrido), assumindo arranque imediato e cobertura completa dos requisitos prioritários;
2. **Subestimação dos riscos de integração** com sistemas externos (RTRI, Consulta.Lex, autenticação.gov.pt) que estão fora do controlo da SGGOV;
3. **Ausência de uma estratégia de degradação graciosa** que permita cumprir a obrigação legal a 27 de julho mesmo com integrações parcialmente operacionais;
4. **Complexidade arquitetural excessiva** para o ano 1, em particular o event sourcing puro e a separação de subsistemas de search/cache antes de existirem dados que justifiquem;
5. **Modelo de governação pós-go-live** insuficientemente especificado, sobretudo na partilha de responsabilidades entre SGGOV, CEGER e GSEPCM.

A recomendação principal é **redefinir o produto a entregar a 27 de julho como uma "FPL Ponte" deliberadamente minimalista**, com integrações simuladas onde necessário, e construir a versão completa em iterações nos 90 dias seguintes.

---

## 1. Pontos fortes do documento

Antes da crítica, vale a pena reconhecer aquilo que o documento faz bem:

- **Articulação clara entre regime jurídico e funcionalidades.** A matriz RF-01 a RF-15 mapeia diretamente as obrigações da RCM e do manual operacional. Não há funcionalidades "para constar".
- **Princípios estruturantes corretos.** "Standalone por design, integrável por construção" é a postura certa: nenhuma das três opções (Build, Buy, Híbrido) faz sentido se o resultado não for migrável.
- **Modelo de dados realista.** O esquema relacional excertado é adequado, com escolhas defensáveis (UUIDs, JSONB para snapshots, índices GIN para pesquisa por título).
- **RBAC bem dimensionado.** A matriz de papéis é granular sem ser barroca, e o escopo por gabinete está corretamente identificado como invariante.
- **Volumetria honestamente calculada.** A estimativa de 520 FPL/ano (Fase 1) e 3000/ano (Fase 2) está alinhada com a evidência do piloto 2022-2024 e justifica a escolha de não usar arquiteturas distribuídas.
- **Stack pragmática.** A recomendação de modular monolith em vez de microsserviços demonstra maturidade técnica e alinhamento com a realidade de equipas pequenas.

---

## 2. Lacunas e fragilidades

### 2.1. Cronograma — irrealismo estrutural

O cronograma apresentado (§11.1) prevê *go-live* em produção a **22 de julho**, com 5 dias de margem para o prazo legal. Esta margem é manifestamente insuficiente quando contabilizamos:

| Fator | Impacto |
|---|---|
| Procedimento de contratação pública (mesmo por urgência) | 3-6 semanas mínimas até equipa em campo |
| Pen-test com correções iteradas | 2-3 ciclos de 1 semana cada |
| Auditoria CNPD (parecer prévio referido em 12.1 da RCM) | 30 dias úteis legais |
| Provisionamento de infraestrutura no CEGER ou cloud nacional | 4-8 semanas históricas |
| Formação dos pontos focais (15-20 ministérios × 2 pessoas) | 2 semanas de logística |
| Federação OIDC com autenticação.gov.pt | 6-12 semanas de processo formal |

Se *qualquer* destes prazos derrapar, o *go-live* fica comprometido. O documento não tem *contingency plan*. Recomenda-se:

1. **Assumir que o sistema a 27 de julho será uma versão Ponte deliberadamente minimalista**, com integrações externas em *modo simulado* ou *fallback manual*;
2. **Separar o produto em dois marcos**: (a) FPL Ponte operacional a 27 julho; (b) FPL completa a 31 outubro;
3. **Manter o cronograma do documento como aspiração**, mas planear a partir do cenário pessimista.

### 2.2. Risco de integrações externas — subestimado

O documento trata RTRI, Consulta.Lex, autenticação.gov.pt e DRE como serviços disponíveis. **Nenhum destes está, à data, garantido** nas condições necessárias:

- **RTRI da AR**: a Lei 5-A/2026 entrou em vigor mas a operacionalização técnica do RTRI é responsabilidade da AR, não do Governo. A API pode não existir, pode não estar documentada, pode não suportar a volumetria, pode não ter contrato de SLA com o Governo. **Sem contrato formal de uso da API, este risco é externo e não controlável.**
- **Consulta.Lex**: o webhook proposto pode não estar implementado. O modelo de dados da plataforma pode não expor os contributos no formato necessário.
- **autenticação.gov.pt**: a federação OIDC com novos clientes do Governo exige processo formal junto da AMA, com prazos não-controláveis.
- **DRE**: a API existe mas o seu *rate limiting* e estabilidade não estão acordados para uso intensivo.

**Recomendação:** o sistema deve ser desenhado para funcionar em **modo degradado** quando qualquer destas integrações falhar, e os pontos focais devem ter sempre uma via manual de inserção (com flag de "validação RTRI pendente", por exemplo). O documento menciona isto en passant na §4.3 mas não o eleva a princípio arquitetural.

### 2.3. Modelo de dados — over-engineering em event sourcing puro

A §2.2 propõe event sourcing como princípio arquitetural ("cada alteração de estado é um evento imutável"). Isto está conceptualmente correto mas tem custo de implementação significativo:

- **Complexidade de query**: reconstruir o estado atual exige replay ou projeções; debug fica mais difícil.
- **Migração de schema**: os eventos antigos têm de ser sempre interpretáveis; isto cria *coupling* entre versões de código.
- **Custo de aprendizagem da equipa**: poucos developers no mercado português têm experiência sólida em event sourcing.
- **Volumetria modesta**: 26000 eventos/ano (Fase 1) não justifica esta complexidade.

**Recomendação:** abandonar event sourcing puro. Manter o modelo já bem desenhado de:
- Tabela `fpl` com estado atual;
- Tabela `versao_fpl` com snapshots JSONB imutáveis após cada edição (já no documento);
- Tabela `evento_auditoria` append-only (já no documento).

Isto dá 95% dos benefícios do event sourcing (auditoria perfeita, capacidade de reconstruir estado histórico) com 20% da complexidade.

### 2.4. Stack — recomendação Java/Spring é defensável mas não única

A §5.2 recomenda Java/Spring Boot 3 com base em "maturidade no Estado português". Esta justificação é parcialmente válida mas não decisiva:

- **Tempo de bootstrap de um projeto Spring Boot novo**: 2-4 semanas até produtividade plena, mesmo com equipa experiente, pelo overhead de configuração (Spring Security, Spring Data, Hibernate, etc.).
- **.NET tem perfil de risco semelhante**, e a SGGOV poderá ter mais facilidade em encontrar fornecedor disponível em qualquer das duas.
- **Para o cronograma agressivo, Python/FastAPI ou Node.js/Express seriam significativamente mais rápidos** ao primeiro deployment, mantendo-se aceitáveis em manutenção (pelo menos para 5 anos).

**Recomendação:** se o critério for *time-to-market* a 27 julho, Python/FastAPI ou Node.js/Express devem estar formalmente em consideração. Se o critério for *long-term maintainability* dentro do CEGER, então Java/Spring ou .NET são as escolhas certas.

A ambiguidade fica por resolver no documento.

### 2.5. Acessibilidade — enunciada mas não orçamentada

A §8.1 enuncia conformidade WCAG 2.2 AA. O custo desta conformidade não é trivial:

- Auditoria de acessibilidade independente: 5-15 k€ (já previstos no §11.3);
- Custo *no desenvolvimento*: sobretudo no design system e nos componentes interativos complexos (validações em tempo real, lookups, modais). Estimar +15-20% no esforço de frontend;
- Conhecimento da equipa: poucos designers e developers têm formação sólida em acessibilidade. **Esta competência tem de estar explicitamente requerida no caderno de encargos**, sob pena de descobrirmos no final que metade do trabalho de UI tem de ser refeito.

### 2.6. Operação — modelo pós-go-live insuficiente

A §9.4 lista três opções (operação interna SGGOV, delegada CEGER/AMA, contratada ao fornecedor) mas não recomenda nenhuma. O custo de cada uma e os SLAs efetivos variam significativamente:

- **Interna SGGOV**: requer recrutar SRE e equipa de suporte; pode custar 150-200 k€/ano em pessoal;
- **Delegada CEGER**: encaixa em estrutura existente mas pode ter SLAs menos competitivos e dificuldade em interlocução técnica direta;
- **Contratada ao fornecedor**: continuidade técnica garantida mas dependência de um contrato em curso.

**Recomendação:** clarificar antes do *go-live* qual a opção, porque as decisões de design (logging, alertas, runbooks) dependem disto.

### 2.7. Migração para SmartLegis — princípio sem mecânica

A §10 enuncia bem os princípios de migração mas não apresenta:

- Modelo de mapeamento de dados entre os schemas da aplicação ponte e do SmartLegis;
- Plano de teste de regressão para garantir que todas as FPL migradas mantêm versões e auditoria;
- Tratamento de URLs públicas (que terão de ser permanentes — *cool URIs don't change*);
- Critérios objetivos para iniciar Fase B (migração progressiva).

Recomenda-se que o caderno de encargos da aplicação ponte exija desde já **um schema de exportação documentado em OpenAPI 3.1**, para que a equipa do SmartLegis tenha contrato técnico claro a que se vincular.

### 2.8. Lacuna: estratégia de adoção dos pontos focais

O documento foca-se na construção técnica. **Subestima o desafio organizacional.** Se a aplicação a 27 julho exigir esforço significativo aos pontos focais sem retorno claro, a adesão será passiva e formal — exatamente o que aconteceu no piloto 2022-2024 (e que o documento da formação reconhece).

Falta uma **secção sobre adoção e mudança organizacional**:
- Como garantir que o ponto focal recebe formação suficiente?
- Que materiais ficam disponíveis (vídeos, FAQ, manual)?
- Que canal de suporte de primeira linha existe?
- Que indicadores comportamentais antecedem os indicadores de resultado?

Sem isto, a aplicação técnica pode ser perfeita e o regime falhar.

---

## 3. Riscos não identificados pelo documento

| Risco | Probabilidade | Impacto | Mitigação |
|---|:---:|:---:|---|
| API RTRI da AR não está pronta a 27 julho | Alta | Crítico | Modo degradado com inserção manual + flag pendente; reconciliação semanal pelo grupo de coordenação |
| Federação OIDC com autenticação.gov.pt atrasa | Média | Alto | Fallback temporário com Active Directory dos serviços ou autenticação local |
| Pareceres CNPD obrigam a alteração de design | Média | Alto | Submeter DPIA cedo (junho), iterar com CNPD em paralelo ao desenvolvimento |
| Procedimento de contratação não conclui a tempo | Alta | Crítico | Considerar construção parcial in-house para o prototype; contratação posterior para hardening e operação |
| Pontos focais não usam o sistema na prática | Alta | Crítico | Comprovativo de submissão como mecanismo bloqueante já no manual operacional; auditoria por amostra desde o primeiro mês |
| Volumetria real superior à estimada | Baixa | Médio | Arquitetura já suporta 10× a volumetria estimada; não ação imediata |
| Vulnerabilidade descoberta pós-go-live | Média | Alto | Bug bounty interno; *security disclosure policy* clara; equipa de resposta acordada |

---

## 4. Recomendações concretas

### 4.1. Reformular o produto a entregar a 27 de julho

Substituir a meta de "aplicação completa a 27 julho" por:

> **FPL Ponte v1.0** — sistema autónomo, deliberadamente minimalista, capaz de cumprir o regime nos seus aspetos bloqueantes (M0, M3, M4), com integrações externas em modo *fallback* e adoção monitorizada à mão pela SGGOV nas primeiras 8 semanas.

A v1.0 cobre apenas P1 (do Anexo B do documento), e mesmo assim com simplificações:
- Lookup RTRI: pesquisa em base local *seeded* manualmente, atualizável em batch;
- Importação Consulta.Lex: manual via upload de CSV, até webhook estar acordado;
- autenticação: por agora username + palavra-passe forte + segundo fator por TOTP, federação OIDC adicionada em iteração;
- Anexos: apenas PDF, com limite de 10MB e antivírus básico;
- Publicação pública: portal estático gerado em *batch* diário, não API real-time.

Esta abordagem **garante cumprimento da obrigação legal** sem dependências externas críticas.

### 4.2. v2.0 a 31 outubro 2026

Iteração que adiciona:
- Federação OIDC plena;
- Webhook Consulta.Lex (se contratado);
- Sincronização bidirecional RTRI;
- API pública completa em JSON-LD;
- Dashboards SGGOV;
- Bloco G (auditoria) automatizado.

### 4.3. v3.0 a 31 março 2027 — pré-migração SmartLegis

Iteração que adiciona:
- Suporte a Regulamentos (Fase 2);
- Federação com SmartLegis (modo coexistência);
- API completa para investigadores;
- Dashboards públicos.

### 4.4. Arquitetura simplificada para a v1.0

- **Modular monolith** (já bem recomendado), em Node.js/Express **ou** Python/FastAPI **ou** Java/Spring (decisão por *time-to-team*, não por dogma);
- **Persistência**: SQLite no protótipo / desenvolvimento, PostgreSQL em produção. **Sem event sourcing**, apenas snapshots em JSONB e log de auditoria append-only;
- **Frontend**: React + design system com base Radix/shadcn (boa escolha do documento), ou alternativa equivalente;
- **Deployment**: container único + base de dados gerida; sem Kubernetes na v1.0 (introduzido na v2.0 se a operação assim o exigir);
- **Observabilidade**: logging estruturado em ficheiro + métricas Prometheus básicas; Grafana adicionado em v2.0.

Esta simplificação **reduz o esforço de v1.0 em 30-40%** e mantém o caminho claro para a complexidade adicional posterior.

### 4.5. Decisão imediata necessária

A SGGOV deve fechar **nos próximos 7 dias** as seguintes decisões para que o cronograma seja credível:

1. **Stack**: Node.js / Python / Java / .NET (ou low-code OutSystems);
2. **Modelo de aquisição**: Build interno / contratação externa / híbrido;
3. **Infraestrutura**: cloud nacional / on-premises CEGER / cloud comercial soberana;
4. **Modelo de operação**: SGGOV / CEGER / fornecedor;
5. **Patrocinador político e budget**: confirmação de envelope financeiro até final de 2026;
6. **Compromisso da AR**: contacto formal sobre a API RTRI e SLA;
7. **Compromisso AMA**: federação OIDC para a aplicação.

---

## 5. Conclusão

O documento de especificações é uma **base técnica adequada para iniciar trabalho**, mas trata o cronograma de 27 de julho como dado adquirido quando, na realidade, ele só é alcançável com uma reformulação significativa do produto a entregar.

A linha de força recomendada é: **construir uma FPL Ponte deliberadamente minimalista mas operacionalmente suficiente, em paralelo com a estabilização das integrações externas e com a comunicação política do regime, e iterar para a aplicação completa nos 90-180 dias seguintes**.

Sem esta reformulação, o risco de incumprimento legal a 27 de julho é alto. Com ela, o risco passa a baixo, e o produto que chega ao SmartLegis daqui a 12-18 meses chega com volumetria real, lições reais e arquitetura testada.

---

*Análise crítica preparada como input para a decisão SGGOV de implementação. Sujeita a revisão à medida que evoluem os pressupostos externos (RTRI, Consulta.Lex, federação OIDC, decisão CNPD).*
