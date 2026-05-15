// auth-helpers.js — Funções puras de hashing partilhadas entre auth.js
// e diretorio.js (evita ciclos de import).

import bcrypt from 'bcryptjs';
import config from './config.js';

export async function hashPassword(plain) {
  return bcrypt.hash(plain, config.auth.bcryptRounds);
}
export async function verifyPassword(plain, hash) {
  if (!plain || !hash) return false;
  // bcryptjs lança se o hash não for um hash válido — proteger:
  try { return await bcrypt.compare(plain, hash); }
  catch { return false; }
}
