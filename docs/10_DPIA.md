# Avaliação de Impacto sobre a Proteção de Dados (DPIA)

**Aplicação:** FPL — Pegada Legislativa do Governo (FPL Ponte v1.0-rc)
**Responsável pelo tratamento:** Secretaria-Geral do Governo (SGGOV)
**Data:** Maio de 2026
**Versão:** 1.0 — para validação do Encarregado da Proteção de Dados (EPD)
e submissão à **Comissão Nacional de Proteção de Dados (CNPD)** ao abrigo
do artigo 35.º do RGPD e do artigo 36.º da Lei n.º 58/2019.

> **Base normativa.** Esta DPIA é uma peça obrigatória da instrução do
> projeto: tem de existir e ser submetida à CNPD para **parecer prévio**
> antes da apresentação da RCM à reunião preparatória do Conselho de
> Ministros que aprovará a Pegada Legislativa.

---

## 1. Necessidade da DPIA

### 1.1 Critérios desencadeadores (Diretrizes WP248 rev.01)

| Critério | Aplica-se? | Fundamento |
|---|---|---|
| Decisões automatizadas com efeito jurídico | **Não** | A FPL é instrumental — não toma decisões pelo Governo |
| Monitorização sistemática | Parcial | Auditoria SGGOV e logs de versão das FPL — finalidade documental |
| Tratamento em larga escala de categorias especiais | **Não** | Não trata categorias do art. 9.º do RGPD |
| Cruzamento de dados | Sim | Cruza identidade dos pontos focais com a tramitação legislativa |
| Dados de sujeitos vulneráveis | **Não** | Apenas trabalhadores e dirigentes da Administração |
| Uso inovador de tecnologia | Sim | Comprovativo criptográfico Ed25519 com cadeia de custódia entre sistemas |
| Bloqueio de exercício de direitos | **Não** | Não impede o exercício de direitos dos titulares |
| Tratamento que envolve a difusão automática de dados | Parcial | Exportação dos dados não-PII para o Portal do Governo |

**Conclusão:** dois critérios cumprem-se (cruzamento + tecnologia inovadora).
Pelas regras da CNPD basta um critério para tornar a DPIA recomendada;
duas posições tornam-na **obrigatória**.

### 1.2 Posicionamento jurídico

- **Responsável:** SGGOV (entidade que decide finalidades e meios).
- **Subcontratantes:** equipa interna do CEGER (operação da RING),
  ENISA/AT/SmartLegis enquanto destinatários de comprovativos
  (não acedem ao conteúdo da FPL).
- **Encarregado de Proteção de Dados:** [a indicar pela SGGOV].

---

## 2. Descrição sistemática do tratamento

### 2.1 Finalidades

| Finalidade primária | Base legal |
|---|---|
| Documentar a "pegada legislativa" de cada diploma (interlocutores externos, contributos, decisão de incorporação) | art. 6.º, n.º 1, al. **e** RGPD — *exercício de funções de interesse público*, em concretização da RCM da Pegada Legislativa v2 |
| Suportar a auditoria SGGOV e a integridade do processo legislativo | art. 6.º, n.º 1, al. **c** — *cumprimento de obrigação jurídica* (RCM Pegada + Lei do Governo) |
| Produzir comprovativos criptográficos para o SmartLegis | idem |
| Publicar metadados pela transparência (não-PII) | idem |

### 2.2 Categorias de titulares de dados

| Titular | Origem dos dados |
|---|---|
| **Pontos focais** dos gabinetes ministeriais | Auto-registo + diretório interno |
| **Auditores e administradores** da SGGOV | idem |
| **GSEPCM** (Gabinete do Secretário de Estado da Presidência) | idem |
| **Pessoas que participam** em audiências, reuniões, consultas (Bloco D — interlocutores externos) | Inserido pelos pontos focais |

### 2.3 Categorias de dados pessoais tratados

