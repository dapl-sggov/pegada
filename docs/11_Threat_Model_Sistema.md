# Modelo de ameaças do sistema FPL Ponte

**Versão:** 1.0 — Maio 2026
**Âmbito:** sistema completo (backend Express + frontend vanilla JS +
PostgreSQL + Redis + MinIO) na RING.
**Complementa:** `docs/09_Threat_Model_Comprovativo.md` (foco específico
no JWS Ed25519) e `docs/10_DPIA.md` (foco no titular de dados).

> **Metodologia.** STRIDE por elemento da arquitetura, com classificação
> qualitativa de risco (P × G) e mitigações alinhadas com a implementação
> efetiva no código. Para cada mitigação aponta-se o módulo/teste que a
> implementa, para que a regressão seja detetável.

---

## 1. Diagrama de fluxo de dados (DFD nível 1)

```
                    ┌──────────────────────────────────────┐
                    │       Diretório interno (LDAP/AD)    │
                    └──────────────┬───────────────────────┘
                                   │ (consulta)
   ┌──────────┐  HTTPS    ┌────────▼──────────┐  bcrypt   ┌──────────────┐
   │ Browser  │ <──RING──>│  Backend Express  │ <───────> │ Tabela       │
   │ (PF/QA)  │           │  routes.js        │           │ utilizador   │
   └──────────┘           │  auth.js          │           └──────────────┘
                          │  fpl.js           │
                          │  comprovativo.js  │  SQL      ┌──────────────┐
                          │                   │ <───────> │ Postgres FPL │
                          │  security.js      │           └──────────────┘
                          │  rate-limit       │  Redis    ┌──────────────┐
                          │  CSRF             │ <───────> │ Cache/sessões│
                          │                   │           └──────────────┘
                          │  anexos.js        │  S3       ┌──────────────┐
                          │                   │ <───────> │ MinIO        │
                          │  metrics.js       │           └──────────────┘
                          └──┬────────────────┘
                             │
                ┌────────────┴─────────────┬──────────────────┐
                │ /metrics                 │ /api/jwks.json   │ /api/comprovativos/verificar
                ▼                          ▼                  ▼
       ┌────────────────┐         ┌────────────────┐    ┌──────────────┐
       │ Prometheus     │         │ SmartLegis     │    │ Terceiros    │
       │ (RING interno) │         │ (verificador)  │    │ (AT, AMA)    │
       └────────────────┘         └────────────────┘    └──────────────┘
```

**Trust boundaries:**
- **TB1** Browser ↔ Backend (HTTPS + autenticação + CSRF + rate-limit)
- **TB2** Backend ↔ BD/cache/MinIO (rede interna; TLS mútuo em produção)
- **TB3** Backend ↔ Diretório interno (consulta read-only)
- **TB4** Backend ↔ Verificadores externos (apenas o JWS e a chave pública)

---

## 2. Análise STRIDE por elemento

### 2.1 Autenticação e gestão de sessões

| Ameaça | STRIDE | P × G | Mitigação | Onde |
|---|---|---|---|---|
| Brute-force de password | S | 3×3 | Rate-limit IP+email; bloqueio após 8 falhas/30 min; bcrypt rounds=12 | `security.js: rateLimitLogin`, `auth.js` |
| Roubo de sessão por XSS | I | 2×3 | Cookie `HttpOnly` + `SameSite=Lax`; CSP rígida sem `unsafe-inline` em scripts; sanitização (`esc()`) | `auth.js: setSessionCookie`, `security.js: securityHeaders` |
| Roubo de sessão por CSRF | E | 3×3 | Double-submit cookie (`fpl_csrf`) + header `x-csrf-token` | `security.js: ensureCsrfToken`, `requireCsrf` |
| Bypass de 2FA TOTP | S | 1×3 | Verificação obrigatória se utilizador tem TOTP ativo; tolerância ±1 step (30 s); segredo cifrado AES-256-GCM | `auth.js`, `totp.js` |
| Replay de JWT | S | 1×3 | TTL curto (8 h) + assinatura HS256; rotação do segredo invalida tokens em massa | `auth.js` |
| Federação simulada — substituição de NIF | S | 2×4 | Estado opaco assinado server-side; expira em 5 min; só funciona em ambiente de demonstração | `auth.js: iniciarFederacao` |

### 2.2 Autorização e isolamento por gabinete

