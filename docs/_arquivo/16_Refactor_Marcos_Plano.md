# Refactor dos Marcos do Plano — sequência CP → RSE

**Versão:** 1.0 — Maio 2026
**Aplicação:** FPL Ponte (Pegada Legislativa do Governo)
**Autor:** DAPL/DSSD — Secretaria-Geral do Governo
**Decisão:** maio 2026

> **Objetivo.** Documentar de forma definitiva o refactor do desenho de marcos do ciclo de vida da FPL motivado pela alteração regulamentar que coloca a **Consulta Pública (CP) depois da Reunião de Secretários de Estado (RSE)**. O documento serve simultaneamente de memória para futuras auditorias e de guia operacional para o deploy.

---

## 1 · Contexto

Até abril de 2026 o ciclo previa CP antes da RSE: a versão submetida a RSE já incorporava o contributo público. A revisão do procedimento (decisão DAPL/DSSD, maio 2026) inverte essa sequência — a CP passa a correr **após** decisão política em RSE, sobre o texto que efetivamente vai a CM. Consequência: o marco bloqueante que antes se chamava **Pré-RSE** muda de número (era M3, é agora M1), e abre-se espaço para um novo marco não-bloqueante de **Encerramento de CP** (passa a ser M3).

A nomenclatura interna dos marcos no código não acompanhava semanticamente o novo desenho. Este refactor alinha código, schema, comprovativos, frontend, testes e documentação.

---

## 2 · Mudança em uma tabela

| Aspeto | Antes (até abr/2026) | Depois (mai/2026) |
|---|---|---|
| Sequência | M0 → M1 (Início CP) → M2 (Fim CP) → **M3 (Pré-RSE, bloqueante)** → M4 (Pós-RSE, bloqueante) → M5 (Publicação) | M0 → **M1 (Pré-RSE, bloqueante)** → M2 (Início CP) → **M3 (Encerramento CP, não-bloqueante)** → M4 (Pós-RSE, bloqueante) → M5 (Publicação) |
| Bloqueantes | M0, M3, M4, M5 | **M0, M1, M4, M5** |
| Declaração formal | M3 (Pré-RSE), M4 (Pós-RSE) | **M1 (Pré-RSE)**, M4 (Pós-RSE) |
| Validação por | M3: Ponto Focal | **M1: Ponto Focal** |
| Marco "Encerramento CP" | inexistente | M3, não-bloqueante, sem declaração |

---

## 3 · Componentes afetados

### Backend (`app/backend/src/`)
- `workflow.js` — máquina de estados, ordem dos marcos, regras de bloqueio. ✓
- `comprovativo.js` — gera JWS com `marco: "M1"` para Pré-RSE; mantém `M4` para Pós-RSE. ✓
- `notificacoes.js` — templates por marco, destinatários por marco. ✓
- `seed.js` — fixtures de dev/demo atualizadas para nova sequência. ✓
- `fpl.js` — domínio (constantes de marcos, transições). ✓
- `routes.js` — endpoints de validação por marco (`POST /fpl/:id/marco/:n/validar`). ✓
- `migrate.js` — schema atualizado com `m1_validado_por`, `m1_declaracao`; migração de dados copia antigo M3 para novo M1. ✓ **(neste commit)**

### Frontend (`app/frontend/src/`)
- `constants.js` — labels, descrições, ordens. ✓
- `views/detalhe-painel.js` — stepper de marcos. ✓
- `views/lista.js` — coluna de progresso. ✓
- `views/dashboard.js` — KPIs por marco. ✓
- `wizard-bloco-d.js` — gating pelas validações M1/M4. ✓

### Testes
- `dominio.test.js` — testes da máquina de estados. ✓
- `integracao.test.js` — fluxo end-to-end. ✓

### Schema BD
- Nova migração com `m1_validado_por TEXT` e `m1_declaracao TEXT` em `fpl`. ✓ **(neste commit)**

### Documentação
- `docs/12_Especificacao_Comprovativo_SmartLegis.md` — payload `marco` aceita `M1` como Pré-RSE. ✓
- `docs/14_Questionario_Infraestrutura.md`, `docs/14a_Questionario_OnePager.md`, `docs/14b_Apresentacao.html` — descrições alinhadas. ✓
- `docs/15_Conformidade_NIS2.md` — secções de auditoria alinhadas. ✓

---

## 4 · Migração de dados

A migração corre automaticamente em `node src/migrate.js` (idempotente):

