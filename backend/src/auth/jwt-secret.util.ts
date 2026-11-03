export const MIN_JWT_SECRET_LENGTH = 32;

/**
 * Devuelve el JWT_SECRET validado o lanza un Error.
 * No existe ningún valor por defecto: sin un secret de al menos 32 caracteres la API no arranca
 * (ISO 27001 A.8.24 / SOC 2 CC6.1).
 */
export function resolveJwtSecret(rawSecret: string | undefined | null): string {
  const secret = (rawSecret ?? '').trim();
  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET ausente o demasiado corto (mínimo ${MIN_JWT_SECRET_LENGTH} caracteres). ` +
        'Generá uno con: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"',
    );
  }
  return secret;
}
