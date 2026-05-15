# Contratos de integração externa (Bloco E)

**Versão:** 1.0 — Maio 2026
**Estado:** adapters implementados em modo `mock`/`local` (a aplicação corre
sem nenhuma destas integrações). Cada integração ativa-se por configuração,
sem refactor, quando o respetivo acesso for desbloqueado.

> **Como ler este documento.** Para cada sistema externo descreve-se:
> (1) qual o seu papel funcional; (2) o que a aplicação espera do seu
> lado; (3) variáveis de ambiente que ativam a ligação; (4) plano de
> degradação graciosa. Os ficheiros `app/backend/src/{diretorio,rtri,
> consultalex,dre,notificacoes}.js` contêm a implementação de referência.

---

## E1 · Diretório interno (LDAP/AD ou broker REST)

### Papel
Autenticar os utilizadores da aplicação contra o diretório institucional.
Substitui as contas locais (modo `local`) por contas reais geridas pelo
CEGER. Permite *single sign-on* à escala do Governo na medida em que o
diretório for o mesmo das outras aplicações.

### Implementação
`app/backend/src/diretorio.js` com três drivers seleccionáveis:

| Driver | Quando usar | Dependência |
|---|---|---|
| `local` | desenvolvimento, fallback de emergência | nenhuma |
| `ldap` | produção SGGOV típica (AD do Governo) | `npm install ldapts` (optionalDependency) |
| `http` | broker REST interno (alternativa) | nenhuma |

### Configuração

```bash
# Para ativar LDAP
DIRECTORY_DRIVER=ldap
LDAP_URL=ldaps://dc.gov.pt:636
LDAP_BASE_DN=OU=Pessoal,DC=gov,DC=pt
LDAP_BIND_DN=CN=fpl-svc,OU=Servicos,DC=gov,DC=pt
LDAP_BIND_PASSWORD=<segredo>

# Mapeamento grupo LDAP → papel:gabinete (separado por ";")
DIRECTORY_ROLE_MAP="CN=fpl-pf-mae,OU=Grupos,DC=gov,DC=pt:PONTO_FOCAL:mae;CN=fpl-pf-ms,OU=Grupos,DC=gov,DC=pt:PONTO_FOCAL:ms;CN=fpl-qa,OU=Grupos,DC=gov,DC=pt:SGGOV_QA;CN=fpl-admin,OU=Grupos,DC=gov,DC=pt:SGGOV_ADMIN;CN=fpl-gsepcm,OU=Grupos,DC=gov,DC=pt:GSEPCM"
```

### Contrato esperado do diretório

- **Atributos lidos por utilizador:** `mail` ou `userPrincipalName`,
  `cn`/`displayName`, `employeeID` ou `serialNumber` (NIF), `memberOf`.
- **Filtro de pesquisa:**
  `(&(objectClass=user)(|(mail={email})(userPrincipalName={email})))`
- **Bind do utilizador:** validação da credencial é feita por **bind**
  com a sua DN+password. Não exigimos privilégios especiais ao
  utilizador (apenas o serviço precisa de poder pesquisar).

### Provisionamento just-in-time
Na primeira autenticação, a aplicação cria o registo local sem password
(`password_hash = 'directory-managed'`). Em logins seguintes, o nome é
sincronizado se mudar no diretório. Os papéis são re-atribuídos a cada
login com `origem = 'DIRETORIO'`, deixando intactos quaisquer papéis
manuais (`origem = 'MANUAL'`).

### Driver `http` (alternativa)
```bash
DIRECTORY_DRIVER=http
DIRECTORY_HTTP_URL=https://broker.ring/auth/diretorio
DIRECTORY_HTTP_AUTH="Bearer <segredo>"   # opcional
```
A aplicação envia `POST { email, password }` e espera
`200 { email, nome, nif, grupos: [...] }` ou `401`.

