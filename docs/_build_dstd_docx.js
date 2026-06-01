// _build_dstd_docx.js — gera docs/14_Pedido_DSTD.docx
import fs from 'node:fs';
import docxPkg from 'file:///C:/Users/jose.vidal/AppData/Roaming/npm/node_modules/docx/dist/index.cjs';
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, PageOrientation, LevelFormat,
  TabStopType, TabStopPosition, HeadingLevel, BorderStyle, WidthType, ShadingType,
  PageNumber, PageBreak, ExternalHyperlink, TableOfContents,
} = docxPkg;

// --- estilo base ---
const FONT = 'Calibri';
const COR_AZUL = '004682';
const COR_OURO = 'B08020';
const COR_LINHA = 'CCCCCC';
const COR_SUAVE = '5B6478';

const border = { style: BorderStyle.SINGLE, size: 4, color: COR_LINHA };
const cellBorders = { top: border, bottom: border, left: border, right: border };

const P = (text, opts = {}) =>
  new Paragraph({
    spacing: { after: 120, ...(opts.spacing || {}) },
    alignment: opts.alignment,
    children: [new TextRun({ text, bold: opts.bold, italics: opts.italics, color: opts.color, size: opts.size, font: FONT })],
  });

const Bullet = (text, level = 0) =>
  new Paragraph({
    numbering: { reference: 'bullets', level },
    spacing: { after: 80 },
    children: [new TextRun({ text, font: FONT, size: 22 })],
  });

const Check = (text) =>
  new Paragraph({
    numbering: { reference: 'checks', level: 0 },
    spacing: { after: 80 },
    children: [new TextRun({ text, font: FONT, size: 22 })],
  });

const H1 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 320, after: 160 },
    children: [new TextRun({ text, bold: true, size: 32, color: COR_AZUL, font: FONT })],
  });

const H2 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, size: 26, color: COR_AZUL, font: FONT })],
  });

const H3 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 180, after: 100 },
    children: [new TextRun({ text, bold: true, size: 23, color: COR_AZUL, font: FONT })],
  });

const HR = () =>
  new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COR_OURO, space: 8 } },
    spacing: { before: 80, after: 200 },
    children: [new TextRun({ text: '' })],
  });

function cell(text, opts = {}) {
  const runs = Array.isArray(text)
    ? text.map(t => new TextRun({ text: t.text, bold: t.bold, italics: t.italics, font: FONT, size: 20, color: t.color }))
    : [new TextRun({ text, bold: opts.bold, font: FONT, size: 20 })];
  return new TableCell({
    borders: cellBorders,
    shading: opts.shade ? { fill: opts.shade, type: ShadingType.CLEAR } : undefined,
    width: { size: opts.width, type: WidthType.DXA },
    margins: { top: 90, bottom: 90, left: 130, right: 130 },
    children: [new Paragraph({ alignment: opts.align, children: runs })],
  });
}

function table(headers, rows, widths) {
  const total = widths.reduce((a, b) => a + b, 0);
  const head = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => cell(h, { bold: true, shade: 'EAEFF4', width: widths[i] })),
  });
  const body = rows.map(r => new TableRow({
    children: r.map((c, i) => {
      if (typeof c === 'object' && c !== null) return cell(c.text, { ...c, width: widths[i] });
      return cell(c, { width: widths[i] });
    }),
  }));
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: widths,
    rows: [head, ...body],
  });
}

// --- conteúdo ---
const children = [];

// Capa
children.push(
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 1200, after: 240 },
    children: [new TextRun({ text: 'REPÚBLICA PORTUGUESA', bold: true, size: 18, color: COR_AZUL, font: FONT })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 60 },
    children: [new TextRun({ text: 'Secretaria-Geral do Governo', size: 18, color: COR_SUAVE, font: FONT })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 600 },
    children: [new TextRun({ text: 'Direção de Apoio à Pegada Legislativa (DAPL)', size: 18, color: COR_SUAVE, font: FONT })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
    border: { top: { style: BorderStyle.SINGLE, size: 12, color: COR_OURO, space: 12 }, bottom: { style: BorderStyle.SINGLE, size: 12, color: COR_OURO, space: 12 } },
    children: [
      new TextRun({ text: '\nPedido formal à DSTD\n', bold: true, size: 48, color: COR_AZUL, font: FONT, break: 1 }),
      new TextRun({ text: 'FPL Ponte v2.0 — Operacionalização da Pegada Legislativa\n', size: 24, color: COR_AZUL, font: FONT }),
      new TextRun({ text: 'ao abrigo da Lei n.º 5-A/2026\n\n', size: 24, italics: true, color: COR_SUAVE, font: FONT }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 600 },
    children: [new TextRun({ text: 'Junho de 2026 · Versão 2.0', italics: true, size: 20, color: COR_SUAVE, font: FONT })],
  }),
  new Paragraph({ children: [new PageBreak()] }),
);

