# Modelo de ameaças do comprovativo criptográfico

Documento técnico do Bloco C2 do plano de desenvolvimento. Cobre o
mecanismo de **comprovativo criptográfico** que evidencia, de forma
verificável e não-repudiável, a validação de cada marco bloqueante da FPL
(M0, M3, M4, M5), em cumprimento do Memorando Executivo (Princípio 5) e
da RCM v2 (n.º 4).

## 1. Ativo protegido

Um comprovativo é um **JWS compacto Ed25519** (RFC 8037) cujo payload
inclui, no mínimo:

| Campo | Origem | Observação |
|---|---|---|
| `jti` | servidor | Identificador único `cmp_<marco>-<uuid>` |
| `iss` | config | Emitente — `fpl.gov.pt` em produção |
| `sub` | FPL | Número de processo da FPL (`2026/MAE/0042`) |
| `marco` | parâmetro | `M0` / `M3` / `M4` / `M5` |
| `gabinete_id` | FPL | Sigla normalizada |
| `validador_id` | sessão | UUID do utilizador (não o email) |
| `validador_papel` | sessão | Papel ativo aplicado |
| `snapshot_hash` | servidor | SHA-256 do snapshot canónico da FPL |
| `iat` | servidor | Timestamp de emissão (segundos UNIX) |

A chave privada Ed25519 está em `comprovativo_chave` (BD) ou — em
produção — no caminho indicado por `COMPROVATIVO_PRIVATE_KEY_PATH`,
ferrolho próprio do sistema operativo (`0600`, dono = utilizador do
serviço FPL). A chave pública é distribuída em JWKS no endpoint
`/api/.well-known/fpl-jwks.json` (RFC 7517).

## 2. Atores e fronteiras de confiança

```
[ utilizador SGGOV ] ── HTTPS ──▶ [ frontend ] ── HTTPS ──▶ [ API FPL ]
                                                                │
                                                                ├── BD (chave privada Ed25519)
                                                                └── /metrics (interno)
                                                                
[ scraper interno ] ── HTTP ──▶ [ /metrics ]   ← firewall RING
[ consumidor JWKS ] ── HTTPS ──▶ [ /api/.well-known/fpl-jwks.json ]
```

Fronteira de confiança principal: a **chave privada nunca sai do
processo do servidor**. Verificação é feita com a chave pública.

## 3. Análise STRIDE

| Categoria | Ameaça | Mitigação implementada |
|---|---|---|
| **Spoofing** | Atacante emite um comprovativo falso e tenta colá-lo na FPL | Emissão exige sessão autenticada com papel apropriado (RBAC) e *correr* dentro do processo do servidor. Assinatura Ed25519 prova autoria. |
| **Spoofing** | Atacante forja JWKS num MITM e faz o verificador aceitar uma chave atacante | JWKS servido na mesma origem da API, sobre TLS. `kid` cruza com o registo BD; em produção a chave pública é pinada/distribuída internamente (não confiar exclusivamente em DNS). |
| **Tampering** | Modificação de payload ou cabeçalho | Verificação Ed25519 falha (testes `dominio.test.js` cobrem payload e assinatura adulterados). |
| **Tampering** | Substituição da chave privada na BD por um atacante com acesso à BD | Backup verificado + alarmes em `INSERT/UPDATE` em `comprovativo_chave`; rotação obrigatória em compromisso. Em produção a chave deve ser servida via HSM/KMS (interface `comprovativo.js` está preparada — substitui-se o adapter). |
| **Repudiation** | Validador nega que validou o marco | Comprovativo associa `validador_id` + `validador_papel` + `iat`; versão `versao_fpl` regista quem emitiu; log `evento_fpl` mantido por **10 anos** (config `RETENTION_EVENTOS_ANOS`). |
| **Information disclosure** | Comprovativo contém PII | Payload **não inclui** email nem nome do validador — apenas o UUID; o sujeito é o número de processo, não o conteúdo. |
| **Information disclosure** | Endpoint `/metrics` expõe identificadores | Rotas com IDs são colapsadas em `:id`/`:n` (`sanitizarRota` em `metrics.js`); contadores são agregados; gauge de estados não revela FPLs específicas. |
| **DoS** | Pedidos massivos a `/api/comprovativos/verificar` | Rate-limit global em `/api` (`240 req/min/IP`); verificação Ed25519 é O(1) em CPU; sem amplificação. |
| **DoS** | Pedidos massivos a `/api/.well-known/fpl-jwks.json` (sem auth) | JWKS é estático até rotação — cacheável pelo reverse-proxy (`Cache-Control` próprio); rate-limit ainda aplicável. |
| **Elevation of privilege** | Utilizador chama `validarMarcoFpl` para FPL de outro gabinete | `fplComEscopo` em `routes.js` rejeita com `403`; `requireRole` em endpoints CM/QA/admin. |
| **Elevation of privilege** | CSRF em endpoint de emissão | CSRF double-submit em todos os métodos não-GET; cookie `fpl_csrf` + header `x-csrf-token`. |

