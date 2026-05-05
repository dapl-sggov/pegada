# Análise crítica do mock v0.1 e propostas de redesign

**Data:** Maio 2026
**Âmbito:** revisão UX da demonstração visual destinada à apresentação a decisores políticos

---

## 1. Análise do mock actual (v0.1)

### O que funciona

| Aspecto | Avaliação |
|---|---|
| Cobertura funcional | Boa — todos os blocos A-G + portal público + auditoria + dashboards |
| Comutador de papéis | Excelente — mostra 3 perspectivas distintas (Ponto Focal / SGGOV / Cidadão) |
| Workflow visual M0-M5 | Bom — timeline horizontal lê-se rapidamente |
| Modal de validação M3 | Excelente — checklist de pendências comunica bem o "bloqueio efectivo" |
| Identidade gov | Aceitável — azul + dourado funcionam |

### O que falha

#### 1. Não conta uma história — é uma exibição de écrans
O decisor abre, clica, vê tabelas, fecha. Não percebe **por que** deveria importar nem **o que muda**. Falta uma narrativa que responda em 30 segundos a "o que é, como funciona, porque é diferente do que existe hoje". Para apresentar a um Secretário de Estado sem contexto técnico, isto é fatal.

#### 2. Parece um wireframe, não um produto pensado
Padding generoso, baixa densidade de texto significativo, tipografia pequena (14px base) — comunica "protótipo" em vez de "produto real". Para um regime que custou anos a articular juridicamente, a apresentação visual subvende a ambição.

#### 3. Hierarquia de informação plana
Tudo tem peso visual semelhante: dashboards parecem listas, listas parecem tabelas, tabelas parecem detalhes. Falta a noção de "primeiro vejo isto, depois isto, depois isto". Um decisor não sabe para onde olhar primeiro.

#### 4. Cores institucionais ambíguas
- Azul `#0a3161` é mais próximo do US Federal do que da paleta `gov.pt`
- O dourado é usado pontualmente mas marca presença excessiva no badge demo
- Vermelho da bandeira praticamente ausente
- Não usa o sistema de identidade visual oficial do Estado (que existe na AMA)

#### 5. Cabeçalho institucional genérico
"República Portuguesa · Governo" — formulação que não corresponde à comunicação oficial do gov.pt. Falta o crest/brasão real ou referência clara à SGGOV.

#### 6. Iconografia ausente
Tudo são tags coloridas e texto. Sem ícones, a navegação visual é mais lenta. Os emojis usados (🪪, ⎙) são saída de improviso, não solução de design.

#### 7. Mobile e tablet sub-óptimos
Para apresentar a ministros e SE, o tablet é o dispositivo natural (reuniões). O mock quebra mas não está optimizado.

#### 8. Acessibilidade não é visível como feature
A acessibilidade é exigência legal (DL 83/2018) e diferenciador real. Não é mencionada em lado nenhum do mock.

#### 9. Modais isolados não mostram fluxo
Cada modal é uma vista standalone. O que falta: **mostrar uma jornada completa** (criar FPL → adicionar interação → tentar M3 → ver bloqueio → corrigir → submeter), preferencialmente com narrativa guiada.

#### 10. Estado vazio é desperdiçado
Quando uma view está vazia, é uma oportunidade para educar. O mock actual mostra apenas "sem dados".

---

## 2. Três propostas alternativas

### Proposta A — "Diário institucional moderno"

**Audiência alvo:** decisores políticos sem contexto técnico (ministros, SE, jornalistas).

**Inspiração:** versão digital de jornais de referência (NYT government section, FT.com), relatórios de transparência (Open Government Partnership), publicações sérias do Estado (Banco de Portugal, INE).

