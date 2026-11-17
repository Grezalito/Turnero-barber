/**
 * Configuración de la documentación OpenAPI (Swagger UI) expuesta en /docs.
 *
 * DOCS_ENABLED:
 * - "true"/"1"/"yes"/"on"   → habilitada
 * - "false"/"0"/"no"/"off"  → deshabilitada
 * - sin definir / vacía     → habilitada fuera de producción, deshabilitada con NODE_ENV=production
 * Cualquier otro valor aborta el arranque (evita habilitarla por un typo).
 */
export const DOCS_PATH = 'docs';

const TRUE_VALUES = ['true', '1', 'yes', 'on'];
const FALSE_VALUES = ['false', '0', 'no', 'off'];

export function isDocsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env.DOCS_ENABLED ?? '').trim().toLowerCase();
  if (raw === '') {
    return (env.NODE_ENV ?? '').trim().toLowerCase() !== 'production';
  }
  if (TRUE_VALUES.includes(raw)) return true;
  if (FALSE_VALUES.includes(raw)) return false;
  throw new Error(
    `DOCS_ENABLED inválido ("${env.DOCS_ENABLED}"). Usá "true" o "false" (vacío = apagado en producción).`,
  );
}

/** Rutas servidas por SwaggerModule: /docs, /docs/<assets>, /docs-json, /docs-yaml. */
export function isDocsPath(rawPath: string): boolean {
  const path = (rawPath || '').split('?')[0];
  return (
    path === `/${DOCS_PATH}` ||
    path.startsWith(`/${DOCS_PATH}/`) ||
    path === `/${DOCS_PATH}-json` ||
    path === `/${DOCS_PATH}-yaml`
  );
}

/**
 * CSP estricta de la API (JSON puro): no permite cargar ningún recurso.
 */
export const API_CSP =
  "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

/**
 * CSP relajada SOLO para Swagger UI: scripts y estilos propios, estilos inline
 * (el HTML de Swagger UI los usa), imágenes data: (íconos SVG) y fetch al mismo origen
 * para /docs-json y "Try it out". Sin 'unsafe-eval' ni scripts inline.
 */
export const DOCS_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');