| Categoria | Exemplos | Origem | Sensibilidade |
|---|---|---|---|
| Identificação profissional | Nome completo, email funcional, gabinete | Diretório interno | Comum |
| Identificação fiscal (apenas validador) | NIF | Diretório interno (Cartão de Cidadão) | Comum |
| Credenciais | Hash bcrypt da password, segredo TOTP cifrado | Próprio | Sensível operacional |
| Logs de atividade | Timestamp, IP, ação, FPL, payload | Próprio | Comum |
| Tentativas de login (anti-brute-force) | Email, IP, sucesso/falha, timestamp | Próprio | Comum |
| Sessões | JWT, expira_em | Próprio | Sensível operacional |
| Dados de interlocutores (Bloco D) | Nome, designação, RTRI ID, função | Inserido | Comum |
| Composições e pareceres | Texto livre escrito pelo ponto focal | Próprio | Comum |

**Não são tratados** dados das categorias especiais do art. 9.º do RGPD
(saúde, religião, etc.), nem dados de crianças, nem dados biométricos.

### 2.4 Categorias de destinatários

| Destinatário | Dados que recebe | Base legal |
|---|---|---|
| SGGOV (auditoria QA) | Acesso completo às FPL | art. 6.º (1) (e) |
| GSEPCM | Acesso a FPL pré-CM | idem |
| SmartLegis | **Apenas o JWS** do comprovativo (jti, marco, número de processo, hash do snapshot) | idem |
| Portal do Governo | Dataset público sem PII | idem |
| AMA (fiscalização da acessibilidade) | Declaração de acessibilidade | DL 83/2018 |
| CNPD (parecer prévio + supervisão) | DPIA + relatório de violação se aplicável | RGPD art. 36.º e 33.º |

**Não há transferências internacionais** — todo o tratamento ocorre na
RING, dentro do território nacional.

### 2.5 Períodos de conservação

| Dado | Período | Critério |
|---|---|---|
| FPL e versões | **10 anos** após publicação | Lei do Arquivo + valor probatório do comprovativo |
| Comprovativos criptográficos | **10 anos** | idem |
| Logs de eventos | 10 anos | idem |
| Chaves criptográficas (públicas no JWKS) | Mantidas enquanto houver comprovativos por verificar (mínimo 10 anos) | Integridade verificável |
| Sessões (JWT) | 8 horas | Política de segurança |
| Tentativas de login | 30 dias | `RETENTION_TENTATIVAS_LOGIN_DIAS` |
| Bloqueios de conta | 30 minutos após desbloqueio automático | idem |
| Notificações | 90 dias após leitura | `RETENTION_NOTIFICACOES_DIAS` |
| Exportações para o Portal | Permanente (publicações irreversíveis) | Princípio da transparência |

Cronograma de limpeza automatizado em `db.cutoffISO`, invocado nos
módulos `auth.js` e `notificacoes.js`.

---

## 3. Fluxos de dados

### 3.1 Aquisição
1. **Pontos focais** autenticam-se via diretório interno (LDAP/AD) ou
   federação Cartão de Cidadão (simulada nesta fase).
2. **Bloco D** recebe dados de interlocutores externos *digitados* pelo
   PF; não há ingestão automatizada de bases externas (exceto sincronização
   com RTRI — leitura apenas).

### 3.2 Processamento
- BD PostgreSQL com replicação síncrona local; encriptação em repouso ao
  nível do sistema de ficheiros (LUKS).
- Cache Redis para sessões e contadores de rate-limit (não armazena
  dados pessoais persistentes).
- Storage MinIO S3 para anexos das FPL — encriptação em repouso.

### 3.3 Transmissão
- Toda a comunicação **dentro** da RING é TLS 1.2+ (cifras AEAD
  obrigatórias). Acesso externo dos PF é mediado por VPN governamental.
- O JWS do comprovativo é transmitido fora-banda (cópia/colagem ou API
  futura) para o SmartLegis. **A chave privada nunca sai do servidor FPL.**

### 3.4 Diagrama

```
[ PF gabinete ministerial ]
        │ VPN
        ▼
[ Reverse-proxy RING ──TLS──▶ FPL Ponte ──┬──▶ BD PostgreSQL
                                          ├──▶ Redis
                                          ├──▶ MinIO (anexos)
                                          ├──▶ Diretório interno (LDAP)
                                          └──▶ /api/.well-known/fpl-jwks.json
                                                  (consumido pelo SmartLegis e por AT)
```