| Ameaça | STRIDE | P × G | Mitigação | Onde |
|---|---|---|---|---|
| PF de gabinete A acede a FPL do gabinete B | E | 3×3 | `fplComEscopo` em `routes.js` antes de qualquer operação; testado em `integracao.test.js` | `routes.js` |
| PF tenta validar marco que não tem competência | E | 2×3 | Workflow só permite transições válidas (`workflow.js: TRANSICOES`); aprovação CM exige `requireRole('GSEPCM','SGGOV_ADMIN')` | `workflow.js`, `routes.js` |
| Auditor QA modifica conteúdo de FPL alheia | T | 2×3 | Endpoints de QA apenas inserem pedidos de correção; conteúdo só é modificado pelo PF responsável | `routes.js: /fpl/:id/auditoria` |
| Escalada de privilégios via cookie manipulado | E | 1×4 | JWT assinado server-side; verificação de papéis ativos por BD a cada pedido (não vem do cookie) | `auth.js: authMiddleware` |

### 2.3 Comprovativo criptográfico

**Endereçado em detalhe em `docs/09_Threat_Model_Comprovativo.md`.**
Síntese:

| Ameaça | STRIDE | P × G | Mitigação | Onde |
|---|---|---|---|---|
| Forjar comprovativo | S/T | 1×4 | Assinatura Ed25519; chave privada nunca sai do processo | `comprovativo.js` |
| Adulterar payload ou assinatura | T | 1×3 | Verificação Ed25519 rejeita; testes em `dominio.test.js` | `comprovativo.js: verificarComprovativo` |
| Substituir chave pública pintada no verificador | S | 1×4 | `kid` cruza com JWKS na origem; distribuição out-of-band para o SmartLegis | `comprovativo.js: getJwks` |
| Reutilizar comprovativo (replay) | S | 2×2 | `jti` único + timestamp `iat` + validade explícita (`expira_em`); persistido na BD com FK para a FPL | `comprovativo.js: emitirComprovativo` |
| `alg: none` no JWS | S | 1×4 | Allowlist `EdDSA`; rejeita qualquer outro algoritmo | `comprovativo.js` |

### 2.4 Base de dados (PostgreSQL)

| Ameaça | STRIDE | P × G | Mitigação | Onde |
|---|---|---|---|---|
| SQL injection | T/I | 1×4 | Driver dual com **placeholders sempre** (`?` ou `$n`); nunca concatenação | `db.js`, todos os módulos |
| Acesso direto à BD a partir da rede | I | 1×4 | Bind apenas à interface interna da RING; firewall de container | Infraestrutura |
| Furto de credenciais da BD do `.env` | I | 2×4 | Ficheiro `0600` propriedade do utilizador do serviço; em produção via *vault* (Hashicorp/CyberArk) | Operação |
| Corrupção de dados por bug de migração | T | 2×3 | Migrations idempotentes; testes locais antes de produção; backup pré-migração | `migrate.js`, `docs/06_Operacao.md` |

### 2.5 Storage de anexos (MinIO)

| Ameaça | STRIDE | P × G | Mitigação | Onde |
|---|---|---|---|---|
| Upload de ficheiro malicioso (binário, script) | E/T | 2×3 | Validação de tipo MIME contra allowlist; tamanho máximo configurável; estensão sanitizada; *path traversal* prevenido por `path.basename` | `anexos.js` |
| Acesso direto a S3 bypass da app | E | 1×4 | Bucket privado; só o backend tem credenciais; sem URLs pré-assinadas públicas | `storage.js` |
| Listagem do bucket por força bruta de nomes | I | 1×2 | Nomes UUID; sem enumeração; ACL bucket-level | `storage.js: putAnexo` |

### 2.6 Cache (Redis)

| Ameaça | STRIDE | P × G | Mitigação | Onde |
|---|---|---|---|---|
| Envenenamento da cache por outro tenant | T | 1×2 | Redis dedicado à app; sem multi-tenant | Operação |
| Perda da cache → bypass de rate-limit | D | 2×2 | Em queda, rate-limit falha "permissive" mas alarme é disparado (Redis disponível em `/health`) | `security.js` |
| Persistência indevida de sessão após logout | I | 1×2 | Logout limpa o cookie; chave `sess:` na cache expira em 8 h | `auth.js: clearSessionCookie` |

### 2.7 Logs e observabilidade