**Características:**
- Tipografia serif para títulos (Source Serif / IBM Plex Serif via system stack), sans-serif para UI
- Espaços negativos generosos
- Cores menos saturadas, mais branco e azul-claro institucional
- Hero com **narrativa explícita** em 3 frases: o que muda com a Pegada Legislativa
- Estrutura **scrollytelling**: cada secção responde a uma pergunta ("Como funciona?", "O que vê o ponto focal?", "O que vê o cidadão?")
- Demonstrações **embutidas no scroll** em vez de uma SPA com muitos cliques
- Citações destacadas (RCM, Lei 5-A/2026) em margem
- Footer institucional sério com referências legais e licenciamento

**Vantagens:** funciona em apresentação a ministros sem precisar de explicação adicional; legível em projector; impressionável.

**Desvantagens:** menos útil para utilizador frequente; menos denso.

### Proposta B — "Linear/Stripe operacional"

**Audiência alvo:** equipas técnicas, pontos focais, SGGOV — quem vai usar o sistema todos os dias.

**Inspiração:** Linear, Stripe Dashboard, Notion, Vercel.

**Características:**
- Densidade alta — máxima informação por ecrã
- Cores quase monocromáticas, muito subtis
- Tipografia mono (JetBrains Mono / IBM Plex Mono) para IDs, números de processo, RTRI
- Command palette (Cmd+K) sempre acessível com pesquisa global
- Atalhos de teclado anunciados em todos os botões
- Modo escuro
- Microinteracções precisas (skeleton loaders, optimistic updates)

**Vantagens:** best-in-class para uso diário; sinaliza modernidade; reduz fricção operacional.

**Desvantagens:** intimida o decisor político; parece "demasiado tech" para apresentação institucional.

### Proposta C — "ePortugal/Whitehall contemporâneo"

**Audiência alvo:** alinhamento com a paleta do Estado existente (gov.pt, ePortugal, Portal das Finanças refeito).

**Inspiração:** ePortugal.gov.pt actual, Whitehall/GOV.UK design system, Italia.it (governo italiano).

**Características:**
- Componentes reconhecíveis para quem usa serviços do Estado
- Branca dominante, azul gov suave, pouco contraste
- Tipografia "Inter" ou "Lato" como o gov.pt
- Cumprimento estrito do sistema de identidade visual nacional (se existir formalmente — ainda em discussão na AMA)
- Acessibilidade visivelmente integrada
- Hero com cards "O que muda" / "Para quem" / "Quando entra em vigor"

**Vantagens:** coerência com o resto dos serviços do Estado; reduz curva de aprendizagem; politicamente seguro.

**Desvantagens:** pouco diferenciador; herda limitações do design existente do Estado.

---

## 3. Recomendação

**Implementar Proposta A**, com empréstimos das outras:
- Da B: command palette (Cmd+K), modo escuro, atalhos de teclado anunciados
- Da C: respeito pela identidade visual gov, alta acessibilidade visível

**Justificação:** a audiência primária do mock é decisora política, não operacional. O sistema funcional já existe (`app/`) para uso diário. O mock é uma **ferramenta de comunicação** — tem de impressionar, narrar e justificar o investimento. A Proposta A faz isso melhor.

A versão antiga (operacional) é preservada como `v1-operacional.html` para quem queira ver a perspectiva "produto a usar".

---

## 4. Implementação

A nova versão (`mock/index.html`) terá:

1. **Hero institucional** com brasão, frase-chave e métricas chave
2. **Secção "Porquê"** — contexto legal e político em 3 cards
3. **Secção "Como"** — fluxo M0-M5 com explicação narrativa
4. **Demo viva** — mini-aplicação embutida com 3 modos (Ponto Focal / SGGOV / Cidadão)
5. **Secção "Bloqueio efectivo"** — o "wow" do regime, demonstrado interactivamente
6. **Secção "Transparência por construção"** — portal público com exemplo de FPL real (fictícia mas realista)
7. **Secção "O que vem a seguir"** — roadmap v0.2/v1.0/v2.0
8. **Footer institucional** com referências legais, licença, contacto

Acessibilidade WCAG 2.2 AA total. Mobile-first. Sem dependências externas. Funciona offline.
