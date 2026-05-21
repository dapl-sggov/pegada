# Caderno de especificação técnica · Comprovativo criptográfico FPL ⇄ SmartLegis

**Versão:** 1.0 — Maio 2026 (contrato técnico inicial)
**Sistemas envolvidos:** FPL Ponte (emissor) ⇄ SmartLegis (verificador)
**Status:** **proposta** — a fechar na reunião conjunta SGGOV/SmartLegis (sessão D2 do plano)

> **Objetivo deste caderno.** Permitir à equipa do SmartLegis implementar
> a verificação dos comprovativos da FPL **sem qualquer integração
> síncrona** com a aplicação FPL Ponte. A verificação é feita
> exclusivamente com a chave pública e bibliotecas standard de
> criptografia.

---

## 1. Visão geral

O Conselho de Ministros aprova diplomas que vêm acompanhados de uma FPL
(Pegada Legislativa). A FPL atravessa um workflow com **quatro marcos
bloqueantes** (M0, M1, M4, M5). Em cada marco bloqueante a FPL Ponte
emite um **comprovativo criptográfico** que prova que o marco foi
validado por um agente autorizado, num momento determinado.

A consulta pública ocorre **entre a RSE e o CM**; os marcos M2 (abertura
da CP) e M3 (encerramento da CP) são informativos e **não emitem
comprovativo** para o SmartLegis.

O SmartLegis, ao receber uma minuta para circuito CM, deve:

1. Receber o JWS do comprovativo (cópia/colagem na fase inicial; via API
   no futuro).
2. Verificar a assinatura com a chave pública partilhada.
3. Verificar a coerência do payload com a FPL aceite.
4. Aceitar ou rejeitar a tramitação.

Se a verificação falhar, a tramitação no SmartLegis deve **bloquear**
até que um comprovativo válido seja apresentado.

---

## 2. Formato do JWS

### 2.1 Estrutura geral

JWS compacto (RFC 7515) com três segmentos separados por ponto:

```
base64url(header) . base64url(payload) . base64url(signature)
```

Exemplo (truncado):

```
eyJhbGciOiJFZERTQSIsInR5cCI6ImZwbC1jb21wcm92YXRpdm8ranciIsImtpZCI6Imt
KX2ZwbC0yMDI2In0.eyJpc3MiOiJmcGwuc2dnb3YuZ292LnB0Iiwic3ViIjoiMjAyNi9N
QUUvMDA0MiIs...QbV3w8h5g.JKDqFf1z5x...kQ3wq-w
```

### 2.2 Cabeçalho (JOSE Header)

```json
{
  "alg": "EdDSA",
  "typ": "fpl-comprovativo+jws",
  "kid": "kJ_fpl-2026"
}
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `alg` | string | sim | **Sempre `"EdDSA"`** (Ed25519, RFC 8037). Verificadores DEVEM rejeitar qualquer outro valor (incluindo `"none"`). |
| `typ` | string | sim | **Sempre `"fpl-comprovativo+jws"`**. Permite distinção de outros JWS no SmartLegis. |
| `kid` | string | sim | Identifica a chave pública a usar para verificar. Procurar no JWKS. |

### 2.3 Payload (Claims)

```json
{
  "iss": "fpl.gov.pt",
  "sub": "2026/MAE/0042",
  "fpl_id": "0d6e0e3a-7c14-4f7b-8a76-aeec24c2a8b9",
  "marco": "M1",
  "validado_em": "2026-04-12T14:32:18.451Z",
  "validado_por": "PONTO_FOCAL:mae",
  "snapshot_hash": "sha256:1b3a...",
  "jti": "cmp_M1-x7Vg9P_Lk2y8",
  "iat": 1744465938,
  "exp": 1902145938
}
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `iss` | string | sim | Emitente. **Sempre `"fpl.gov.pt"`** em produção. |
| `sub` | string | sim | Número de processo da FPL (formato `AAAA/SIGLA/NNNN`). É o ponto de ligação humano com o diploma. |
| `fpl_id` | UUID v4 | sim | Identificador opaco da FPL para reconciliação técnica. |
| `marco` | enum | sim | `"M0"` \| `"M1"` \| `"M4"` \| `"M5"`. **Só estes quatro emitem comprovativo.** |
| `validado_em` | ISO 8601 | sim | Timestamp UTC com milissegundos. |
| `validado_por` | string | sim | Formato `<PAPEL>:<gabinete>`. Identifica o **papel funcional** e a unidade orgânica do validador; **não inclui dados pessoais** (UUID/email do utilizador não vão no payload). |
| `snapshot_hash` | string | sim | SHA-256 do snapshot canónico da FPL no momento da validação, prefixado `sha256:`. Prova a integridade do conteúdo. |
| `jti` | string | sim | ID único do comprovativo. Formato `cmp_<marco>-<random>`. |
| `iat` | inteiro | sim | Emissão em segundos Unix (UTC). |
| `exp` | inteiro | sim | Expiração em segundos Unix (UTC). Por defeito **10 anos** após emissão. |

### 2.4 Assinatura

Algoritmo Ed25519 (RFC 8037) sobre `ASCII(base64url(header) + "." + base64url(payload))`.

