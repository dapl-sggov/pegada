# Pedido formal à DSTD — FPL Ponte v2.0

**Para:** Direção de Serviços de Transformação Digital (DSTD), Secretaria-Geral do Governo
**De:** Divisão de Apoio ao Processo Legislativo (DAPL), Secretaria-Geral do Governo
**Versão:** 2.0 · Junho de 2026
**Assunto:** Provisionamento e integrações para o FPL Ponte, ao abrigo da Lei n.º 5-A/2026

---

## Sumário executivo

A DAPL desenvolveu o **FPL Ponte**, uma aplicação web interna que operacionaliza a Pegada Legislativa do Governo durante o período transitório, até a funcionalidade ser incorporada no SmartLegis ou na Plataforma IntGov da UnIT (~2027).

O sistema é deliberadamente leve e temporário:

- 1 processo Node.js, ~1500 linhas de código
- 1 ficheiro SQLite (uns MB ao longo da vida útil)
- Apenas duas dependências runtime (`express`, `cookie-parser`)
- Sem Redis, sem Postgres, sem SMTP outbox, sem workers de polling
- Substituibilidade garantida via JSON canónico (`fpl-ponte/v1`)

Para o sistema arrancar em produção, precisamos da DSTD em três frentes:

1. **Infraestrutura mínima** — uma VM Linux pequena na RING.
2. **Autenticação Microsoft 365 (Entra ID)** — aplicação registada no tenant gov.pt + credenciais OIDC.
3. **Integrações leves** — ConsultaLex (gerida pela DSTD) e acesso à pasta OneDrive da UnIT (INTEGRA).

Nenhuma destas peças exige desenvolvimento substancial do vosso lado — a maioria é provisionamento e fornecimento de credenciais.

---

## 1 · Infraestrutura

### 1.1 Servidor de aplicação

| Item | Especificação mínima | Notas |
|---|---|---|
| Tipo | VM Linux (Ubuntu 24.04 LTS ou RHEL 9) | Acesso por SSH com chave |
| CPU / RAM | 2 vCPU / 4 GB RAM | Suficiente para ~100 FPLs/ano |
| Disco | 20 GB SSD | SQLite + anexos + logs |
| Rede | Apenas intranet (RING) | Sem exposição internet pública |
| Software | Node.js 22 LTS | Instalável via `nvm` ou `dnf module` |
| Reverse-proxy | Nginx ou Apache em front, TLS terminação | Subdomínio sob `gov.pt` |

**O que precisamos por escrito:**

- [ ] Endereço IP interno + hostname provisionado
- [ ] Subdomínio sugerido (proposta: `fpl.gov.pt` ou `pegada.sggoverno.gov.pt`)
- [ ] Certificado TLS válido para esse hostname (CA do Governo)
- [ ] Credenciais SSH de operação (chave pública nossa + utilizador dedicado `fpl-ponte`)
- [ ] Política de backup da VM (snapshot diário?)
- [ ] Janela de manutenção contratada

**Prazo sugerido:** 15 dias úteis após acordo.

### 1.2 Pasta SharePoint para backup do JSON canónico

O sistema faz backup diário automático do estado de todas as FPLs em formato JSON canónico. Em vez de Graph API, preferimos escrever ficheiros numa pasta sincronizada por OneDrive na VM.

- [ ] Provisionamento de uma site SharePoint dedicada: "FPL Ponte · Backup operacional"
- [ ] Pasta `backup/` com permissões de escrita para a conta de serviço da VM
- [ ] Permissões de leitura para a equipa DAPL (auditoria e envio para Portal do Governo)
- [ ] Instalação do cliente OneDrive (sync) na VM, em modo headless
- [ ] Conta de serviço Entra ID dedicada (`svc-fpl-ponte@sggoverno.gov.pt` ou similar)

Alternativa: pasta partilhada SMB/CIFS montada na VM. Indiferente para nós.

---

## 2 · Autenticação (Entra ID / Microsoft 365)

O FPL Ponte autentica via OIDC contra o tenant Entra ID do Governo. Sem passwords nossas. Sem TOTP. A camada de identidade é a vossa.

### 2.1 Registo da aplicação

- [ ] Registar a aplicação no Entra ID do tenant `gov.pt` com:
  - **Nome:** `FPL Ponte`
  - **Tipo:** Web application (server-side OIDC, não SPA)
  - **Redirect URI:** `https://fpl.gov.pt/api/auth/entra/callback` (ajustar consoante hostname final)
  - **Permissions delegadas:** `openid`, `profile`, `email`, `User.Read`
  - **Sign-in audience:** *Accounts in this organizational directory only*
