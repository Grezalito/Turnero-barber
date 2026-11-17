/** Prefijo del placeholder de backend/.env.example; nunca debe usarse como contraseña real. */
export const SUPERADMIN_PASSWORD_PLACEHOLDER_PREFIX = 'CAMBIAR_';

export interface SuperAdminCredentials {
  dni: string;
  password: string;
}

/**
 * Devuelve las credenciales del SuperAdmin o lanza un Error con un mensaje claro.
 * No existe ningún valor por defecto, en ningún entorno (ISO 27001 A.5.17 / SOC 2 CC6.1).
 */
export function resolveSuperAdminCredentials(
  env: NodeJS.ProcessEnv = process.env,
): SuperAdminCredentials {
  const dni = (env.SUPERADMIN_DNI ?? '').trim();
  const password = env.SUPERADMIN_PASSWORD ?? '';

  const missing = [
    !dni && 'SUPERADMIN_DNI',
    !password.trim() && 'SUPERADMIN_PASSWORD',
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(
      `Faltan variables de entorno obligatorias del SuperAdmin: ${missing.join(', ')}. ` +
        'Definilas en backend/.env (ver backend/.env.example). No hay valores por defecto.',
    );
  }

  if (password.toUpperCase().startsWith(SUPERADMIN_PASSWORD_PLACEHOLDER_PREFIX)) {
    throw new Error(
      'SUPERADMIN_PASSWORD todavía tiene el placeholder de .env.example. Definí una contraseña real en backend/.env.',
    );
  }

  return { dni, password };
}
