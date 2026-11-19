/**
 * Configuración del endpoint de métricas Prometheus (GET /metrics).
 *
 * METRICS_ENABLED:
 * - "true"/"1"/"yes"/"on"   → habilitado
 * - "false"/"0"/"no"/"off"  → deshabilitado
 * - sin definir / vacío     → habilitado fuera de producción, deshabilitado con NODE_ENV=production
 * Cualquier otro valor aborta el arranque (evita habilitarlo por un typo).
 *
 * /metrics no tiene autenticación: en producción sólo debe habilitarse cuando el
 * puerto no sea público (p. ej. Service ClusterIP dentro de Kubernetes).
 */
export const METRICS_PATH = "metrics";

const TRUE_VALUES = ["true", "1", "yes", "on"];
const FALSE_VALUES = ["false", "0", "no", "off"];

export function isMetricsEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = (env.METRICS_ENABLED ?? "").trim().toLowerCase();
  if (raw === "") {
    return (env.NODE_ENV ?? "").trim().toLowerCase() !== "production";
  }
  if (TRUE_VALUES.includes(raw)) return true;
  if (FALSE_VALUES.includes(raw)) return false;
  throw new Error(
    `METRICS_ENABLED inválido ("${env.METRICS_ENABLED}"). Usá "true" o "false" (vacío = apagado en producción).`,
  );
}
