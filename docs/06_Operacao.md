# Operação — FPL Ponte v2.0

**Junho 2026**

## Tarefas diárias

| Quem | O quê | Quando |
|---|---|---|
| Ponto focal | Criar/atualizar FPL, registar audições, importar JSON INTEGRA, validar marcos | Ao longo do ciclo de cada diploma |
| GSEPCM | Aprovar FPLs em CM, registar referência DR | Antes do CM e na sequência |
| SGGOV_QA | Rever FPLs, pedir correções via audit log | Pós-CP e pré-M4 |
| SGGOV_ADMIN | Gestão de utilizadores e gabinetes | Pontualmente |
| Sistema | Backup diário do JSON canónico para SharePoint | Automático |

## Comandos úteis

```bash
npm run migrate         # idempotente
npm run seed            # dados demo (DEV apenas)
npm run backup          # forçar backup agora
```

## Monitorização

- **Health check:** `GET /health` → `{"ok":true,...}`.
- **Logs:** stdout (em produção via journalctl).
- **Métricas:** nenhuma. Para 100 FPLs/ano, não precisamos de Prometheus.

## Backup

- Automático: 1 minuto após o arranque, depois a cada 24 horas.
- Output: `${BACKUP_DIR}/YYYY-MM-DD/fpl-<numero_processo>.json` + `_index.json`.
- Em produção: pasta sincronizada com SharePoint via cliente OneDrive.
- Verificação: o admin valida mensalmente que a pasta tem ficheiros recentes.

## Recuperação

1. Reinstalar VM, Node 22, código.
2. Restaurar `data/fpl.sqlite` do snapshot.
3. `npm install && npm start`.

Se o SQLite for irrecuperável:
1. `npm run migrate`.
2. Para cada JSON canónico no backup: `POST /api/import/canonico`.
3. Validar em `/api/admin/dashboard`.

## Saída para o sucessor

```bash
curl -b cookies https://fpl.gov.pt/api/export/canonicos > fpl-export.json
```

Esse ficheiro é o que se entrega à equipa que migra. Schema `fpl-ponte/v1`.

Após confirmação: marcar FPLs como `ARQUIVADO`, decomissionar VM, arquivar `data/` + último backup.

Tempo esperado: 1-2 dias.

## Segurança

- TLS na borda (reverse-proxy DSTD com cert da CA do Governo).
- CSRF double-submit cookie em todas as rotas mutadoras.
- Rate-limit in-memory: 240 req/min/IP, 5 logins/email/5 min.
- Bloqueio de conta após 8 falhas em 30 minutos.
- Anexos limitados a 20 MB, armazenados com SHA-256.

Sem TOTP. Sem Cartão de Cidadão. Sem federação simulada. Identidade = Entra ID Gov; rede = intranet do Governo.
