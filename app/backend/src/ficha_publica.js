// ficha_publica.js — Geração da ficha pública em HTML estático.
//
// Lê o JSON canónico e produz um HTML autocontido (sem dependências
// externas) que pode ser servido a partir do portal do Governo ou de uma
// pasta SharePoint pública. O hash SHA-256 da publicação aparece no rodapé.

import { toCanonico } from './canonico.js';

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function dataPT(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' });
}

function bloco(titulo, conteudo) {
  if (!conteudo) return '';
  return `<section class="bloco"><h2>${esc(titulo)}</h2>${conteudo}</section>`;
}

function listaAudicoes(lista, vazia) {
  if (!lista?.length) return `<p class="vazio">${esc(vazia)}</p>`;
  return `<ol class="audicoes">${lista.map(a => `
    <li>
      <div class="entidade">${esc(a.entidade)}</div>
      ${a.base_legal ? `<div class="base-legal">${esc(a.base_legal)}</div>` : ''}
      <div class="estado estado-${esc(a.estado || 'PEDIDA')}">${esc(a.estado || 'PEDIDA')}</div>
      ${a.sintese_posicao ? `<div class="sintese"><strong>Posição:</strong> ${esc(a.sintese_posicao)}</div>` : ''}
      ${a.decisao_incorporacao ? `<div class="decisao"><strong>Decisão:</strong> ${esc(a.decisao_incorporacao)}</div>` : ''}
      ${a.justificacao_decisao ? `<div class="justificacao"><strong>Justificação:</strong> ${esc(a.justificacao_decisao)}</div>` : ''}
    </li>
  `).join('')}</ol>`;
}

/**
 * Gera HTML autocontido para uma FPL. Devolve string.
 * @param {string} fplId
 */
