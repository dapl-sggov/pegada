// metrics.js — Métricas no formato de exposição do Prometheus.
// Implementação minimalista (sem dependências) suficiente para um único
// processo Node a correr atrás do reverse-proxy. Em produção, se for
// necessário escalar para multi-process, substitui-se pelo `prom-client`
// — a interface pública (`metricsHandler`, helpers) não muda.
//
// Métricas expostas:
//   • http_requests_total{method,route,status}        contador
//   • http_request_duration_seconds_bucket{...}       histograma
//   • fpl_marcos_validados_total{marco,resultado}     contador (preenchido por fpl.js)
//   • fpl_comprovativos_emitidos_total{marco}         contador (preenchido por comprovativo.js)
//   • fpl_estado_workflow{estado}                     gauge (snapshot por scrape)
//   • process_*                                       métricas standard do Node
//
// O endpoint /metrics deve estar restrito por firewall/reverse-proxy ao
// scraper interno. Não contém dados pessoais nem identificadores de FPL.

import { performance } from 'node:perf_hooks';
import { db } from './db.js';

// ---------------------------------------------------------------------------
// Estado em memória
// ---------------------------------------------------------------------------
const counters = new Map();   // chave canónica -> Number
const histograms = new Map(); // chave canónica -> { buckets, sum, count, _buckets }
const gauges = new Map();     // chave canónica -> Number (substituído a cada set)

// Buckets em segundos — alinhados com os SLAs do Memorando Executivo
const HTTP_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

// Separadores ASCII de controlo: não podem aparecer em nomes ou valores
const SEP_NAME = '';
const SEP_LABEL = '';

const startupTime = Date.now();

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

export function incCounter(name, labels = {}, value = 1) {
  const key = canonical(name, labels);
  counters.set(key, (counters.get(key) || 0) + value);
}

export function setGauge(name, labels, value) {
  gauges.set(canonical(name, labels), value);
}

export function observe(name, labels, valueSeconds, buckets = HTTP_BUCKETS) {
  const key = canonical(name, labels);
  let h = histograms.get(key);
  if (!h) {
    h = { buckets: new Map(buckets.map(b => [b, 0])), sum: 0, count: 0, _buckets: buckets };
    histograms.set(key, h);
  }
  h.sum += valueSeconds;
  h.count += 1;
  for (const b of h._buckets) if (valueSeconds <= b) h.buckets.set(b, h.buckets.get(b) + 1);
}

// ---------------------------------------------------------------------------
// Middleware HTTP
// ---------------------------------------------------------------------------

export function metricsMiddleware(req, res, next) {
  const t0 = performance.now();
  res.on('finish', () => {
    const route = sanitizarRota(req.route?.path || req.path || 'unknown');
    const labels = { method: req.method, route, status: String(res.statusCode) };
    incCounter('http_requests_total', labels);
    observe('http_request_duration_seconds', labels, (performance.now() - t0) / 1000);
  });
  next();
}

// ---------------------------------------------------------------------------
// Handler /metrics — formato de exposição Prometheus 0.0.4
// ---------------------------------------------------------------------------

export async function metricsHandler(req, res) {
  // snapshot dinâmico do estado de workflow das FPLs
  try {
    const rows = await db.all('SELECT estado_workflow, COUNT(*) as n FROM fpl GROUP BY estado_workflow');
    for (const r of rows) setGauge('fpl_estado_workflow', { estado: r.estado_workflow }, r.n);
  } catch { /* BD ainda não pronta — ignora */ }

  const lines = [];
  lines.push('# HELP fpl_uptime_seconds Tempo desde o arranque do processo.');
  lines.push('# TYPE fpl_uptime_seconds gauge');
  lines.push(`fpl_uptime_seconds ${(Date.now() - startupTime) / 1000}`);

  // Métricas standard do processo Node
  const mem = process.memoryUsage();
  lines.push('# HELP process_resident_memory_bytes Memória residente (RSS).');
  lines.push('# TYPE process_resident_memory_bytes gauge');
  lines.push(`process_resident_memory_bytes ${mem.rss}`);
  lines.push('# HELP process_heap_bytes Heap usada (V8).');
  lines.push('# TYPE process_heap_bytes gauge');
  lines.push(`process_heap_bytes ${mem.heapUsed}`);

  // Counters
  emitirSamples(lines, counters, 'counter');
  // Gauges
  emitirSamples(lines, gauges, 'gauge');

  // Histogramas
  for (const [k, h] of histograms) {
    const { name, labelStr, labelsObj } = parseKey(k);
    lines.push(`# HELP ${name} Latência observada (segundos).`);
    lines.push(`# TYPE ${name} histogram`);
    for (const [le, n] of h.buckets) {
      lines.push(`${name}_bucket${formatLabels({ ...labelsObj, le: String(le) })} ${n}`);
    }
    lines.push(`${name}_bucket${formatLabels({ ...labelsObj, le: '+Inf' })} ${h.count}`);
    lines.push(`${name}_sum${labelStr} ${h.sum}`);
    lines.push(`${name}_count${labelStr} ${h.count}`);
  }

  res.type('text/plain; version=0.0.4; charset=utf-8').send(lines.join('\n') + '\n');
}

function emitirSamples(lines, store, type) {
  const grouped = new Map();
  for (const [k, v] of store) {
    const { name, labelStr } = parseKey(k);
    if (!grouped.has(name)) grouped.set(name, []);
    grouped.get(name).push({ labelStr, v });
  }
  for (const [name, samples] of grouped) {
    lines.push(`# HELP ${name} Métrica de aplicação FPL Ponte.`);
    lines.push(`# TYPE ${name} ${type}`);
    for (const s of samples) lines.push(`${name}${s.labelStr} ${s.v}`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function canonical(name, labels) {
  const kvs = Object.keys(labels).sort().map(k => `${k}=${labels[k]}`).join(SEP_LABEL);
  return name + SEP_NAME + kvs;
}
function parseKey(key) {
  const [name, rest] = key.split(SEP_NAME);
  if (!rest) return { name, labelStr: '', labelsObj: {} };
  const labelsObj = {};
  for (const kv of rest.split(SEP_LABEL)) {
    const idx = kv.indexOf('=');
    if (idx > 0) labelsObj[kv.slice(0, idx)] = kv.slice(idx + 1);
  }
  return { name, labelStr: formatLabels(labelsObj), labelsObj };
}
function formatLabels(labels) {
  const keys = Object.keys(labels);
  if (!keys.length) return '';
  return '{' + keys.sort().map(k => `${k}="${escVal(labels[k])}"`).join(',') + '}';
}
function escVal(v) {
  return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}
function sanitizarRota(p) {
  // colapsa IDs em :id para evitar explosão de cardinalidade
  return p
    .replace(/\/[0-9a-f-]{8,}/gi, '/:id')
    .replace(/\/\d+/g, '/:n');
}

/** Reset interno — usado pelos testes. */
export function _resetMetrics() {
  counters.clear();
  histograms.clear();
  gauges.clear();
}