A assinatura tem 64 bytes; em formato base64url ocupa **86 caracteres**.

---

## 3. Distribuição da chave pública

### 3.1 Endpoint JWKS

```
GET https://fpl.gov.pt/api/.well-known/fpl-jwks.json
```

Resposta (RFC 7517):

```json
{
  "keys": [
    {
      "kty": "OKP",
      "crv": "Ed25519",
      "kid": "kJ_fpl-2026",
      "x": "MCowBQYDK2VwAyEAGb7vXwHc9..."
    }
  ]
}
```

### 3.2 Distribuição out-of-band

Para evitar dependência de DNS e TLS no momento da verificação, a chave
pública é **adicionalmente armazenada localmente como chave de
confiança** no SmartLegis:

- Entrega num envelope assinado pelo Secretário-Geral do Governo.
- Hash SHA-256 da chave registado num documento oficial.
- Renovação coordenada com 30 dias de antecedência (ver §5).

O SmartLegis **deve preferir a chave registada localmente** sobre a
obtida em runtime do JWKS — o JWKS serve como mecanismo de descoberta e
de transição.

---

## 4. Procedimento de verificação (algoritmo)

Pseudo-código a implementar no SmartLegis. Equivale exatamente a
`verificarComprovativo` em `app/backend/src/comprovativo.js`.

```js
function verificarComprovativoFPL(jws, jwks) {
  // 1. Decompor
  const [h, p, s] = jws.split('.');
  if (!h || !p || !s) return { valido: false, erro: 'formato' };

  const header  = JSON.parse(base64urlDecode(h));
  const payload = JSON.parse(base64urlDecode(p));

  // 2. Verificar cabeçalho
  if (header.alg !== 'EdDSA')        return { valido: false, erro: 'alg-recusado' };
  if (header.typ !== 'fpl-comprovativo+jws') return { valido: false, erro: 'typ-recusado' };

  // 3. Selecionar a chave pelo kid
  const jwk = jwks.keys.find(k => k.kid === header.kid);
  if (!jwk) return { valido: false, erro: 'kid-desconhecido' };

  // 4. Verificar a assinatura
  const signingInput = utf8Bytes(h + '.' + p);
  const sigBytes     = base64urlDecode(s);
  const ok = ed25519.verify(jwkToRawPublicKey(jwk), signingInput, sigBytes);
  if (!ok) return { valido: false, erro: 'assinatura-invalida' };

  // 5. Verificar validade temporal
  const agora = Math.floor(Date.now() / 1000);
  if (payload.iat > agora + 60) return { valido: false, erro: 'iat-no-futuro' };  // skew 60 s
  if (payload.exp <= agora)      return { valido: false, erro: 'expirado' };

  // 6. Verificar emitente
  if (payload.iss !== 'fpl.gov.pt') return { valido: false, erro: 'iss-recusado' };

  // 7. Verificar marco
  if (!['M0','M1','M4','M5'].includes(payload.marco))
    return { valido: false, erro: 'marco-recusado' };

  return { valido: true, payload };
}
```

### 4.1 Regras de aceitação no SmartLegis

Para que o SmartLegis aceite uma tramitação que cite uma FPL, **todos**
os comprovativos previstos para o estado atual da FPL devem ser válidos:

| Estado pretendido pela tramitação | Comprovativos exigidos |
|---|---|
| Submissão a RSE | M0 + M1 |
| Submissão a Conselho de Ministros | M0 + M1 + M4 |
| Publicação no DR | M0 + M1 + M4 + M5 |

Se qualquer um falhar, o SmartLegis **bloqueia** com a mensagem de erro
reportada.

Note-se que M2 (abertura da CP) e M3 (encerramento da CP) são marcos
não-bloqueantes — informativos do ciclo da consulta pública, que
acontece **entre a RSE e o CM**. O SmartLegis não os verifica; o backend
da FPL Ponte exige internamente que M3 esteja completo antes de permitir
M4.

---

## 5. Rotação de chaves

### 5.1 Procedimento normal

1. SGGOV anuncia a rotação com **30 dias de antecedência** ao SmartLegis.
2. Nova chave Ed25519 é gerada; `kid` muda (formato `kJ_fpl-AAAA-NN`).
3. JWKS expõe simultaneamente as **duas chaves** durante o período de
   transição (mínimo 90 dias).
4. Novos comprovativos são emitidos com a nova chave; antigos continuam
   verificáveis enquanto a chave antiga estiver no JWKS.
5. Após **90 dias** a chave antiga é removida do JWKS — mas mantida no
   armazenamento da FPL Ponte por 10 anos para verificação retroativa.

### 5.2 Comprometimento

Se a chave privada for comprometida:

1. SGGOV revoga imediatamente a chave (alarme + procedimento documentado
   em `docs/06_Operacao.md`).
2. Gera nova chave e atualiza o JWKS num único deploy atómico.
3. **Todos os comprovativos emitidos com a chave revogada** são marcados
   `estado = REVOGADO` na BD da FPL Ponte. O endpoint
   `/api/comprovativos/verificar` passa a devolver `valido: false`
   para esses `jti`.