---

## 4. Direitos dos titulares

Procedimentos implementados na aplicação:

| Direito | Procedimento |
|---|---|
| Acesso (art. 15.º) | Cada PF tem acesso à sua FPL; pedidos externos via formulário de contacto da SGGOV (canal institucional) |
| Retificação (art. 16.º) | Atualização do Bloco D ou ficha de PF via UI |
| Apagamento (art. 17.º) | **Limitado** — o tratamento é justificado por interesse público e existe obrigação de conservação (10 anos). Direito a apagamento não pode prevalecer (art. 17.º, n.º 3, al. b e e) |
| Limitação (art. 18.º) | Marcação do estado de FPL como "EM_REVISAO_QA" suspende o avanço sem apagar |
| Portabilidade (art. 20.º) | **Não aplicável** — a base legal não é o consentimento |
| Oposição (art. 21.º) | Avaliada caso-a-caso pela SGGOV; titular pode reclamar à CNPD |
| Não sujeição a decisões automatizadas (art. 22.º) | **Não aplicável** — não há decisões automatizadas |

---

## 5. Avaliação dos riscos para titulares

### 5.1 Metodologia

Avaliação qualitativa **probabilidade × gravidade** (escala 1–4) com
medidas de mitigação documentadas em `docs/11_Threat_Model_Sistema.md` e
`docs/09_Threat_Model_Comprovativo.md`.

### 5.2 Riscos identificados

| # | Risco | P | G | Risco bruto | Mitigação | Risco residual |
|---|---|---|---|---|---|---|
| R1 | Acesso indevido a FPL por trabalhador da AP fora do escopo (PF de outro gabinete vê FPL alheia) | 2 | 3 | Médio | RBAC por gabinete em `routes.js` (`fplComEscopo`); testado em 4 cenários de integração HTTP | Baixo |
| R2 | Comprometimento da chave privada Ed25519 | 1 | 4 | Médio | Chave em ficheiro `0600`; rotação documentada; alarmes em alterações na tabela `comprovativo_chave`; migração para HSM em produção | Baixo |
| R3 | Inserção de PII excessiva no campo livre "sintese_problema" do Bloco D | 3 | 2 | Médio | Formação de PF + revisão pelo QA SGGOV antes de M3; alerta UI a partir de 5 000 caracteres (heurística) | Médio |
| R4 | Vazamento por exportação para Portal do Governo (PII num campo livre) | 2 | 3 | Médio | `export.js` filtra explicitamente campos não-PII; revisão SGGOV obrigatória antes de M5 (publicar) | Baixo |
| R5 | Brute-force de password de PF | 2 | 2 | Baixo | Hash bcrypt rounds=12, rate-limit IP+email (5 falhas/5 min); bloqueio automático 8 falhas/30 min; 2FA TOTP obrigatório para SGGOV admin | Muito baixo |
| R6 | Captura de sessão por XSS | 1 | 3 | Baixo | CSP rígida sem `unsafe-inline` em scripts; cookie `HttpOnly` e `SameSite=Lax`; sanitização (`esc()`) em todo o HTML; CSRF token | Muito baixo |
| R7 | Perda de logs (apagamento intencional) | 1 | 3 | Baixo | Eventos imutáveis na tabela `evento_fpl`; backups diários cifrados; retenção 10 anos | Muito baixo |
| R8 | Verificador externo aceitar comprovativo falsificado (chave pública atacante) | 1 | 4 | Médio | Distribuição da chave pública pinada/canónica para SmartLegis (out-of-band); `kid` verifica-se contra o JWKS na origem | Baixo |
| R9 | Ataque MITM dentro da RING | 1 | 3 | Baixo | TLS mútuo entre componentes; certificados emitidos pela CA do Governo | Muito baixo |
| R10 | Erro humano: PF publica versão errada como APROVADO | 2 | 3 | Médio | Workflow bloqueante M0→M5; SGGOV QA + GSEPCM aprovam antes de M5; comprovativo torna a versão imutável | Baixo |

