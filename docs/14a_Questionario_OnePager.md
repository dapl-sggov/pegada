# Pegada Legislativa — pré-instalação na RING

**Agenda de uma página · DAPL/DSSD → DSTD + SmartLegis · Maio 2026**

## Contexto em três frases

A Lei n.º 5-A/2026 obriga a documentar interlocutores e contributos no processo legislativo. Para tornar esta obrigação efetiva, a **DAPL/DSSD** desenhou um sistema de **quatro marcos bloqueantes** (M0/M1/M4/M5) cujo cumprimento é verificado pelo SmartLegis antes de autorizar a tramitação para RSE, CM e DR. **A consulta pública ocorre entre a RSE e o CM** — abre depois de M1 (Pré-RSE) com M2, encerra em M3, e só depois é validado M4 (Pré-CM); esta nova ordem altera o desenho anterior. O acoplamento entre os dois sistemas é assíncrono e criptográfico: a FPL Ponte emite um **JWS Ed25519** em cada marco; o SmartLegis verifica-o offline com a chave pública previamente entregue. Tudo o resto — diretório, SMTP, RTRI, ConsultaLEX, DRE — é não-bloqueante, com fallback manual. Documento completo: `docs/14_Questionario_Infraestrutura.md`.

## O que o nosso lado já entrega

Imagem Docker + `docker-compose` (Postgres/Redis/MinIO) · CSP/CSRF/2FA TOTP · spec do comprovativo fechada (`docs/12`) · adapters `mock`/`manual` para integrações · runbook (`docs/06`) · DPIA + threat models.

## Decisões bloqueantes (precisam de resposta antes da geração da chave)

| # | Decisão | Quem decide | Porquê é bloqueante |
|---|---|---|---|
| 1 | **Nome DNS interno definitivo** (sugestão `fpl.sggov.gov.pt`) | DSTD + DAPL/DSSD | Hardcoded no `iss` do JWS — mudar implica nova chave e nova distribuição |
| 2 | **Cofre de segredos** e modo da chave privada Ed25519 (HSM ou ficheiro 0600?) | DSTD | Afeta o módulo de assinatura |
| 3 | **Calendário do SmartLegis** para o verificador (T0 + 10 sem é viável até 27 jul?) | SmartLegis | Prazo legal de entrada em vigor |
| 4 | **Diretório interno** — LDAP/AD URL, base DN, conta de bind, mapeamento de grupos | DSTD | Sem isto fica em modo `local` (não escala) |
| 5 | **VLAN, firewall ingress/egress** e reverse proxy interno | DSTD | Sem ingress/proxy não há acesso; sem egress as integrações externas ficam em manual |
| 6 | **Validação NIS2 institucional** (CISO assina configuração + canal de notificação CNCS) | DSTD | Sem isto, o go-live não tem cobertura institucional NIS2 |

## Outras perguntas críticas (não bloqueantes mas urgentes)

**Serviços de dados:** Postgres 16 / Redis 7 / MinIO geridos pela DSTD ou container nosso?
**SMTP do Estado:** host, porta, endereço `From`, limites?
**RTRI da AR / DRE:** acordos de uso das APIs? Calendário? (ConsultaLEX agora coordenado internamente com a DSTD.)
**Distribuição da imagem:** GHCR → registry interno? Procedimento de promoção?
**Backups e retenção:** RPO/RTO? Storage WORM disponível para arquivo de 10 anos dos comprovativos?
**Monitorização:** Prometheus centralizado? AlertManager? Agregação de logs?
**Operação 24/7:** DSTD, DAPL/DSSD horário útil, ou modelo misto?
**Conformidade NIS2:** análise da aplicação face aos 10 requisitos do art. 21.º já feita em `docs/15` — 5 cumprem, 3 parciais, 1 a iniciar, 1 dependente, **nenhum em incumprimento**. Falta integração com processos institucionais: classificação como entidade essencial, CISO que valida, SOC/SIEM central, notificação de incidentes 24h/72h/1 mês, encriptação em repouso dos volumes. Detalhes em §15 do documento longo.

## O que o SmartLegis tem de desenvolver

1. **Verificador JWS Ed25519** (~6 semanas estimadas) — algoritmo em `docs/12 §4`. Bibliotecas standard, sem dependência síncrona da FPL Ponte.
2. **Regra de aceitação por estado** — submissão a RSE exige M0+M1 válidos; a CM exige +M4 (que pressupõe M3 internamente); publicação no DR exige +M5.
3. **Bloqueio com mensagem específica** quando falha (alg-recusado, kid-desconhecido, assinatura-invalida, expirado, ...).
4. **Validação contra os vetores de teste** TV1–TV6 antes do go-live (entregues pela FPL Ponte em `/api/.well-known/fpl-test-vectors.json`).

## Pedido concreto desta reunião

1. Calendarizar **resposta às 6 decisões bloqueantes** (proposta: 10 dias úteis).
2. Identificar o **ponto de contacto único na DSTD** para esta instalação.
3. Confirmar o **calendário do SmartLegis** ou identificar dependências que o ponham em risco.
4. Marcar **reunião técnica de seguimento** com a especificação do comprovativo (`docs/12`) aberta para Q&A.

## Prazo legal

**27 de julho de 2026** — entrada em vigor da Lei n.º 5-A/2026. Caminho crítico atual: instalação na RING + verificador no SmartLegis + ligação ao diretório + DPIA submetida à CNPD.

---
*Documento completo, perguntas detalhadas com impacto por decisão, e checklist de go-live em `docs/14_Questionario_Infraestrutura.md`.*
