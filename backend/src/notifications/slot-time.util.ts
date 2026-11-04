/**
 * CONVENCIÓN DE ALMACENAMIENTO DE HORARIOS (heredada del motor de reservas):
 *
 *   `start_time` / `end_time` guardan la hora de pared de Argentina "como si fuera UTC".
 *   Un turno de las 10:00 en Buenos Aires se persiste como `...T10:00:00.000Z`.
 *
 * Por lo tanto el instante real es `nominal + 3h`. Argentina no aplica horario de verano
 * desde 2009, por lo que el offset es fijo (UTC-3). Toda conversión pasa por este archivo.
 */
export const ARGENTINA_TIMEZONE = 'America/Argentina/Buenos_Aires';
export const ARGENTINA_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Hora nominal almacenada → instante real (UTC verdadero). */
export function nominalToInstant(nominal: Date): Date {
  return new Date(nominal.getTime() + ARGENTINA_UTC_OFFSET_MS);
}

/** Instante real (UTC verdadero) → hora nominal comparable contra `start_time`. */
export function instantToNominal(instant: Date): Date {
  return new Date(instant.getTime() - ARGENTINA_UTC_OFFSET_MS);
}

const dateFormatter = new Intl.DateTimeFormat('es-AR', {
  timeZone: ARGENTINA_TIMEZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const timeFormatter = new Intl.DateTimeFormat('es-AR', {
  timeZone: ARGENTINA_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** "martes 4 de noviembre" en hora de Buenos Aires. */
export function formatSlotDateAr(nominal: Date): string {
  return dateFormatter.format(nominalToInstant(nominal));
}

/** "14:30" en hora de Buenos Aires. */
export function formatSlotTimeAr(nominal: Date): string {
  return timeFormatter.format(nominalToInstant(nominal));
}

/** Duración real del turno en minutos (30, 45, ...). */
export function slotDurationMinutes(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 60_000);
}