## 4. Modelo de chave e rotação

- **Algoritmo:** Ed25519 (RFC 8037). Não permite ataques por substituição
  de algoritmo (`alg: none`) — o verificador valida `alg` contra um
  *allowlist* (`['EdDSA']`).
- **Geração:** `crypto.generateKeyPairSync('ed25519')`.
- **Persistência:** chave privada em registo único na tabela
  `comprovativo_chave` (dev) ou em ficheiro `0600` (prod).
- **`kid`:** SHA-256 truncado da chave pública (URL-safe Base64), incluído
  no header JWS para suportar múltiplas chaves coexistentes (rotação).
- **Rotação:** procedimento atómico — gerar novo par, marcar antiga
  `revogada_em`, manter pública no JWKS por **90 dias** para verificação
  retroativa. Comprovativos antigos continuam válidos enquanto a chave
  pública estiver no JWKS.
- **Compromisso:** procedimento em runbook (`docs/06_Operacao.md`):
  rotação imediata, anotação no evento `COMPROVATIVO_CHAVE_ROTADA`,
  comunicação às partes consumidoras (Portal do Governo, SmartLegis).

## 5. Verificação por terceiros

Qualquer entidade autorizada (Portal do Governo, SmartLegis, AT) pode
verificar offline:

```js
const jwks = await fetch('https://fpl.gov.pt/api/.well-known/fpl-jwks.json').then(r => r.json());
const key = jwks.keys.find(k => k.kid === decodedHeader.kid);
// Verificar a assinatura Ed25519 sobre Base64URL(header) + "." + Base64URL(payload)
```

O endpoint `/api/comprovativos/verificar` está disponível como
conveniência: aceita o JWS compacto e devolve `{ valido, payload, erro }`.

## 6. Limitações conhecidas

1. A chave privada está, em dev, na BD — adequado para o protótipo mas
   **não para produção**. Migração para HSM/KMS é responsabilidade do
   onboarding do ambiente de produção.
2. Não há *timestamping* externo (TSP, RFC 3161). Para evidência
   forense a longo prazo, considerar contratar um serviço de TSA.
3. O comprovativo prova **que o marco foi validado**, não **que o
   conteúdo é correto**. A garantia de correção mantém-se com o
   utilizador validador (cadeia documental e auditoria SGGOV).

## 7. Testes que cobrem este modelo

- `test/dominio.test.js`:
  - emissão JWS Ed25519 + verificação
  - rejeição de assinatura adulterada
  - rejeição de payload adulterado
  - JWKS expõe chave ativa
- `test/integracao.test.js`:
  - emissão integrada com o fluxo M0
  - persistência em `comprovativo`
  - verificação via endpoint `/api/comprovativos/verificar`
  - acesso ao JWKS

## 8. Cabeçalhos e mitigações de transporte

Aplicados em `src/security.js`:

| Cabeçalho | Valor |
|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; …` (sem `unsafe-inline` em scripts) |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cross-Origin-Resource-Policy` | `same-origin` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` (produção) |
| `Cache-Control` (em `/api/*`) | `no-store, no-cache, must-revalidate` |

## 9. Dependências e SBOM

Backend (`app/backend`):

- `npm audit`: **0 vulnerabilidades** à data desta análise.
- SBOM SPDX gerado em `app/backend/sbom-spdx.json` (87 pacotes).
- Apenas 4 dependências diretas obrigatórias: `express`, `cookie-parser`,
  `cors`, `bcryptjs`, `jsonwebtoken`. Drivers `pg`, `ioredis`,
  `@aws-sdk/client-s3` são `optionalDependencies` (apenas em produção).
- Frontend é **vanilla JS sem dependências** — sem cadeia de
  fornecimento adicional.