export async function gerarFichaPublica(fplId) {
  const c = await toCanonico(fplId);
  if (!c) throw new Error('FPL não encontrada');

  const integra = (c.blocos?.D3_integra || []).length;

  const html = `<!DOCTYPE html>
<html lang="pt-PT">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ficha de Pegada Legislativa · ${esc(c.numero_processo)}</title>
<style>
  :root { --azul:#004682; --gold:#b08020; --texto:#0c1729; --suave:#5b6478; --linha:#e1e4e8; --fundo:#fff; --fundo2:#f7f8fa; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: Georgia, 'Source Serif 4', serif; color: var(--texto); background: var(--fundo2); line-height: 1.55; }
  header.gov { background: var(--azul); color: #fff; padding: 18px 40px; }
  header.gov .kicker { font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; opacity: .9; font-family: -apple-system, Segoe UI, sans-serif; }
  header.gov h1 { font-size: 22px; font-weight: 500; margin: 4px 0 0; letter-spacing: -.3px; }
  main { max-width: 880px; margin: 0 auto; padding: 32px 40px; background: var(--fundo); border-left:1px solid var(--linha); border-right:1px solid var(--linha); }
  .meta { font-family: -apple-system, Segoe UI, sans-serif; font-size: 12px; color: var(--suave); border-bottom: 2px solid var(--gold); padding-bottom: 12px; margin-bottom: 24px; }
  .meta strong { color: var(--texto); }
  h2 { font-family: -apple-system, Segoe UI, sans-serif; font-size: 13px; letter-spacing: 1.2px; text-transform: uppercase; color: var(--azul); border-bottom: 1px solid var(--linha); padding-bottom: 6px; margin: 28px 0 12px; font-weight: 700; }
  .titulo-diploma { font-size: 26px; font-weight: 500; margin: 18px 0 8px; letter-spacing: -.4px; }
  .bloco { margin-bottom: 24px; }
  .bloco p { margin: 6px 0; }
  ol.audicoes { list-style: none; padding: 0; margin: 0; }
  ol.audicoes li { background: var(--fundo2); border-left: 3px solid var(--gold); padding: 12px 16px; margin-bottom: 10px; }
  ol.audicoes .entidade { font-weight: 600; font-size: 15px; }
  ol.audicoes .base-legal { font-size: 11px; color: var(--suave); margin-top: 2px; font-family: -apple-system, Segoe UI, sans-serif; }
  ol.audicoes .estado { display:inline-block; font-size: 10px; padding: 2px 8px; margin-top: 4px; background: #eef; color: var(--azul); font-weight: 600; letter-spacing: .5px; font-family: -apple-system, Segoe UI, sans-serif; }
  ol.audicoes .sintese, ol.audicoes .decisao, ol.audicoes .justificacao { font-size: 13px; margin-top: 8px; }
  .vazio { color: var(--suave); font-style: italic; font-size: 13px; }
  .cl-link { background: var(--azul); color:#fff; padding: 10px 14px; display: inline-block; text-decoration: none; font-family: -apple-system, Segoe UI, sans-serif; font-size: 12px; font-weight: 600; letter-spacing: .5px; text-transform: uppercase; }
  .cl-stats { font-family: -apple-system, Segoe UI, sans-serif; font-size: 13px; color: var(--suave); margin: 8px 0 12px; }
  .cl-stats strong { color: var(--texto); font-size: 16px; }
  footer.selo { background: var(--fundo2); border-top: 2px solid var(--gold); padding: 16px 40px; font-family: -apple-system, Segoe UI, sans-serif; font-size: 11px; color: var(--suave); max-width: 880px; margin: 0 auto; border-left:1px solid var(--linha); border-right:1px solid var(--linha); border-bottom:1px solid var(--linha); }
  footer.selo code { font-family: monospace; background: #fff; border: 1px solid var(--linha); padding: 2px 6px; word-break: break-all; }
  .integra-nota { background: #fffbeb; border: 1px solid #f5d77a; padding: 10px 14px; font-size: 12px; font-family: -apple-system, Segoe UI, sans-serif; color: #5b4500; }
  @media print { body{background:#fff} header.gov, footer.selo { color: #000; background: #fff; border-color: #000; } }
</style>
</head>
<body>
<header class="gov">
  <div class="kicker">República Portuguesa · Pegada Legislativa</div>
  <h1>${esc(c.gabinete.nome)}</h1>
</header>

<main>
  <div class="meta">
    <strong>${esc(c.numero_processo)}</strong> · ${esc(c.tipo_diploma)} ·
    ${esc(c.estado)} ·
    Versão ${esc(c.versao)} ·
    ${c.publicacao?.data ? 'Publicada a ' + esc(dataPT(c.publicacao.data)) : 'Em curso'}
    ${c.publicacao?.referencia_dr ? ' · ' + esc(c.publicacao.referencia_dr) : ''}
  </div>

  <h2>Identificação</h2>
  <div class="titulo-diploma">${esc(c.titulo)}</div>
  ${c.coproponentes?.length ? `<p><strong>Coproponentes:</strong> ${esc(c.coproponentes.join(', '))}</p>` : ''}

  ${bloco('Bloco B · Enquadramento', `
    ${c.blocos.B?.tipo_origem ? `<p><strong>Origem:</strong> ${esc(c.blocos.B.tipo_origem)}${c.blocos.B.referencia_origem ? ' (' + esc(c.blocos.B.referencia_origem) + ')' : ''}</p>` : ''}
    ${c.blocos.B?.sintese_problema ? `<p>${esc(c.blocos.B.sintese_problema)}</p>` : '<p class="vazio">Sem síntese registada.</p>'}
  `)}

  ${bloco('Bloco D.1 · Audições obrigatórias',
    listaAudicoes(c.blocos.D1_audicoes_obrigatorias, 'Sem audições obrigatórias registadas.'))}

  ${bloco('Bloco D.2 · Audições promovidas pelo GSEPCM',
    listaAudicoes(c.blocos.D2_audicoes_gsepcm, 'Sem audições discricionárias registadas.'))}

  ${integra ? bloco('Bloco D.3 · Contexto pré-legislativo (INTEGRA/UnIT)', `
    <div class="integra-nota">
      ${integra} interaç${integra === 1 ? 'ão' : 'ões'} registada${integra === 1 ? '' : 's'} no INTEGRA pelos gabinetes antes da entrada do diploma em processo legislativo.
      Os dados são da responsabilidade do gabinete que os registou no sistema da UnIT.
    </div>
  `) : ''}

  ${bloco('Bloco E · Consulta pública',
    c.blocos.E_consulta_publica?.cl_link
      ? `
        <p class="cl-stats">A consulta pública decorreu na plataforma ConsultaLex, com <strong>${esc(c.blocos.E_consulta_publica.cl_n_contributos ?? '—')}</strong> contributos recebidos.</p>
        <p><a class="cl-link" href="${esc(c.blocos.E_consulta_publica.cl_link)}">Abrir consulta na ConsultaLex →</a></p>
        ${c.blocos.E_consulta_publica.cl_sintese ? `<p><strong>Síntese e decisão sobre incorporação:</strong></p><p>${esc(c.blocos.E_consulta_publica.cl_sintese)}</p>` : ''}
      `
      : '<p class="vazio">Sem consulta pública registada.</p>'
  )}

  ${c.marcos.M5 ? bloco('Publicação', `
    <p><strong>Diário da República:</strong> ${esc(c.publicacao.referencia_dr || '—')}</p>
    <p><strong>Data:</strong> ${esc(dataPT(c.publicacao.data))}</p>
  `) : ''}
</main>

<footer class="selo">
  <strong>Selo de integridade</strong> · Ficha gerada a partir do JSON canónico do FPL Ponte (${esc(c.schema)}).<br>
  ${c.publicacao?.hash_sha256 ? `Hash SHA-256 da publicação: <code>${esc(c.publicacao.hash_sha256)}</code><br>` : ''}
  Documento gerado a ${esc(new Date().toLocaleString('pt-PT'))} · Operacionalização da Lei n.º 5-A/2026.
</footer>

</body>
</html>`;
  return html;
}
