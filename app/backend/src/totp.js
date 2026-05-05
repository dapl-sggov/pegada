// TOTP (RFC 6238) — implementação minimalista pure-JS para 2FA.
// Compatível com Google Authenticator, Authy, Microsoft Authenticator.

import crypto from 'node:crypto';

// Base32 (RFC 4648) para o secret partilhado
const B32_ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32encode(buf) {
  let bits = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += B32_ALPHA[parseInt(bits.slice(i, i + 5), 2)];
  }
  // padding optional
  return out;
}
function base32decode(s) {
  s = s.replace(/=+$/, '').toUpperCase().replace(/\s/g, '');
  let bits = '';
  for (const c of s) {
    const idx = B32_ALPHA.indexOf(c);
    if (idx < 0) continue;
    bits += idx.toString(2).padStart(5, '0');
  }
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    out.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(out);
}

export function generateSecret(bytes = 20) {
  return base32encode(crypto.randomBytes(bytes));
}

export function totpUri(account, issuer, secretB32) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret: secretB32, issuer, algorithm: 'SHA1', digits: '6', period: '30' });
  return `otpauth://totp/${label}?${params.toString()}`;
}

export function generateTotp(secretB32, t = Date.now()) {
  const counter = Math.floor(t / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter), 0);
  const key = base32decode(secretB32);
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24)
    | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8)
    | (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

export function verifyTotp(secretB32, token, window = 1) {
  if (!token || !/^\d{6}$/.test(token)) return false;
  const t = Date.now();
  for (let w = -window; w <= window; w++) {
    if (generateTotp(secretB32, t + w * 30 * 1000) === token) return true;
  }
  return false;
}
