/**
 * Utilidades de Privacidad, Enmascaramiento de PII y Sanitización de Logs
 * Controles asociados:
 * - ISO/IEC 27701:2019 (Cláusulas 6.5.2, 7.4.5, 8.4 - Minimización y Pseudonimización de PII)
 * - ISO/IEC 27001:2022 (Anexo A.5.34 Privacidad y protección de PII, A.8.11 Enmascaramiento de datos, A.8.15 Registros)
 * - SOC 2 (C1.1 Confidencialidad, P4.2 Retención y uso de datos personales)
 */

/**
 * Enmascara un número de DNI dejando visibles únicamente los últimos 3 dígitos.
 * Ejemplo: "35123456" -> "*****456"
 */
export function maskDni(dni?: string | null): string {
  if (!dni) {
    return '***';
  }
  const clean = String(dni).replace(/\D/g, '');
  if (clean.length <= 3) {
    return '***';
  }
  return `${'*'.repeat(Math.max(3, clean.length - 3))}${clean.slice(-3)}`;
}

/**
 * Enmascara un número telefónico dejando prefijo de país y últimos 3 dígitos.
 * Ejemplo: "+5491122334455" -> "+549*******455"
 */
export function maskPhone(phone?: string | null): string {
  if (!phone) {
    return '***';
  }
  const trimmed = String(phone).trim();
  if (trimmed.length <= 6) {
    return '***';
  }
  const prefix = trimmed.slice(0, 4);
  const suffix = trimmed.slice(-3);
  return `${prefix}${'*'.repeat(Math.max(4, trimmed.length - 7))}${suffix}`;
}

/**
 * Enmascara una dirección de correo electrónico para logs de auditoría.
 * Ejemplo: "cliente@dominio.com" -> "c***@dominio.com"
 */
export function maskEmail(email?: string | null): string {
  if (!email || !email.includes('@')) {
    return '***@***';
  }
  const [local, domain] = email.trim().split('@');
  if (!local || !domain) {
    return '***@***';
  }
  const visibleLocal = local.slice(0, 1);
  return `${visibleLocal}***@${domain}`;
}

/**
 * Minimiza el nombre completo para artefactos públicos no autenticados (ej. descarga .ICS pública).
 * Ejemplo: "Juan Ignacio Perez" -> "Juan P."
 */
export function maskFullNameForPublicArtifact(name?: string | null): string {
  if (!name) {
    return 'Cliente';
  }
  const parts = sanitizeControlChars(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return 'Cliente';
  }
  if (parts.length === 1) {
    return parts[0];
  }
  const firstName = parts[0];
  const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();
  return `${firstName} ${lastInitial}.`;
}

/**
 * Elimina caracteres de control (CR, LF, NULL) para prevenir Log Injection (ISO 27001 A.8.15)
 * e inyección de cabeceras en archivos .ICS / SMTP (ISO 27001 A.8.28).
 */
export function sanitizeControlChars(value?: string | null): string {
  if (!value) {
    return '';
  }
  return String(value).replace(/[\r\n\0\x00-\x1F\x7F]+/g, ' ').trim();
}