Nenhum risco residual permanece **Alto** após mitigações.

---

## 6. Medidas técnicas e organizativas

### 6.1 Técnicas

| Categoria | Medida |
|---|---|
| Encriptação em trânsito | TLS 1.2+ (cifras AEAD); HSTS em produção |
| Encriptação em repouso | LUKS no sistema de ficheiros; segredo TOTP cifrado AES-256-GCM antes de gravar |
| Autenticação | Diretório interno (LDAP/AD) + 2FA TOTP opcional (obrigatório para admin) |
| Autorização | RBAC com escopo por gabinete |
| Comprovativo | JWS Ed25519 (RFC 8037) com `kid` para rotação |
| Integridade | Snapshot SHA-256 incluído no payload do JWS |
| Logging | Eventos imutáveis 10 anos; logs de tentativas de login 30 dias |
| Hardening HTTP | CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, COOP, CORP, HSTS, Cache-Control no-store em `/api` |
| Rate-limit | 240 req/min IP global; 20/5 min IP login; 5/5 min email login |
| Anti-CSRF | Double-submit cookie + header |
| Backups | Diários cifrados; teste mensal de restore |
| Acessibilidade | WCAG 2.2 AA (`docs/declaracao-acessibilidade.html`) — defesa também da inclusão digital |

### 6.2 Organizativas

| Categoria | Medida |
|---|---|
| Formação | Sessão de 2 horas para PF antes do go-live; renovação anual |
| Acordos | Termo de confidencialidade dos PF; vínculo dos auditores SGGOV |
| Revisão | Auditoria SGGOV em todas as FPL antes do M4 |
| Governança | RACI definido em `docs/02_Arquitetura.md` |
| Plano de violação | Notificação à CNPD em 72 horas (art. 33.º RGPD); notificação aos titulares se risco elevado (art. 34.º) |
| Revisão da DPIA | Anual ou a cada alteração material da arquitetura |

---

## 7. Riscos residuais aceites

Após mitigação, permanecem dois riscos residuais que a SGGOV aceita
formalmente:

1. **R3 (médio):** PII em campos livres — endereçado por revisão humana
   no QA SGGOV, sem mecanismo automatizado de deteção (DLP). Plano para
   v2.0: integrar detetor de padrões NIF/IBAN/contactos.
2. **R10 (baixo):** erro humano — endereçado por workflow bloqueante,
   mas é impossível eliminar completamente a categoria.

---

## 8. Consulta às partes interessadas

| Parte | Estado |
|---|---|
| Encarregado de Proteção de Dados (EPD) da SGGOV | A consultar antes da submissão à CNPD |
| Representantes dos PF dos gabinetes ministeriais | Sessão de validação UX realizada; sem objeções de privacidade |
| CNPD | A submeter (parecer prévio art. 36.º) |
| Equipa SmartLegis | Sessão técnica para fechar o contrato de comprovativo (Bloco D2) |

---

## 9. Decisão da SGGOV

À luz desta DPIA, e sob reserva da validação do EPD e do parecer da
CNPD, a SGGOV considera que:

- O tratamento é **necessário e proporcionado** à finalidade.
- Os riscos residuais são **aceitáveis**.
- O sistema pode **avançar para go-live**.

---

## 10. Anexos

- `docs/09_Threat_Model_Comprovativo.md` — modelo de ameaças do comprovativo
- `docs/11_Threat_Model_Sistema.md` — modelo de ameaças do sistema global
- `docs/02_Arquitetura.md` — arquitetura técnica
- `docs/declaracao-acessibilidade.html` — declaração de acessibilidade
- `app/backend/sbom-spdx.json` — SBOM SPDX (gerado por `npm sbom`)

---

**Aprovação SGGOV (a preencher):**

|  | Nome | Cargo | Assinatura | Data |
|---|---|---|---|---|
| Responsável pelo projeto |  |  |  |  |
| Encarregado de Proteção de Dados |  |  |  |  |
| Secretário-Geral do Governo |  |  |  |  |