1. **ALTER TABLE** adiciona `m1_validado_por` e `m1_declaracao` ao `fpl`. Tolera "duplicate column" / "already exists".
2. **UPDATE de dados**: para cada FPL com `m3_validado_em` preenchido e `m1_validado_em` ainda vazio, copia M3 → M1 (preserva carimbo temporal, autor e declaração). O `WHERE` garante que cada linha é tocada no máximo uma vez.
3. **Os dados M3 antigos NÃO são apagados** — ficam disponíveis para:
   - Auditoria (rastreabilidade da decisão regulamentar).
   - Fallback de rollback (ver §7).
   - Investigação forense em caso de disputa sobre validações pré-refactor.

**Risco residual.** Se uma instalação tinha FPLs onde o antigo M3 foi usado num sentido não-Pré-RSE (improvável dado o desenho anterior, mas teoricamente possível em ambientes de teste com seed manual), a cópia atribui-lhes M1 indevidamente. **Mitigação:** rever as FPLs migradas em ambiente pré-produção antes do deploy; o `evento_auditoria` regista a migração para reversão dirigida se necessário.

---

## 5 · Compatibilidade retroativa

**Comprovativos emitidos antes do refactor.** Permanecem criptograficamente válidos — a assinatura JWS continua verificável com a chave (`kid`) correspondente, sem revogação. Mas o campo `marco: "M3"` desses JWS refere-se semanticamente ao **antigo Pré-RSE**, não ao novo Encerramento CP.

**Decisão para o verificador SmartLegis.** Aceitar `M3` antigo durante uma **janela de transição** (recomendada: até final de 2026), apresentando ao utilizador a etiqueta "Pré-RSE (modelo anterior)". Após a janela, alertar como nomenclatura desatualizada mas manter verificação válida — comprovativos não são revogados retroativamente.

**Recomendação operacional:**
- **FPLs em curso** (não publicadas, M5 ainda não validado): **regenerar comprovativos** para o novo modelo. Implica re-validação manual pelos Pontos Focais — usar a janela transição para sequenciar este trabalho.
- **FPLs já publicadas** (M5 validado): ficam **imutáveis** com nomenclatura antiga registada na BD. O JWS continua verificável; o registo de auditoria preserva integralmente o estado original.

---

## 6 · Testes pós-deploy

Lista de verificação a executar em pré-produção após `node src/migrate.js` e antes de promover a produção:

- [ ] **BD migrada.** Executar `PRAGMA table_info(fpl)` (SQLite) ou `\d fpl` (Postgres) e confirmar presença de `m1_validado_por`, `m1_declaracao`.
- [ ] **Cópia de dados.** Para uma amostra de FPLs com `m3_validado_em` antes do deploy, confirmar que `m1_validado_em` ficou igual após o deploy e que `m3_validado_em` permanece preservado.
- [ ] **Idempotência.** Correr `node src/migrate.js` uma segunda vez — não pode duplicar dados nem falhar.
- [ ] **Fluxo nova FPL.** Criar uma FPL nova e validar M1: o frontend pede declaração, o backend grava `m1_declaracao` e emite comprovativo com `marco: "M1"`. O wizard do bloco D fica desbloqueado.
- [ ] **Vista detalhe.** Stepper apresenta a nova sequência M0 → M1 (Pré-RSE) → M2 (Início CP) → M3 (Encerramento CP) → M4 (Pós-RSE) → M5; M3 aparece como não-bloqueante.
- [ ] **Validações por marco.** As regras de transição em `workflow.js` recusam M2 sem M1 validado; recusam M4 sem M3 (encerramento) registado.
- [ ] **Notificações.** O e-mail de Pré-RSE chega ao Ponto Focal e referencia "M1".
- [ ] **Comprovativo legado.** Verificar um JWS antigo com `marco: "M3"` no SmartLegis e confirmar mensagem de janela de transição.

---

## 7 · Rollback

**Abordagem por defeito: não fazer rollback.** Após o deploy começam a ser emitidos comprovativos válidos no novo modelo (M1 com Pré-RSE, M3 com Encerramento CP). Reverter o esquema invalidaria a semântica desses comprovativos e introduziria inconsistência entre o JWS já emitido e a base de dados.

**Se o rollback for absolutamente necessário** (ex.: descoberta de defeito grave nas primeiras horas pós-deploy, antes de qualquer validação M1 nova):
1. Reverter os deploys de backend e frontend para a versão anterior.
2. **NÃO** é necessário reverter o schema — as colunas `m1_validado_por` e `m1_declaracao` são aditivas e ignoradas pelo código antigo.
3. Os dados copiados em `m1_*` ficam órfãos mas inertes; a fonte de verdade volta a ser `m3_*` (preservados pela migração).
4. Eventuais comprovativos novos emitidos com `marco: "M1"` no curto intervalo entre deploy e rollback devem ser **revogados manualmente** via `comprovativo.estado = 'REVOGADO'`, com motivo "rollback do refactor de marcos".

A preservação deliberada de `m3_validado_em / m3_validado_por / m3_declaracao` é o que torna este rollback viável.
