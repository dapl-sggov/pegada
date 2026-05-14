// comprovativo.js — Comprovativo criptográfico de validação de marco.
//
// Em cada marco bloqueante (M0, M3, M4, M5) a aplicação emite um JWS compacto
// assinado com Ed25519. O SmartLegis verifica-o offline com a chave pública
// partilhada e bloqueia a tramitação se a verificação falhar — sem integração
// síncrona entre os sistemas (Memorando Executivo, Princípio 2 · RCM v2, n.º 4).
//
// Formato:  base64url(header) . base64url(payload) . base64url(assinatura)
//   header  = { alg:"EdDSA", typ:"fpl-comprovativo+jws", kid:"..." }
//   payload = { iss, sub, fpl_id, marco, validado_em, validado_por,
//               snapshot_hash, jti, iat, exp }

import crypto from 'node:crypto';
import fs from 'node:fs';
import { db } from './db.js';
import config from './config.js';
import { uuid } from './util.js';

let _privateKey = null;   // crypto.KeyObject
let _publicKey = null;    // crypto.KeyObject
let _kid = null;

// ---------------------------------------------------------------------------
// base64url
// ---------------------------------------------------------------------------
const b64u = (buf) => Buffer.from(buf).toString('base64')
  .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const b64uJson = (obj) => b64u(Buffer.from(JSON.stringify(obj), 'utf8'));
const fromB64u = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

// ---------------------------------------------------------------------------
// Inicialização — carrega ou gera o par de chaves Ed25519
// ---------------------------------------------------------------------------
export async function initComprovativo() {
  const cfg = config.comprovativo;
  _kid = cfg.keyId;

  let privatePem = cfg.privateKeyPem;
  if (!privatePem && cfg.privateKeyPath) {
    if (fs.existsSync(cfg.privateKeyPath)) {
      privatePem = fs.readFileSync(cfg.privateKeyPath, 'utf8');
    }
  }

  if (privatePem) {
    _privateKey = crypto.createPrivateKey(privatePem);
    _publicKey = crypto.createPublicKey(_privateKey);
  } else if (cfg.allowEphemeralDevKey) {
    // Desenvolvimento: gera um par efémero ao arranque. Os comprovativos
    // emitidos não sobrevivem a um reinício — aceitável só em dev.
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    _privateKey = privateKey;
    _publicKey = publicKey;
    _kid = cfg.keyId + '-ephemeral';
    console.warn('[comprovativo] AVISO: chave Ed25519 efémera gerada — apenas para desenvolvimento. Defina COMPROVATIVO_PRIVATE_KEY_PATH em produção.');
  } else {
    throw new Error('Chave privada do comprovativo em falta (COMPROVATIVO_PRIVATE_KEY_PEM ou _PATH).');
  }

  // Regista/atualiza a chave pública na base de dados (para o endpoint JWKS)
  const jwk = _publicKey.export({ format: 'jwk' });
  await db.run(
    `INSERT INTO chave_assinatura (kid, algoritmo, chave_publica, ativa)
     VALUES (?, 'EdDSA', ?, 1)
     ON CONFLICT (kid) DO UPDATE SET chave_publica = excluded.chave_publica, ativa = 1`,
    [_kid, JSON.stringify(jwk)]
  ).catch(async () => {
    // SQLite antigo sem UPSERT por ON CONFLICT no formato acima — fallback
    const ex = await db.get('SELECT kid FROM chave_assinatura WHERE kid = ?', [_kid]);
    if (ex) await db.run('UPDATE chave_assinatura SET chave_publica = ?, ativa = 1 WHERE kid = ?', [JSON.stringify(jwk), _kid]);
    else await db.run('INSERT INTO chave_assinatura (kid, algoritmo, chave_publica, ativa) VALUES (?, ?, ?, 1)', [_kid, 'EdDSA', JSON.stringify(jwk)]);
  });

  return { kid: _kid, algoritmo: 'EdDSA' };
}