- [ ] Credenciais a entregar à DAPL (via canal seguro):
  - `ENTRA_TENANT_ID`
  - `ENTRA_CLIENT_ID`
  - `ENTRA_CLIENT_SECRET` (preferencialmente certificate-based)

### 2.2 Modelo de papéis

Atribuição automática pelo FPL Ponte:

- **Pelo domínio do email:** `nome.apelido@<sigla>.gov.pt` → `PONTO_FOCAL` do gabinete `<sigla>` (alinhado com a tabela XXV Governo).
- **Por lista explícita** (configurável): emails específicos da SGGOV recebem `SGGOV_ADMIN` ou `SGGOV_QA`.

**Pedido informativo:**

- [ ] Confirmar que todos os colaboradores dos gabinetes ministeriais e SGGOV têm conta Entra no tenant gov.pt com o email no formato oficial.
- [ ] Lista de emails que devem ter papel `SGGOV_ADMIN` (sugerimos 2 pessoas).

**Prazo sugerido:** registo + credenciais em 10 dias úteis.

---

## 3 · ConsultaLex

A DSTD também é responsável pelo ConsultaLex. Esclarecemos a opção tomada:

### 3.1 Decisão: NÃO há integração técnica nossa com o ConsultaLex

| Opção | Esforço | Risco | Decisão |
|---|---|---|---|
| Webhook ConsultaLex → FPL | Médio | Schema acoplado | **Rejeitado** |
| Upload CSV manual dos contributos | Baixo | Duplicação | **Rejeitado** |
| Apenas link + síntese redigida pelo ponto focal | Mínimo | Nenhum | **Adotado** |

A ficha pública da FPL apresentará:

- O link direto para a consulta no ConsultaLex
- O n.º de contributos recebidos
- A síntese e a decisão sobre incorporação

Quem quiser ler os contributos brutos clica no link e vai ao ConsultaLex.

### 3.2 O que precisamos da DSTD sobre o ConsultaLex

- [ ] **Padrão de URL.** Confirmar a estrutura canónica do link (ex.: `https://consulta.lex.pt/processos/<id-processo>`)
- [ ] **Vida útil do link.** Os links permanecem acessíveis publicamente após o encerramento da CP?
- [ ] **Catálogo de consultas ativas.** Página ou feed estruturado para o ponto focal pesquisar?

### 3.3 Roadmap conjunto (informativo)

Antecipamos que na Plataforma IntGov / SmartLegis será desejável uma integração mais estreita ConsultaLex ↔ Pegada. Esse trabalho é para 2027 — agora, o link basta.

---

## 4 · INTEGRA (UnIT) — acesso à pasta OneDrive na RING

O INTEGRA é o sistema da Unidade de Integridade e Transparência (UnIT) da SG-Governo. A tab "Pegada legislativa" do INTEGRA é preenchida pelo gabinete quando o ato legislativo já está em pipeline; cada entrada inclui o **número de diploma SmartLegis**, o que permite ao FPL Ponte associá-la à FPL correta no Bloco D.3.

### 4.1 Cenário operacional já acordado entre DAPL e UnIT

- O INTEGRA exporta o conteúdo da tab "Pegada legislativa" em JSON.
- Os ficheiros JSON ficam numa **pasta OneDrive da UnIT, sincronizada na RING**.
- O FPL Ponte lê periodicamente essa pasta, filtra pelas entradas com o número de diploma SmartLegis, e popula o Bloco D.3 da FPL correspondente.
- O schema do JSON e a confirmação do campo "número de diploma SmartLegis" por entrada serão combinados diretamente entre DAPL e UnIT — não é matéria DSTD.

### 4.2 O que precisamos da DSTD

Permitir e configurar o acesso técnico da VM do FPL Ponte à pasta OneDrive da UnIT, em modo leitura:

- [ ] **Conta de serviço** (`svc-fpl-ponte@sggoverno.gov.pt` ou equivalente) com **permissão de leitura** na site SharePoint/OneDrive da UnIT onde os JSONs do INTEGRA ficam disponíveis.
- [ ] **Método operacional** preferido pela DSTD para expor a pasta à VM:
  - (a) cliente OneDrive em modo headless montado na VM com a conta de serviço, ou
  - (b) partilha SMB/CIFS sobre a mesma pasta.
  Para nós é indiferente.