// Cabeçalho do pedido
children.push(
  H1('Pedido formal à DSTD — FPL Ponte v2.0'),
);

const cabecalhoLinhas = [
  ['Para:', 'Direção de Serviços de Transformação Digital (DSTD), Secretaria-Geral do Governo'],
  ['De:', 'Divisão de Apoio ao Processo Legislativo (DAPL), Secretaria-Geral do Governo'],
  ['Versão:', '2.0 · Junho de 2026'],
  ['Assunto:', 'Provisionamento e integrações para o FPL Ponte, ao abrigo da Lei n.º 5-A/2026'],
];
for (const [k, v] of cabecalhoLinhas) {
  children.push(new Paragraph({
    spacing: { after: 80 },
    children: [
      new TextRun({ text: k + ' ', bold: true, font: FONT, size: 22 }),
      new TextRun({ text: v, font: FONT, size: 22 }),
    ],
  }));
}
children.push(HR());

// Sumário executivo
children.push(H2('Sumário executivo'));
children.push(P('A DAPL desenvolveu o FPL Ponte, uma aplicação web interna que operacionaliza a Pegada Legislativa do Governo durante o período transitório, até a funcionalidade ser incorporada no SmartLegis ou na Plataforma IntGov da UnIT (~2027).'));
children.push(P('O sistema é deliberadamente leve e temporário:', { bold: true }));
[
  '1 processo Node.js, ~1500 linhas de código',
  '1 ficheiro SQLite (uns MB ao longo da vida útil)',
  'Apenas duas dependências runtime (express, cookie-parser)',
  'Sem Redis, sem Postgres, sem SMTP outbox, sem workers de polling',
  'Substituibilidade garantida via JSON canónico (fpl-ponte/v1)',
].forEach(t => children.push(Bullet(t)));

children.push(P('Para o sistema arrancar em produção, precisamos da DSTD em três frentes:', { bold: true, spacing: { before: 180 } }));
[
  'Infraestrutura mínima — uma VM Linux pequena na RING.',
  'Autenticação Microsoft 365 (Entra ID) — aplicação registada no tenant gov.pt + credenciais OIDC.',
  'Integrações leves — ConsultaLex (gerida pela DSTD) e acesso à pasta OneDrive da UnIT (INTEGRA).',
].forEach(t => children.push(new Paragraph({
  numbering: { reference: 'numbers', level: 0 },
  spacing: { after: 80 },
  children: [new TextRun({ text: t, font: FONT, size: 22 })],
})));

children.push(P('Nenhuma destas peças exige desenvolvimento substancial do vosso lado — a maioria é provisionamento e fornecimento de credenciais. Detalhamos abaixo, com respostas que precisamos por escrito e prazos sugeridos para alinhar com o calendário legal (julho de 2026).', { spacing: { before: 120 } }));
children.push(HR());

// §1 Infraestrutura
children.push(H2('1 · Infraestrutura'));
children.push(H3('1.1 Servidor de aplicação'));
children.push(P('Pedido:'));
children.push(table(
  ['Item', 'Especificação mínima', 'Notas'],
  [
    ['Tipo', 'VM Linux (Ubuntu 24.04 LTS ou RHEL 9)', 'Acesso por SSH com chave'],
    ['CPU / RAM', '2 vCPU / 4 GB RAM', 'Suficiente para ~100 FPLs/ano'],
    ['Disco', '20 GB SSD', 'SQLite + anexos + logs'],
    ['Rede', 'Apenas intranet (RING)', 'Sem exposição internet pública'],
    ['Software', 'Node.js 22 LTS', 'Instalável via nvm ou dnf module'],
    ['Reverse-proxy', 'Nginx ou Apache em front, TLS terminação', 'Subdomínio sob gov.pt'],
  ],
  [1900, 4200, 3260],
));
children.push(P('O que precisamos por escrito:', { bold: true, spacing: { before: 240 } }));
[
  'Endereço IP interno + hostname provisionado',
  'Subdomínio sugerido (proposta: fpl.gov.pt ou pegada.sggoverno.gov.pt)',
  'Certificado TLS válido para esse hostname (CA do Governo)',
  'Credenciais SSH de operação (chave pública nossa + utilizador dedicado fpl-ponte)',
  'Política de backup da VM (snapshot diário?)',
  'Janela de manutenção contratada',
].forEach(t => children.push(Check(t)));
children.push(P('Prazo sugerido: 15 dias úteis após acordo.', { italics: true, spacing: { before: 120 } }));