### Degradação graciosa
Se o diretório estiver indisponível, a aplicação retorna 503 ao login
desse utilizador. A SGGOV pode reverter para `DIRECTORY_DRIVER=local`
em emergência mantendo as contas pré-provisionadas com
`origem = 'MANUAL'`.

---

## E2 · RTRI (Registo de Transparência da Representação de Interesses)

### Papel
Validar automaticamente que as entidades referidas no Bloco D
(interlocutores externos) estão inscritas no RTRI da Assembleia da
República, e manter uma cache local atualizada para o autocomplete da
UI.

### Implementação
`app/backend/src/rtri.js` com dois modos:

| Modo | Comportamento |
|---|---|
| `mock` (padrão) | Pesquisa exclusivamente sobre a cache local (`entidade_rtri`) — utilizado em desenvolvimento e como fallback |
| `http` | Consulta a API real da AR + sincronização batch periódica (worker) |

### Configuração

```bash
RTRI_MODE=http
RTRI_BASE_URL=https://api.ar.parlamento.pt/rtri/v1
RTRI_API_KEY=<token-emitido-pela-AR>
RTRI_SYNC_HORAS=24       # frequência do batch (default: 24h)
```

### Contrato esperado da AR

| Endpoint | Resposta |
|---|---|
| `GET /entidades/:rtriId` | `200 { id, designacao, natureza_juridica, ativo, data_inscricao }` ou `404` |
| `GET /entidades?desde=ISO8601&pagina=N` | `200 { items: [...], proxima_pagina?: N+1 }` |

**Auth:** header `Authorization: Bearer <RTRI_API_KEY>`. Substituível por
mTLS se a AR exigir.

**Mapeamento:** o adapter normaliza `id` ⇄ `rtri_id`, `nome` ⇄ `designacao`
e trata os estados `INATIVO`/`CANCELADO` como `ativo: false`.

### Resiliência
- Timeout de 5 s para consultas singulares, 30 s para batch.
- Retry com backoff em 5xx/429 (até 3 tentativas).
- Falha de uma entidade no batch não interrompe — só é contada como falha.
- Worker periódico em `setInterval`; em produção com múltiplas réplicas
  mover para *leader-elect* via Redis SETNX (interface não muda).

### Degradação graciosa
RCM v2 §10.3: o RTRI **não é bloqueante**. Se a API estiver indisponível,
a aplicação opera com a cache local e o utilizador pode introduzir
manualmente o `rtri_id` — a entidade fica marcada `PENDENTE` para
reconciliação posterior.

### Métricas
- `rtri_sync_total{resultado="ok|falha"}` — contador (incrementado pelo batch)
- `rtri_sync_falhas_total{fase}` — falhas por fase (fetch_pagina, persistencia, ...)

---

## E3a · Consulta.Lex (webhook de fim de consulta pública)

### Papel
Quando uma consulta pública encerra no Consulta.Lex, este envia um
webhook à FPL Ponte com o `cl_ref` e a lista de contributos. A aplicação
importa-os automaticamente para o Bloco E da FPL correspondente,
atualizando os campos de tramitação.

### Implementação
`app/backend/src/consultalex.js` — modos `manual` (apenas import CSV
pela UI) e `webhook` (recebe pedidos POST em `/api/hooks/consulta-lex`).

### Configuração

```bash
CONSULTA_LEX_MODE=webhook
CL_WEBHOOK_KEY=<segredo-de-32-bytes-partilhado-com-CL>

# Apenas para clientes legacy que ainda enviam X-CL-Key:
CL_LEGACY_KEY_HEADER=true
```

### Segurança do webhook (esquema HMAC)

Cada pedido transporta:

| Header | Conteúdo |
|---|---|
| `X-CL-Timestamp` | ISO 8601 do momento de envio (validade ±5 min) |
| `X-CL-Signature` | `sha256=<hex>` do HMAC-SHA256 da string `<timestamp>.<corpo-bruto-utf8>` com `CL_WEBHOOK_KEY` |

