# Arquitetura — FPL Ponte v2.0 (simplificada)

**Junho 2026**

## 1. Princípios

1. **Temporário por desenho.** Vida útil 18-24 meses. Substituibilidade é prioridade #1.
2. **Tudo lê e escreve um único formato canónico** (JSON Schema `fpl-ponte/v1`). Esse formato é a "ABI" que oferecemos a quem vier a seguir (SmartLegis ou Plataforma IntGov da UnIT).
3. **Confina-se à rede Governo.** Excepto a ficha publicada, que pode ser servida estaticamente do portal do Governo.
4. **Reusa o que o ecossistema já oferece** (Entra ID, SharePoint, ConsultaLex, INTEGRA da UnIT). Não duplica.

## 2. Camadas

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (SPA "painel")                                     │
│  · login Entra ID (redirect)                                │
│  · CRUD da FPL · upload JSON INTEGRA · gerar ficha pública  │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS (reverse-proxy DSTD)
┌────────────────────────▼────────────────────────────────────┐
│  Node 22 · 1 processo · ~1500 LOC                           │
│                                                             │
│   routes.js     (Express, ~30 endpoints)                    │
│   auth.js       (Entra OIDC + sessão em cookie)             │
│   workflow.js   (RASCUNHO → ... → PUBLICADO)                │
│   fpl.js        (domínio + audições + INTEGRA + audit log)  │
│   canonico.js   (JSON Schema "fpl-ponte/v1") ★              │
│   ficha_publica.js (HTML estático)                          │
│   backup.js     (cópia diária para pasta SharePoint)        │
└────┬────────────┬───────────────────────────────────────────┘
     │            │
     │            └──► filesystem · anexos + backup SharePoint
     ▼
   SQLite (1 ficheiro WAL)
```

## 3. Schema de dados

12 tabelas, todas com TEXT/INTEGER:

```
utilizador          (id, email, nome_completo, ativo)
gabinete            (id, sigla, nome, ativo)
atribuicao_papel    (utilizador_id, papel, gabinete_id)
sessao              (id, utilizador_id, expira_em, ip, user_agent)

fpl                 (id, numero_processo, tipo_diploma, titulo, gabinete_id,
                     estado, blocos B+E inline, marcos M0/M2/M3/M4/M5,
                     hash_publicacao, versao_atual)
audicao             (id, fpl_id, categoria, entidade, base_legal, forma,
                     estado, sintese_posicao, decisao_incorporacao,
                     justificacao_decisao)
interacao_integra   (id, fpl_id, gabinete_origem, payload, data, entidade)

evento              (id, fpl_id, tipo, autor_id, timestamp, payload)
versao_fpl          (id, fpl_id, numero, autor_id, snapshot_json, marco)
anexo               (id, fpl_id, bloco, ..., storage_path, sha256)

tentativa_login / conta_bloqueada
```

Nenhuma tabela `comprovativo`, `chave_assinatura`, `outbox_email`, `notificacao`, `contributo_consulta`, `entidade_rtri`, `auditoria_qa` ou `totp`. Essa funcionalidade foi removida.

## 4. JSON canónico

Estrutura completa em `app/backend/src/canonico.js`. Resumo:

```json
{
  "schema": "fpl-ponte/v1",
  "numero_processo": "2026/MAEN/0001",
  "estado": "PUBLICADO",
  "versao": 7,
  "gabinete": { "sigla": "MAEN", "nome": "..." },
  "coproponentes": ["MS"],
  "tipo_diploma": "DL",
  "titulo": "...",
  "blocos": {
    "B":  { "tipo_origem": "...", "sintese_problema": "..." },
    "D1_audicoes_obrigatorias": [ ... ],
    "D2_audicoes_gsepcm":       [ ... ],
    "D3_integra":               [ ... ],
    "E_consulta_publica":       { "cl_link": "...", "cl_n_contributos": 23, "cl_sintese": "..." }
  },
  "marcos": { "M0": {...}, "M2": {...}, "M3": {...}, "M4": {...}, "M5": {...} },
  "publicacao": { "referencia_dr": "...", "data": "ISO", "hash_sha256": "..." }
}
```

Regra de evolução: novos campos podem ser acrescentados sem bump de schema; renames/remoções exigem `fpl-ponte/v2` + ferramenta de tradução.

## 5. Autenticação

| Modo | Quando | Como |
|---|---|---|
| `mock` | dev / demo | POST `/api/auth/login` com `{email}` (sem password) |
| `entra` | produção | Redirect para Entra ID OIDC; provisão JIT no callback |

Atribuição inicial de papel (driver `entra`):
1. **Mapping explícito** em `ENTRA_ADMIN_MAP` (`email:papel;...`)
2. **Por domínio** do email: `nome@<sigla>.gov.pt` → `PONTO_FOCAL` desse gabinete

Papéis: `PONTO_FOCAL` · `GSEPCM` · `SGGOV_QA` · `SGGOV_ADMIN`.

Sessão = cookie httpOnly + linha em `sessao` (TTL 8 h). Sem JWT, sem TOTP, sem federação simulada.

## 6. Integrações externas

| Sistema | Modo | Detalhe |
|---|---|---|
| **Entra ID** | OIDC redirect | Stub, a preencher quando DSTD fornecer credenciais |
| **INTEGRA (UnIT)** | upload JSON | Ponto focal carrega; vai para D.3 read-only |
| **ConsultaLex** | link + síntese | Não integramos. Link + n.º contributos + síntese redigida pelo focal |
| **DRE** | referência manual | Sem polling. Focal regista a referência ao publicar |
| **SharePoint** | filesystem sync | Backup escreve em pasta sincronizada pelo cliente OneDrive |

Não há credenciais Microsoft no processo (excepto Entra para auth de utilizadores).

## 7. Resiliência

- BD: SQLite WAL + backup diário.
- Single point of failure: o ficheiro SQLite. Mitigação: backup + snapshot da VM.
- Sem HA. Para ~100 FPLs/ano não é necessário.

## 8. O que NÃO está aqui

- Comprovativos JWS Ed25519 / JWKS público
- Threat model formal / DPIA extenso
- Dashboards de KPIs / cronograma painel
- SSE / notificações em tempo real
- Multi-instância
