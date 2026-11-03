import * as crypto from 'crypto';

/**
 * Token de bloqueo de turno: secreto de 256 bits que solo conoce el cliente que bloqueó el slot.
 * En la base se guarda únicamente su SHA-256 (`lock_token_hash`), nunca el token en claro.
 */
export function generateLockToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, hash: hashLockToken(token) };
}

export function hashLockToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Formato válido de un lockToken emitido por generateLockToken (43 chars base64url). */
export function isWellFormedLockToken(token: unknown): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}