**Comparação em tempo constante** (`crypto.timingSafeEqual`) para evitar
timing attacks. **Anti-replay** por janela temporal de 5 minutos. O
`cl_ref` funciona como nonce natural — duas tentativas com o mesmo ref
para a mesma FPL são idempotentes.

#### Exemplo de cliente (Node.js)

```js
const ts = new Date().toISOString();
const body = JSON.stringify({ cl_ref, fpl_numero, periodo, contributos });
const sig = crypto.createHmac('sha256', CL_WEBHOOK_KEY)
  .update(ts + '.', 'utf8').update(body, 'utf8').digest('hex');

await fetch('https://fpl.sggov.gov.pt/api/hooks/consulta-lex', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-cl-timestamp': ts,
    'x-cl-signature': 'sha256=' + sig,
  },
  body,
});
```

### Payload esperado
```json
{
  "cl_ref": "CL-2026-0042",
  "fpl_numero": "2026/MAE/0042",
  "periodo": { "inicio": "2026-03-01", "fim": "2026-04-01" },
  "contributos": [
    { "data": "2026-03-15", "entidade": "X", "tipo_entidade": "ASSOCIACAO", "tema": "...", "sintese": "..." }
  ]
}
```

### Erros possíveis (HTTP 401 com `motivo`)

| `motivo` | Significado |
|---|---|
| `cabecalhos-em-falta` | Sem `X-CL-Timestamp` ou `X-CL-Signature` |
| `timestamp-invalido` | Não é ISO 8601 |
| `timestamp-expirado` | Skew > 5 minutos |
| `corpo-em-falta` | Servidor não capturou o corpo cru (bug interno) |
| `assinatura-formato` | Header não tem prefixo `sha256=` |
| `assinatura-invalida` | HMAC não bate certo |
| `chave-invalida` | (modo legacy) `X-CL-Key` errada |

### Métricas
- `cl_webhook_total{resultado, motivo}` — contador

### Degradação graciosa
Se o webhook não chegar (CL indisponível), o ponto focal pode importar
manualmente um CSV exportado do CL (`POST /api/fpl/:id/consulta-lex/import-csv`).
Formato: `data,entidade,tipo_entidade,tema,sintese`.

---

## E3b · SMTP do Estado

### Papel
Enviar as notificações por email aos pontos focais e à SGGOV (cópia das
notificações in-app). Em desenvolvimento, o sistema usa um *outbox*
(grava na BD sem enviar) para inspeção.

### Implementação
`app/backend/src/notificacoes.js` — modos `outbox` (padrão dev) e `smtp`
(produção). Driver: `nodemailer` (optionalDependency).

### Configuração

```bash
EMAIL_DRIVER=smtp
SMTP_HOST=mail.gov.pt
SMTP_PORT=587
SMTP_SECURE=false              # STARTTLS na porta 587
SMTP_USER=fpl@gov.pt
SMTP_PASS=<segredo>
EMAIL_FROM="FPL Ponte <pegada-legislativa@sggoverno.gov.pt>"
```

### Garantias

- TLS com `rejectUnauthorized: true` — exige CA do Governo no host.
- Verificação inicial de conectividade (`transporter.verify()`) ocorre
  no primeiro envio real (não atrasa o boot).
- Outbox com retentativas: cada email tem `tentativas`, `ultima_tentativa`,
  `erro`. Falhas marcam-no `FALHADO` e podem ser reenviadas pelo
  endpoint admin `POST /api/admin/outbox/processar`.
- Worker periódico (30 s) processa o outbox em pano de fundo.

### Headers para rastreio
Cada email leva:
- `X-FPL-Notificacao-Id` — UUID da entrada `notificacao`
- `X-FPL-Outbox-Id` — UUID da entrada `outbox_email`