children.push(H3('1.2 Pasta SharePoint para backup do JSON canónico'));
children.push(P('O sistema faz backup diário (automático, sem dependência de pessoas) do estado de todas as FPLs em formato JSON canónico. Em vez de usar Graph API (que exigiria mais credenciais + manutenção), preferimos escrever ficheiros numa pasta sincronizada por OneDrive na VM.'));
children.push(P('Pedido:', { bold: true }));
[
  'Provisionamento de uma site SharePoint dedicada: "FPL Ponte · Backup operacional"',
  'Pasta backup/ com permissões de escrita para a conta de serviço da VM',
  'Permissões de leitura para a equipa DAPL (auditoria e envio para Portal do Governo)',
  'Instalação do cliente OneDrive (sync) na VM, em modo headless',
  'Conta de serviço Entra ID dedicada (svc-fpl-ponte@sggoverno.gov.pt ou similar)',
].forEach(t => children.push(Check(t)));
children.push(P('Alternativa, se a DSTD preferir: pasta partilhada SMB/CIFS montada na VM. Para nós é indiferente — basta-nos um filesystem onde escrever JSON.', { italics: true }));
children.push(HR());

// §2 Entra ID
children.push(H2('2 · Autenticação (Entra ID / Microsoft 365)'));
children.push(P('O FPL Ponte autentica os utilizadores via OIDC contra o tenant Entra ID do Governo. Não fazemos federação à parte. Não há passwords nossas. Não há TOTP. A camada de identidade é a vossa.'));

children.push(H3('2.1 Registo da aplicação'));
children.push(P('Pedido:', { bold: true }));
[
  'Registar a aplicação no Entra ID do tenant gov.pt com:',
].forEach(t => children.push(Check(t)));
[
  ['Nome:', 'FPL Ponte'],
  ['Tipo:', 'Web application (server-side OIDC, não SPA)'],
  ['Redirect URI:', 'https://fpl.gov.pt/api/auth/entra/callback (ajustar consoante hostname final)'],
  ['Permissions delegadas:', 'openid, profile, email, User.Read (perfil básico)'],
  ['Sign-in audience:', 'Accounts in this organizational directory only'],
].forEach(([k, v]) => children.push(new Paragraph({
  indent: { left: 720 },
  spacing: { after: 60 },
  children: [
    new TextRun({ text: k + ' ', bold: true, font: FONT, size: 20 }),
    new TextRun({ text: v, font: FONT, size: 20 }),
  ],
})));
children.push(Check('Credenciais a entregar à DAPL (via canal seguro):'));
[
  'ENTRA_TENANT_ID',
  'ENTRA_CLIENT_ID',
  'ENTRA_CLIENT_SECRET (preferencialmente certificate-based para evitar rotação anual)',
].forEach(t => children.push(new Paragraph({
  indent: { left: 720 },
  spacing: { after: 60 },
  children: [new TextRun({ text: '• ' + t, font: FONT, size: 20 })],
})));

children.push(H3('2.2 Modelo de papéis'));
children.push(P('Não pedimos que o Entra ID controle os papéis aplicacionais. O FPL Ponte atribui papéis automaticamente:'));
children.push(Bullet('Pelo domínio do email: nome.apelido@<sigla>.gov.pt → PONTO_FOCAL do gabinete <sigla> (alinhado com a tabela XXV Governo).'));
children.push(Bullet('Por lista explícita (configurável): emails específicos da SGGOV recebem SGGOV_ADMIN ou SGGOV_QA.'));
children.push(P('Pedido (informativo, não bloqueante):', { bold: true, spacing: { before: 180 } }));
[
  'Confirmar que todos os colaboradores dos gabinetes ministeriais e SGGOV têm conta Entra no tenant gov.pt com o email no formato oficial.',
  'Lista de emails que devem ter papel SGGOV_ADMIN (atribuição manual; sugerimos 2 pessoas).',
].forEach(t => children.push(Check(t)));
children.push(P('Prazo sugerido: registo + credenciais em 10 dias úteis.', { italics: true, spacing: { before: 120 } }));
children.push(HR());

