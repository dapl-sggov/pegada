# Como contribuir

Obrigado pelo interesse em contribuir para a **FPL Ponte**. Este projeto está sob a alçada da Secretaria-Geral do Governo (SGGOV) e segue as práticas de desenvolvimento aberto adotadas no sector público português.

---

## Antes de começar

1. **Lê o contexto**: começa pelo [README](README.md), depois [docs/01_Analise_Critica.md](docs/01_Analise_Critica.md), [docs/02_Arquitetura.md](docs/02_Arquitetura.md) e [docs/03_Plano_Implementacao.md](docs/03_Plano_Implementacao.md).
2. **Compreende o âmbito**: a FPL Ponte é uma aplicação **transitória**, deliberadamente minimalista, até à integração no SmartLegis. Contribuições devem alinhar-se com este princípio: minimizar acoplamento, manter portabilidade, manter API estável.
3. **Verifica os issues abertos**: alguém pode já estar a tratar do mesmo assunto.

---

## Tipos de contribuição

### Reportar bugs

Abre um issue com:

- Versão (`git rev-parse HEAD` ou tag)
- Passos para reproduzir
- Comportamento esperado vs. observado
- Logs relevantes (sem dados pessoais)
- Ambiente: Node.js versão, sistema operativo

### Propor funcionalidades

Antes de implementar, abre um issue para discutir. Funcionalidades fora do âmbito da v1.0 (ver Anexo B do `docs/03`) precisam de validação prévia da SGGOV.

### Submeter código

1. **Fork** o repositório
2. Cria uma branch a partir de `main`: `feat/X` ou `fix/X` ou `docs/X`
3. Faz as alterações com **commits pequenos e atómicos**
4. Garante que os testes passam (ver §Testes abaixo)
5. Abre Pull Request contra `main` com descrição clara do problema e da solução

---

## Estilo de código

### Backend (Node.js)

- ES Modules (`"type": "module"` em `package.json`)
- 2 espaços de indentação
- Sem ponto-e-vírgula apenas onde for inequívoco — segue o estilo dos ficheiros existentes
- Funções pequenas (preferencialmente <50 linhas)
- Erros com `Object.assign(new Error(msg), { code: 4xx })` para mapeamento HTTP
- Validação server-side **sempre** — nunca confiar no cliente
- Nenhuma dependência nova sem justificação no PR (preferimos pure-JS sobre nativas com bindings)

### Frontend (vanilla JS)

- Sem build step nem framework — manter portabilidade máxima
- Funções globais expostas em `window.X` para handlers `onclick` (padrão atual)
- ARIA labels e `aria-live` em estados dinâmicos
- `:focus-visible` em todos os elementos interativos
- Contraste mínimo 4.5:1 (texto normal) ou 3:1 (texto grande)
- Sem inline scripts (CSP estrito)

### Documentação

- Português europeu (PT-PT)
- Markdown com tabelas + listas para clareza
- Diagramas em ASCII art ou referenciados externamente
- Tom técnico, factual, sem hipérboles

---

## Mensagens de commit

Formato:

```
<tipo>: <resumo curto, modo imperativo>

<corpo opcional explicando o porquê, não o quê>

<rodapé opcional com referências a issues>
```

Tipos: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `security`.

Bons exemplos:
- `feat: adicionar import CSV de contributos da Consulta.Lex`
- `fix: validar M3 não considerar entradas Bloco D arquivadas`
- `security: bloquear conta após 8 tentativas em 30 minutos`

Maus exemplos:
- `wip` / `update` / `fixes`
- `Adicionei coisas`

---

## Testes

A v0.2 não tem ainda testes automatizados (assumida dívida técnica do protótipo). Antes de submeter PR de funcionalidade nova, considera adicionar pelo menos:

- Smoke test do endpoint via `curl` documentado no PR
- Caso de bordo se a alteração toca em validação ou workflow

CI executa automaticamente em cada PR (ver `.github/workflows/ci.yml`):
- `node --check` em todos os `.js`
- Boot do servidor + health check
- Teste end-to-end de criação de FPL + validação de marco bloqueante

---

## Segurança

**Não abras issues públicos para vulnerabilidades.** Em vez disso, envia email para o EPD da SGGOV com:

- Descrição da vulnerabilidade
- Passos para reproduzir
- Impacto potencial
- Sugestão de mitigação (se tiveres)

Resposta em até 5 dias úteis.

---

## Licença das contribuições

Ao submeter código, concordas que a tua contribuição é licenciada sob a **EUPL-1.2** (ver [LICENSE](LICENSE)) e aceitas o "chain of authorship" conforme art. 6.º da licença.

---

## Código de conduta

Este projeto adota o [Contributor Covenant v2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). Resumindo: sê respeitoso, técnico, construtivo. Discordâncias são resolvidas em PRs e issues, não em ataques pessoais.

---

## Questões?

Abre uma *discussion* no GitHub ou contacta a equipa SGGOV responsável pela FPL Ponte.