Usados para correlacionar o email recebido com o registo na aplicação
(útil em pedidos de suporte).

### Degradação graciosa
Se o SMTP estiver indisponível, as notificações ficam no outbox e são
reprocessadas a cada 30 s. As notificações in-app continuam a funcionar
imediatamente (não dependem do email).

---

## E3c · Diário da República (DRE)

### Papel
Detetar automaticamente quando um diploma aprovado é publicado em DR e
preencher os campos `referencia_dr`, `data_publicacao`, `dre_url` da FPL.
Notifica o ponto focal para validar M5 (que emite o último comprovativo).

### Implementação
`app/backend/src/dre.js` — modos `manual` (preenchimento pela UI) e
`http` (polling periódico ao DRE).

### Configuração

```bash
DRE_MODE=http
DRE_BASE_URL=https://dre.pt
DRE_POLL_HORAS=4               # frequência do polling (default: 4h)
```

### Contrato esperado do DRE
*A confirmar com a equipa do DRE.* O adapter usa um endpoint de
pesquisa genérico:

```
GET https://dre.pt/api/pesquisa?q={numero_processo}&tipo={tipo_diploma}
→ 200 { resultados: [{ numero_dr, sumario, data_publicacao, link, ... }] }
```

Matching: prioritariamente pelo `numero_processo` no campo `sumario`;
secundariamente, similaridade Jaccard (>0.75) entre o `sumario` e o
`titulo` da FPL.

### Endpoints da aplicação
- `POST /api/fpl/:id/dre/registar` — registo manual (qualquer utilizador
  com escopo da FPL). Body: `{ referencia_dr, data_publicacao, url }`.
- `POST /api/admin/dre/polling` — trigger manual de polling (admin
  SGGOV; útil para diagnóstico).

### Métricas
- `dre_publicacoes_detetadas_total{tipo}` — contador
- `dre_polling_falhas_total` — contador

### Degradação graciosa
Se o DRE estiver indisponível, o ponto focal regista manualmente. Não
há bloqueio do workflow — M5 só exige o `referencia_dr` preenchido.

---

## Tabela-resumo de configuração

| Variável | Default | Bloqueante? |
|---|---|---|
| `DIRECTORY_DRIVER` | `local` | Não — `local` continua a funcionar |
| `RTRI_MODE` | `mock` | Não — RCM v2 §10.3 |
| `CONSULTA_LEX_MODE` | `manual` | Não — fallback CSV |
| `EMAIL_DRIVER` | `outbox` (dev) / `smtp` (prod) | Não — outbox acumula |
| `DRE_MODE` | `manual` | Não — registo manual |

A aplicação **arranca e opera** mesmo com todas as integrações em modo
mock/manual. Cada uma é ativada independentemente, sem coordenação
nem deploy combinado, quando o respetivo acesso estiver pronto.

---

## Testes que cobrem este documento

`app/backend/test/adapters.test.js` — 10 testes:

| Teste | Cobertura |
|---|---|
| `diretorio: mapeia grupos LDAP para papéis` | parsing de `DIRECTORY_ROLE_MAP` |
| `diretorio: provisionamento just-in-time` | criação + sincronização idempotente |
| `consulta.lex: webhook aceita HMAC válido` | feliz |
| `consulta.lex: webhook recusa assinatura adulterada` | proteção tampering |
| `consulta.lex: webhook recusa timestamp expirado` | proteção replay |
| `consulta.lex: webhook recusa cabeçalhos em falta` | regressão de schema |
| `rtri: sincronização processa páginas` | feliz com paginação |
| `rtri: retry em 5xx até esgotar tentativas` | resiliência |
| `dre: polling deteta publicação` | feliz com mock |
| `dre: registo manual atualiza FPL e regista evento` | endpoint manual |

LDAP e SMTP não são testados em CI por exigirem servidores externos —
são cobertos em ambiente de homologação contra os serviços reais antes
do go-live.