// §3 ConsultaLex
children.push(H2('3 · ConsultaLex'));
children.push(P('A DSTD também é responsável pelo ConsultaLex, plataforma onde decorrem as consultas públicas. Esta proximidade é uma vantagem operacional. Esclarecemos a opção tomada:'));

children.push(H3('3.1 Decisão: NÃO há integração técnica nossa com o ConsultaLex'));
children.push(P('Considerámos três opções:'));
children.push(table(
  ['Opção', 'Esforço', 'Risco', 'Decisão'],
  [
    ['Webhook ConsultaLex → FPL', 'Médio', 'Schema acoplado, manutenção contínua', { text: 'Rejeitado', bold: true }],
    ['Upload CSV manual dos contributos', 'Baixo', 'Duplicação de dados', { text: 'Rejeitado', bold: true }],
    ['Apenas link + síntese redigida pelo ponto focal', 'Mínimo', 'Nenhum (fonte autoritativa fica no ConsultaLex)', { text: 'Adotado', bold: true, color: '0F7858' }],
  ],
  [3200, 1400, 3360, 1400],
));
children.push(P('A ficha pública da FPL apresentará:', { spacing: { before: 240 } }));
[
  'O link direto para a consulta no ConsultaLex (o ponto focal copia do portal)',
  'O n.º de contributos recebidos',
  'A síntese e a decisão sobre incorporação (texto humano que é o que a Pegada Legislativa exige)',
].forEach(t => children.push(Bullet(t)));
children.push(P('Quem quiser ler os contributos brutos clica no link e vai ao ConsultaLex — que já oferece pesquisa, paginação, exportação. Não duplicamos.', { spacing: { before: 120 } }));

children.push(H3('3.2 O que precisamos da DSTD sobre o ConsultaLex'));
children.push(P('Mesmo sem integração técnica, precisamos de três alinhamentos:'));
[
  'Padrão de URL. Confirmar a estrutura canónica do link de uma consulta para o ponto focal saber o que copiar. Exemplo desejado: https://consulta.lex.pt/processos/<id-processo>',
  'Vida útil do link. Os links permanecem acessíveis publicamente após o encerramento da CP? (Esperamos que sim, mas convém confirmar — a ficha pública FPL aponta para eles indefinidamente.)',
  'Catálogo de consultas ativas. É possível ter uma página consulta.lex.pt/consultas-ativas ou um feed estruturado, para o ponto focal pesquisar e confirmar antes de colar o link? Não é bloqueante — só ajuda a evitar erros.',
].forEach(t => children.push(Check(t)));

children.push(H3('3.3 Roadmap conjunto (informativo)'));
children.push(P('Antecipamos que na Plataforma IntGov / SmartLegis será desejável uma integração mais estreita ConsultaLex ↔ Pegada (passar referências, sincronizar n.º de contributos, anexar contributos como anexos da ficha). Esse trabalho de design conjunto é para 2027 — agora, o link basta.'));
children.push(HR());

// §4 INTEGRA — acesso à pasta OneDrive da UnIT
children.push(H2('4 · INTEGRA (UnIT) — acesso à pasta OneDrive na RING'));
children.push(P('O INTEGRA é o sistema preparado pela Unidade de Integridade e Transparência (UnIT) da SG-Governo. A tab "Pegada legislativa" do INTEGRA é preenchida pelo gabinete quando o ato legislativo já está em pipeline; cada entrada inclui o número de diploma SmartLegis, o que permite ao FPL Ponte associá-la à FPL correta no Bloco D.3.'));

children.push(H3('4.1 Cenário operacional já acordado entre DAPL e UnIT'));
[
  'O INTEGRA exporta o conteúdo da tab "Pegada legislativa" em JSON.',
  'Os ficheiros JSON ficam numa pasta OneDrive da UnIT, sincronizada na RING.',
  'O FPL Ponte lê periodicamente essa pasta, filtra as entradas pelo número de diploma SmartLegis, e popula o Bloco D.3 da FPL correspondente.',
  'A DAPL combinará diretamente com a UnIT o schema do JSON e a confirmação do campo "número de diploma SmartLegis" por entrada — não é matéria DSTD.',
].forEach(t => children.push(Bullet(t)));