// ---------------------------------------------------------------------------
// Hash canónico do estado da FPL no momento da validação
// ---------------------------------------------------------------------------
export function snapshotHash(snapshotObj) {
  // Serialização determinística simples: ordena chaves de topo.
  const canon = JSON.stringify(snapshotObj, Object.keys(snapshotObj).sort());
  return 'sha256:' + crypto.createHash('sha256').update(canon, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// Emissão
// ---------------------------------------------------------------------------
export async function emitirComprovativo({ fpl, marco, user, snapshot }) {
  if (!_privateKey) throw new Error('Módulo de comprovativo não inicializado.');
  const jti = 'cmp_' + marco + '-' + crypto.randomBytes(9).toString('base64url');
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + config.comprovativo.ttlDias * 86400;
  const validado_por = (user.papeis?.find(p => p.gabinete_id)?.papel || user.papeis?.[0]?.papel || 'PONTO_FOCAL')
    + ':' + (fpl.gabinete_id || 'sggov');
  const hash = snapshotHash(snapshot || { id: fpl.id, estado: fpl.estado_workflow, marco });

  const header = { alg: 'EdDSA', typ: 'fpl-comprovativo+jws', kid: _kid };
  const payload = {
    iss: config.comprovativo.issuer,
    sub: fpl.numero_processo,
    fpl_id: fpl.id,
    marco,
    validado_em: new Date().toISOString(),
    validado_por,
    snapshot_hash: hash,
    jti, iat, exp,
  };
  const signingInput = b64uJson(header) + '.' + b64uJson(payload);
  const signature = crypto.sign(null, Buffer.from(signingInput, 'utf8'), _privateKey);
  const jws = signingInput + '.' + b64u(signature);

  await db.run(
    `INSERT INTO comprovativo
       (jti, fpl_id, numero_processo, marco, validado_por, snapshot_hash, kid, jws, emitido_em, expira_em, estado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'VALIDO')`,
    [jti, fpl.id, fpl.numero_processo, marco, validado_por, hash, _kid, jws,
     payload.validado_em, new Date(exp * 1000).toISOString()]
  );
  return { jti, marco, jws, kid: _kid, emitido_em: payload.validado_em, payload };
}

// ---------------------------------------------------------------------------
// Verificação (a mesma lógica que o SmartLegis executa, offline)
// ---------------------------------------------------------------------------
export async function verificarComprovativo(jws) {
  try {
    const parts = String(jws).split('.');
    if (parts.length !== 3) return { valido: false, erro: 'Formato JWS inválido' };
    const [h, p, s] = parts;
    const header = JSON.parse(fromB64u(h).toString('utf8'));
    const payload = JSON.parse(fromB64u(p).toString('utf8'));
    if (header.alg !== 'EdDSA') return { valido: false, erro: 'Algoritmo não suportado' };

    // Seleciona a chave pública pelo kid
    const chave = await db.get('SELECT chave_publica FROM chave_assinatura WHERE kid = ?', [header.kid]);
    if (!chave) return { valido: false, erro: 'kid desconhecido: ' + header.kid };
    const pubKey = crypto.createPublicKey({ key: JSON.parse(chave.chave_publica), format: 'jwk' });

    const signingInput = h + '.' + p;
    const ok = crypto.verify(null, Buffer.from(signingInput, 'utf8'), pubKey, fromB64u(s));
    if (!ok) return { valido: false, erro: 'Assinatura inválida' };
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return { valido: false, erro: 'Comprovativo expirado', payload };
    }
    // Estado de revogação (consulta opcional — o SmartLegis pode ou não fazer)
    const rec = await db.get('SELECT estado FROM comprovativo WHERE jti = ?', [payload.jti]);
    const estado = rec ? rec.estado : 'DESCONHECIDO';
    return { valido: estado === 'VALIDO' || estado === 'DESCONHECIDO', estado, payload, header };
  } catch (e) {
    return { valido: false, erro: e.message };
  }
}

// ---------------------------------------------------------------------------
// Consulta e gestão
// ---------------------------------------------------------------------------
export async function listarComprovativos(fplId) {
  return db.all(
    'SELECT jti, marco, validado_por, kid, emitido_em, expira_em, estado FROM comprovativo WHERE fpl_id = ? ORDER BY emitido_em',
    [fplId]
  );
}

export async function getComprovativo(jti) {
  return db.get('SELECT * FROM comprovativo WHERE jti = ?', [jti]);
}

export async function revogarComprovativo(jti, motivo, novoEstado = 'REVOGADO') {
  await db.run(
    'UPDATE comprovativo SET estado = ?, revogado_em = ?, motivo_revogacao = ? WHERE jti = ?',
    [novoEstado, new Date().toISOString(), motivo || null, jti]
  );
}

// Substitui os comprovativos válidos de uma FPL (ex.: após pedido de correção QA)
export async function substituirComprovativosFpl(fplId, motivo) {
  await db.run(
    "UPDATE comprovativo SET estado = 'SUBSTITUIDO', revogado_em = ?, motivo_revogacao = ? WHERE fpl_id = ? AND estado = 'VALIDO'",
    [new Date().toISOString(), motivo || 'FPL alterada após emissão', fplId]
  );
}

// ---------------------------------------------------------------------------
// JWKS — chaves públicas para o SmartLegis consumir
// ---------------------------------------------------------------------------
export async function getJwks() {
  const chaves = await db.all('SELECT kid, chave_publica FROM chave_assinatura WHERE ativa = 1');
  return {
    keys: chaves.map(c => {
      const jwk = JSON.parse(c.chave_publica);
      return { ...jwk, kid: c.kid, alg: 'EdDSA', use: 'sig' };
    }),
  };
}

export const MARCOS_COM_COMPROVATIVO = config.comprovativo.marcosBloqueantes;