| Ameaça | STRIDE | P × G | Mitigação | Onde |
|---|---|---|---|---|
| `/metrics` expõe identificadores ou conteúdo de FPL | I | 2×3 | Rotas colapsadas em `:id`; só contadores e gauges agregados; sem labels com IDs específicos | `metrics.js: sanitizarRota` |
| Apagamento de logs forenses | R | 1×4 | `evento_fpl` é append-only; alarmes em `DELETE` desta tabela; retenção 10 anos | BD + operação |
| Log injection (newline no campo livre) | T | 2×1 | `console.log` usa interpolação JSON; sem split por newline em pipeline | Padrão de logging |

### 2.8 Frontend

| Ameaça | STRIDE | P × G | Mitigação | Onde |
|---|---|---|---|---|
| XSS via Bloco D (`sintese_posicao`, etc.) | T/I | 2×3 | `esc()` sanitiza todo o HTML antes de injeção em `innerHTML`; CSP bloqueia execução inline | `app.js: esc()` |
| Clickjacking | T | 1×2 | `X-Frame-Options: DENY` + `frame-ancestors 'none'` (CSP) | `security.js` |
| MIME-sniffing | T | 1×2 | `X-Content-Type-Options: nosniff` | `security.js` |
| Caching agressivo de dados sensíveis | I | 2×2 | `Cache-Control: no-store` em respostas `/api/*` | `security.js` |
| Fingerprinting por `Server` / `X-Powered-By` | I | 1×1 | `app.disable('x-powered-by')`; reverse-proxy filtra `Server` | `server.js` |

---

## 3. Riscos sistémicos

### 3.1 Indisponibilidade da RING

**Impacto:** PF não conseguem trabalhar.
**Mitigação:** degradação graciosa documentada em `docs/06_Operacao.md`
§8; modo `local` de autenticação como fallback; pontos focais podem
preparar minutas offline e submeter quando a rede regressar.

### 3.2 Dependência do SmartLegis

**Impacto:** se o SmartLegis falhar na verificação do comprovativo, o
diploma não avança no circuito CM.
**Mitigação:** o comprovativo é **verificável offline** com a chave
pública partilhada — o SmartLegis não precisa de chamar a FPL Ponte.

### 3.3 Compromisso da CA do Governo

**Impacto:** atacante pode emitir certificados TLS válidos para
`fpl.gov.pt`.
**Mitigação:** fora do âmbito desta aplicação; resposta pelo CEGER/GNS.

### 3.4 Insider threat

**Impacto:** administrador SGGOV abusa de privilégios para modificar uma
FPL antes da publicação.
**Mitigação:** segregação de funções (admin não pode aprovar CM nem
emitir comprovativo sem ser validador); todas as alterações geram
versões imutáveis e eventos; auditoria mensal pelo EPD.

---

## 4. Riscos não mitigados (aceites)

| # | Risco | Razão de aceitação |
|---|---|---|
| A1 | Conluio entre PF e auditor SGGOV para registar uma falsa cadeia de Bloco D | Mitigação requer dupla aprovação independente que retarda significativamente o processo — fora do compromisso v1.0 |
| A2 | Análise estatística de tempos de tramitação para inferir conteúdos | Os tempos são informação pública; mitigação não é prioritária |
| A3 | Falha de hardware do servidor único | v1.0 corre numa única instância; mitigado em v2.0 com clustering Postgres + 2 nós backend (já preparado pela arquitetura sem estado) |

---

## 5. Testes que cobrem este modelo

| Categoria | Local | Cobertura |
|---|---|---|
| Workflow + validações | `backend/test/dominio.test.js` | 10 testes — pré-requisitos por marco, transições, comprovativo, adulteração |
| HTTP integration | `backend/test/integracao.test.js` | 13 testes — auth, CSRF, RBAC, escopo gabinete, exportação |
| Acessibilidade | `backend/test/a11y.test.js` | 5 testes — landmarks, ARIA, skip-link, contraste |
| E2E browser | `app/e2e/tests/fluxo-m0.spec.js` | 5 testes — login, criar FPL, M0, headers de segurança, JWKS, /metrics |

Total: **33 testes automatizados** que falham em regressão de qualquer
mitigação acima.

---

## 6. Procedimento de revisão

- Revisão semestral mínima.
- Revisão extraordinária a cada alteração material:
  - introdução de nova categoria de dados pessoais;
  - alteração da chave de assinatura ou do algoritmo;
  - integração com novo sistema externo;
  - mudança de modelo de autenticação.

A próxima revisão obrigatória é **Novembro 2026** ou no momento da
integração real do SmartLegis (Bloco E2/E3).