- [ ] **Caminho exato da pasta** (URL SharePoint ou caminho de rede), uma vez provisionado.
- [ ] **Cadência de sincronização** — assumimos near-real-time via cliente OneDrive; confirmação ou alternativa.

Não pedimos que a DSTD desenvolva conectores, ETL, ou que toque no INTEGRA. A integração do nosso lado é uma leitura de ficheiros JSON num filesystem partilhado.

---

## 5 · Riscos do nosso lado e mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| Entra ID atrasa | Sem login institucional | Driver `mock` continua a permitir acessos demo na intranet; pilotamos com 2-3 gabinetes |
| ConsultaLex muda URLs | Links na ficha pública partidos | Detectamos via monitorização manual; os antigos sobrevivem nos JSONs de backup |
| Pasta OneDrive UnIT inacessível à VM | Bloco D.3 fica vazio | A ficha pública mantém-se válida com D.1 + D.2 + E; D.3 é informativo. Acompanhamento via DAPL ↔ UnIT em paralelo |
| VM cai | Indisponibilidade | Snapshot diário + restore em ~1 hora |
| SQLite corrompe | Perda parcial de dados | Backup diário do JSON canónico permite restore via `POST /api/import/canonico` |

---

## 6 · Calendário sugerido

| Semana | Marco | Responsável |
|---|---|---|
| Sem. 1 | Reunião DSTD + DAPL (kick-off) | DSTD + DAPL |
| Sem. 2 | Provisão VM + subdomínio + TLS | DSTD |
| Sem. 2 | Registo Entra ID + credenciais | DSTD |
| Sem. 3 | Provisão pasta SharePoint (backup FPL) | DSTD |
| Sem. 3 | Acesso da VM à pasta OneDrive da UnIT | DSTD |
| Sem. 4 | Instalação FPL Ponte na VM | DAPL |
| Sem. 4 | Smoke test integrado | DAPL + DSTD |
| Sem. 5 | Piloto com 3 gabinetes (MAEN, MS, MJ) | DAPL |
| Sem. 6 | Roll-out total | DAPL |
| **27 jul** | **Data legal de entrada em vigor da Lei 5-A/2026** | — |

---

## 7 · Pontos de decisão para a reunião

Pontos a discutir e fechar com a DSTD:

1. **Hosting:** VM dedicada na DSTD ou Azure Gov App Service? (Recomendamos VM.)
2. **Subdomínio final:** `fpl.gov.pt`, `pegada.sggoverno.gov.pt`, ou outro?
3. **Conta de serviço Entra:** existe um padrão DSTD para contas de serviço (`svc-…`)?
4. **Acesso da VM à pasta OneDrive da UnIT:** método operacional preferido (cliente OneDrive na VM, ou partilha SMB/CIFS sobre a mesma pasta)?
5. **Permissões para o ConsultaLex:** queremos referenciar consultas em ficha pública mesmo após encerramento. Confirmado?
6. **Saída do sistema:** quando o SmartLegis ou IntGov receberem a funcionalidade, fica acordado que entregamos um único JSON canónico e arquivamos a VM.

---

## Anexo A · Quem precisa de aceder ao quê

| Quem | O quê | Como |
|---|---|---|
| Pontos focais dos gabinetes | App FPL Ponte (criar/editar FPLs do seu gabinete) | Entra ID, domínio do email determina papel |
| GSEPCM | App FPL Ponte (ver tudo, aprovar CM, registar DR) | Entra ID, papel atribuído por lista |
| SGGOV/DAPL | App FPL Ponte (admin, auditoria, export) | Entra ID, papel atribuído por lista |
| Cidadão | Ficha pública de FPLs publicadas | Servida estaticamente pelo portal do Governo |
| Auditoria interna | Pasta SharePoint com backup JSON | Permissão SharePoint |

## Anexo B · Inventário técnico (referência)

- Código-fonte: `app/backend/` + `app/frontend/` (repositório DAPL)
- Schema BD: `app/backend/src/migrate.js` (12 tabelas SQLite)
- JSON canónico: `app/backend/src/canonico.js` (versão `fpl-ponte/v1`)
- Documentação operacional: `docs/06_Operacao.md`
- Arquitetura: `docs/02_Arquitetura.md`

Versão atual do FPL Ponte: **v2.0.0-simplificado** · 1 de junho de 2026.

---

*Documento preparado pela DAPL/SGGOV para a reunião com a DSTD.*
*Contacto principal: Bernardo Vidal · bernardomvidal@gmail.com*