children.push(H3('4.2 O que precisamos da DSTD'));
children.push(P('Permitir e configurar o acesso técnico da VM do FPL Ponte à pasta OneDrive da UnIT, em modo leitura:', { bold: true }));
[
  'Conta de serviço (svc-fpl-ponte@sggoverno.gov.pt ou equivalente) com permissão de leitura na site SharePoint/OneDrive da UnIT onde os JSONs do INTEGRA ficam disponíveis.',
  'Método operacional preferido pela DSTD para expor a pasta à VM: (a) cliente OneDrive em modo headless montado na VM com a referida conta de serviço, ou (b) partilha SMB/CIFS sobre a mesma pasta. Para nós é indiferente — qualquer um basta.',
  'Caminho exato da pasta (URL SharePoint ou caminho de rede), uma vez provisionado.',
  'Cadência de sincronização — assumimos near-real-time via cliente OneDrive (típico de poucos minutos); confirmação ou alternativa.',
].forEach(t => children.push(Check(t)));
children.push(P('Não pedimos que a DSTD desenvolva conectores, ETL, ou que toque no INTEGRA. A integração é uma leitura de ficheiros JSON num filesystem partilhado.', { italics: true, spacing: { before: 120 } }));
children.push(HR());

// §5 Riscos
children.push(H2('5 · Riscos do nosso lado e mitigações'));
children.push(table(
  ['Risco', 'Impacto', 'Mitigação'],
  [
    ['Entra ID atrasa', 'Sem login institucional', 'Driver mock continua a permitir acessos demo na intranet; pilotamos com 2-3 gabinetes'],
    ['ConsultaLex muda URLs', 'Links na ficha pública partidos', 'Detectamos via monitorização manual; ficamos sem dados novos mas os antigos sobrevivem nos JSONs de backup'],
    ['Pasta OneDrive UnIT inacessível à VM', 'Bloco D.3 fica vazio', 'A ficha pública mantém-se válida com D.1 + D.2 + E; D.3 é informativo. Acompanhamento via DAPL ↔ UnIT em paralelo'],
    ['VM cai', 'Indisponibilidade', 'Snapshot diário + restore em ~1 hora. Para ~100 FPLs/ano é aceitável'],
    ['SQLite corrompe', 'Perda parcial de dados', 'Backup diário do JSON canónico em SharePoint permite restore via POST /api/import/canonico'],
  ],
  [2700, 2500, 4160],
));
children.push(HR());

// §6 Calendário
children.push(H2('6 · Calendário sugerido'));
children.push(table(
  ['Semana', 'Marco', 'Responsável'],
  [
    ['Sem. 1', 'Reunião DSTD + DAPL (kick-off)', 'DSTD + DAPL'],
    ['Sem. 2', 'Provisão VM + subdomínio + TLS', 'DSTD'],
    ['Sem. 2', 'Registo Entra ID + credenciais', 'DSTD'],
    ['Sem. 3', 'Provisão pasta SharePoint (backup FPL)', 'DSTD'],
    ['Sem. 3', 'Acesso da VM à pasta OneDrive da UnIT', 'DSTD'],
    ['Sem. 4', 'Instalação FPL Ponte na VM', 'DAPL'],
    ['Sem. 4', 'Smoke test integrado', 'DAPL + DSTD'],
    ['Sem. 5', 'Piloto com 3 gabinetes (MAEN, MS, MJ)', 'DAPL'],
    ['Sem. 6', 'Roll-out total', 'DAPL'],
    [{ text: '27 jul', bold: true, color: 'A71728' }, { text: 'Data legal de entrada em vigor da Lei 5-A/2026', bold: true }, '—'],
  ],
  [1400, 5800, 2160],
));
children.push(HR());

// §7 Pontos de decisão
children.push(H2('7 · Pontos de decisão para a reunião'));
children.push(P('Pontos a discutir e fechar com a DSTD:'));
[
  'Hosting: VM dedicada na DSTD ou Azure Gov App Service? (Recomendamos VM, mais barato e mais simples de operar.)',
  'Subdomínio final: fpl.gov.pt, pegada.sggoverno.gov.pt, ou outro?',
  'Conta de serviço Entra: existe um padrão DSTD para contas de serviço (svc-…)?',
  'Acesso da VM à pasta OneDrive da UnIT: método operacional preferido (cliente OneDrive na VM com conta de serviço, ou partilha SMB/CIFS sobre a mesma pasta)?',
  'Permissões para o ConsultaLex: queremos referenciar consultas em ficha pública mesmo após encerramento. Confirmado?',
  'Saída do sistema: quando o SmartLegis ou IntGov receberem a funcionalidade, fica acordado que entregamos um único JSON canónico e arquivamos a VM. Necessitamos validação por parte do dono do sucessor.',
].forEach((t, i) => children.push(new Paragraph({
  numbering: { reference: 'numbers', level: 0 },
  spacing: { after: 100 },
  children: [new TextRun({ text: t, font: FONT, size: 22 })],
})));
children.push(HR());