4. SGGOV notifica o SmartLegis em **24 horas** (ofício + email +
   atualização da chave registada localmente).
5. O SmartLegis deve consultar `/api/comprovativos/verificar` em vez de
   verificar offline durante 90 dias após uma revogação.

### 5.3 API de consulta de estado

Para casos em que o SmartLegis necessita de validar o estado atual:

```
POST /api/comprovativos/verificar
Content-Type: application/json
Authorization: Bearer <token>    (apenas em produção)

{ "jws": "..." }

→ 200 OK
{
  "valido": true,
  "estado": "VALIDO" | "REVOGADO" | "EXPIRADO" | "DESCONHECIDO",
  "payload": { ... },
  "header": { ... }
}
```

---

## 6. Tratamento de erros

| Erro | Significado | Ação do SmartLegis |
|---|---|---|
| `formato` | O JWS não tem três segmentos. | Rejeitar e pedir nova cópia. |
| `alg-recusado` | Algoritmo diferente de EdDSA. | Rejeitar; **possível tentativa de ataque** — alarmar. |
| `typ-recusado` | `typ` não é `fpl-comprovativo+jws`. | Rejeitar; pode ser JWS de outro contexto. |
| `kid-desconhecido` | `kid` não está no JWKS local nem no servidor. | Atualizar JWKS; se persistir, rejeitar. |
| `assinatura-invalida` | A assinatura não cola com a chave esperada. | Rejeitar; possível adulteração — alarmar. |
| `iat-no-futuro` | Emissão posterior a "agora + 60 s". | Rejeitar; problema de clock skew (≥1 min) ou ataque. |
| `expirado` | `exp` no passado. | Rejeitar; pedir reemissão à FPL. |
| `iss-recusado` | Issuer diferente do esperado. | Rejeitar. |
| `marco-recusado` | Marco fora do enum. | Rejeitar; bug ou comprovativo malicioso. |

---

## 7. Vetores de teste

A FPL Ponte disponibilizará um conjunto de **vetores de teste** para o
SmartLegis verificar a sua implementação:

```
GET https://fpl.gov.pt/api/.well-known/fpl-test-vectors.json
```

Vetores:

| ID | Resultado esperado | Descrição |
|---|---|---|
| TV1 | `valido: true` | JWS bem formado M0 |
| TV2 | `valido: true` | JWS bem formado M1 |
| TV3 | `valido: false, erro: assinatura-invalida` | JWS com 1 byte da assinatura adulterado |
| TV4 | `valido: false, erro: alg-recusado` | header com `alg: none` |
| TV5 | `valido: false, erro: kid-desconhecido` | header com `kid` inventado |
| TV6 | `valido: false, erro: expirado` | payload com `exp` no passado |

A integração só é considerada conforme quando o SmartLegis **passa nos
seis vetores**.

---

## 8. Bibliotecas recomendadas

| Linguagem | Biblioteca | Notas |
|---|---|---|
| Node.js | `crypto` standard (>=18) | `crypto.verify(null, data, pubKey, sig)` com `pubKey` em formato JWK ou PEM |
| Java | Nimbus JOSE+JWT 9.x | Suporte direto Ed25519 |
| .NET | `Microsoft.IdentityModel.Tokens` 7.x | Verificar versão com suporte a Ed25519 |
| Python | `python-jose` ou `joserfc` | `joserfc` recomendado (suporte Ed25519 nativo) |

**Não usar:**
- bibliotecas que aceitam `alg: none` por defeito (CVE-clássicas);
- implementações próprias de Ed25519 sem revisão criptográfica.

---

## 9. Plano de implementação conjunta

| # | Tarefa | Responsável | Prazo |
|---|---|---|---|
| 1 | Validação deste documento | SGGOV + SmartLegis | T0 |
| 2 | Geração da chave de produção SGGOV | SGGOV (CEGER + EPD) | T0 + 2 sem. |
| 3 | Entrega out-of-band da chave pública ao SmartLegis | SGGOV → SmartLegis | T0 + 3 sem. |
| 4 | Implementação do verificador no SmartLegis | SmartLegis | T0 + 6 sem. |
| 5 | Testes conjuntos com vetores | SGGOV + SmartLegis | T0 + 8 sem. |
| 6 | Go-live em produção | Conjunto | T0 + 10 sem. |

---

## 10. Contactos

| Função | Sistema | Contacto |
|---|---|---|
| Líder técnico FPL Ponte | FPL | [a indicar SGGOV] |
| Encarregado da Proteção de Dados | FPL | [a indicar SGGOV] |
| Líder técnico SmartLegis | SmartLegis | [a indicar SmartLegis] |
| Ponto de contacto operacional 24/7 | Ambos | [a indicar] |

---

## 11. Anexos

- `docs/09_Threat_Model_Comprovativo.md` — modelo de ameaças do
  comprovativo (referencial completo).
- `docs/11_Threat_Model_Sistema.md` — modelo de ameaças sistémico.
- `app/backend/src/comprovativo.js` — implementação de referência
  (emissão + verificação). Código aberto à equipa SmartLegis para
  comparação.