// Anexo A
children.push(H2('Anexo A · Quem precisa de aceder ao quê'));
children.push(table(
  ['Quem', 'O quê', 'Como'],
  [
    ['Pontos focais dos gabinetes', 'App FPL Ponte (criar/editar FPLs do seu gabinete)', 'Entra ID, domínio do email determina papel'],
    ['GSEPCM', 'App FPL Ponte (ver tudo, aprovar CM, registar DR)', 'Entra ID, papel atribuído por lista'],
    ['SGGOV/DAPL', 'App FPL Ponte (admin, auditoria, export)', 'Entra ID, papel atribuído por lista'],
    ['Cidadão', 'Ficha pública de FPLs publicadas', 'Servida estaticamente pelo portal do Governo (sem conta)'],
    ['Auditoria interna', 'Pasta SharePoint com backup JSON', 'Permissão SharePoint'],
  ],
  [2400, 3500, 3460],
));

// Anexo B
children.push(H2('Anexo B · Inventário técnico (referência)'));
[
  'Código-fonte: app/backend/ + app/frontend/ (repositório DAPL)',
  'Schema BD: app/backend/src/migrate.js (12 tabelas SQLite)',
  'JSON canónico: app/backend/src/canonico.js (versão fpl-ponte/v1)',
  'Documentação operacional: docs/06_Operacao.md',
  'Arquitetura: docs/02_Arquitetura.md',
].forEach(t => children.push(Bullet(t)));
children.push(P('Versão atual do FPL Ponte: v2.0.0-simplificado · 1 de junho de 2026.', { bold: true, spacing: { before: 180 } }));

children.push(HR());
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 200 },
  children: [new TextRun({ text: 'Documento preparado pela DAPL/SGGOV para a reunião com a DSTD.', italics: true, font: FONT, size: 18, color: COR_SUAVE })],
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 60 },
  children: [new TextRun({ text: 'Contacto principal: Bernardo Vidal · bernardomvidal@gmail.com', italics: true, font: FONT, size: 18, color: COR_SUAVE })],
}));

// --- documento ---
const doc = new Document({
  creator: 'DAPL/SGGOV',
  title: 'Pedido formal à DSTD — FPL Ponte v2.0',
  description: 'Provisionamento e integrações para o FPL Ponte ao abrigo da Lei n.º 5-A/2026',
  styles: {
    default: { document: { run: { font: FONT, size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 32, bold: true, font: FONT, color: COR_AZUL },
        paragraph: { spacing: { before: 320, after: 160 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 26, bold: true, font: FONT, color: COR_AZUL },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 23, bold: true, font: FONT, color: COR_AZUL },
        paragraph: { spacing: { before: 180, after: 100 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [
      { reference: 'bullets', levels: [
        { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
      ]},
      { reference: 'numbers', levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
      ]},
      { reference: 'checks', levels: [
        { level: 0, format: LevelFormat.BULLET, text: '☐', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
      ]},
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 }, // A4
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          tabStops: [{ type: TabStopType.RIGHT, position: 9026 }],
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: COR_OURO, space: 6 } },
          children: [
            new TextRun({ text: 'FPL Ponte v2.0 · Pedido formal à DSTD', font: FONT, size: 18, color: COR_SUAVE }),
            new TextRun({ text: '\tDAPL · Junho de 2026', font: FONT, size: 18, color: COR_SUAVE }),
          ],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: 'Página ', font: FONT, size: 18, color: COR_SUAVE }),
            new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: COR_SUAVE }),
            new TextRun({ text: ' de ', font: FONT, size: 18, color: COR_SUAVE }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 18, color: COR_SUAVE }),
          ],
        })],
      }),
    },
    children,
  }],
});

const out = '14_Pedido_DSTD.docx';
Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(out, buf);
  console.log(`✓ ${out} (${(buf.length / 1024).toFixed(1)} KB)`);
});
