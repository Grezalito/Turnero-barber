import { WeeklyGoalMetrics } from '../types/api';

export const NON_REFUNDABLE_LEGEND =
  'Reserva garantizada: la seña de $2.000 ARS no es reembolsable ni transferible ante cancelaciones o inasistencias';

export const ARGENTINA_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC-3 (America/Argentina/Buenos_Aires)

/**
 * Obtiene la fecha YYYY-MM-DD en zona horaria de Argentina (UTC-3),
 * evitando que pasadas las 21:00 hs salte al día siguiente.
 */
export function getArgentinaDateIso(offsetDays = 0): string {
  const targetMs =
    Date.now() - ARGENTINA_OFFSET_MS + offsetDays * 24 * 60 * 60 * 1000;
  return new Date(targetMs).toISOString().slice(0, 10);
}

/**
 * Convierte un ISO string a formato UTC compacto YYYYMMDDTHHMMSSZ.
 */
export function toUtcCalendarTimestamp(iso: string): string {
  const d = new Date(iso);
  return d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Convierte un horario nominal de turno (almacenado como HH:mm UTC nominal para Argentina UTC-3)
 * al instante UTC real (+3 horas) para que Google Calendar, Apple Calendar y Outlook en Argentina
 * agenden el turno en la hora local exacta.
 */
export function toArgentinaRealUtcCalendarTimestamp(nominalIso: string): string {
  const d = new Date(new Date(nominalIso).getTime() + ARGENTINA_OFFSET_MS);
  return d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Construye el enlace dinámico para "AGREGAR A GOOGLE CALENDAR":
 * Incluye título del corte, barbería, horario real de inicio y fin de 30 min en Argentina, y seña acreditada.
 */
export function buildGoogleCalendarUrl(params: {
  shopName: string;
  address?: string | null;
  barberName?: string;
  startTimeIso: string;
  endTimeIso: string;
  mpPaymentId: string;
  depositAmountArs?: number;
}): string {
  const startUtc = toArgentinaRealUtcCalendarTimestamp(params.startTimeIso);
  const endUtc = toArgentinaRealUtcCalendarTimestamp(params.endTimeIso);
  const deposit = params.depositAmountArs ?? 2000;

  const minutes = slotDurationMinutes(params.startTimeIso, params.endTimeIso);
  const title = `Corte de Barbería (${minutes} min) - ${params.shopName}`;
  const location = params.address
    ? `${params.shopName}, ${params.address}`
    : params.shopName;
  const details = [
    `Turno confirmado de ${minutes} minutos en ${params.shopName}.`,
    params.barberName ? `Barbero: ${params.barberName}.` : '',
    `Seña acreditada: $${deposit.toLocaleString('es-AR')} ARS.`,
    `Comprobante Mercado Pago: ${params.mpPaymentId}.`,
    NON_REFUNDABLE_LEGEND,
  ]
    .filter(Boolean)
    .join('\n');

  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.set('action', 'TEMPLATE');
  url.searchParams.set('text', title);
  url.searchParams.set('dates', `${startUtc}/${endUtc}`);
  url.searchParams.set('ctz', 'America/Argentina/Buenos_Aires');
  url.searchParams.set('details', details);
  url.searchParams.set('location', location);

  return url.toString();
}

/** Duración real del turno en minutos (30, 45, ...). */
export function slotDurationMinutes(startIso: string, endIso: string): number {
  return Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000);
}

/**
 * Normaliza un teléfono argentino para wa.me (549 + área + número). Devuelve null si no es
 * válido: nunca se usa un número de relleno (podría pertenecer a un tercero real).
 * Mantener en sync con backend/src/notifications/whatsapp-link.util.ts.
 */
export function normalizeArgentinaWhatsAppNumber(raw?: string | null): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('54')) {
    digits = digits.slice(2);
    if (digits.startsWith('9')) digits = digits.slice(1);
  }
  if (digits.startsWith('0')) digits = digits.slice(1);
  const local15 = digits.match(/^(\d{2,4})15(\d{6,8})$/);
  if (local15 && local15[1].length + local15[2].length === 10) {
    digits = local15[1] + local15[2];
  }
  return digits.length === 10 ? `549${digits}` : null;
}

/**
 * Link wa.me al barbero (fallback local si el backend no envió `whatsapp_barber_notify_url`).
 */
export function buildWhatsAppShareUrl(params: {
  barberPhone?: string | null;
  startTimeIso: string;
  mpPaymentId: string;
}): string | null {
  const phone = normalizeArgentinaWhatsAppNumber(params.barberPhone);
  if (!phone) return null;
  const fecha = params.startTimeIso.slice(0, 10);
  const d = new Date(params.startTimeIso);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const message = `Hola! Señé mi turno para el ${fecha} a las ${hh}:${mm}. Comprobante: ${params.mpPaymentId}`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

/** RFC 5545: escapa \\ ; , y saltos de línea en valores TEXT. */
function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** RFC 5545 §3.1: líneas de máx. 75 octetos, continuaciones con un espacio inicial. */
function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;
  for (const char of line) {
    const charBytes = encoder.encode(char).length;
    const limit = chunks.length === 0 ? 75 : 74;
    if (currentBytes + charBytes > limit) {
      chunks.push(current);
      current = '';
      currentBytes = 0;
    }
    current += char;
    currentBytes += charBytes;
  }
  chunks.push(current);
  return chunks.join('\r\n ');
}

/**
 * Genera contenido .ICS compatible con Apple Calendar y Outlook como respaldo local
 * si el backend está en modo sandbox offline.
 */
export function buildLocalIcsContent(params: {
  slotId: string;
  shopName: string;
  address?: string | null;
  barberName?: string;
  startTimeIso: string;
  endTimeIso: string;
  mpPaymentId: string;
}): string {
  const nowUtc = toUtcCalendarTimestamp(new Date().toISOString());
  const startUtc = toArgentinaRealUtcCalendarTimestamp(params.startTimeIso);
  const endUtc = toArgentinaRealUtcCalendarTimestamp(params.endTimeIso);
  const minutes = slotDurationMinutes(params.startTimeIso, params.endTimeIso);
  const summary = `Corte de Barbería (${minutes} min) - ${params.shopName}`;
  const location = params.address || params.shopName;
  const description = [
    `Reserva confirmada en ${params.shopName}`,
    'Seña acreditada: $2.000 ARS',
    `Comprobante MP: ${params.mpPaymentId}`,
    NON_REFUNDABLE_LEGEND,
  ]
    .map(escapeIcsText)
    .join('\\n');

  return (
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Turnazo//Booking Engine//ES',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:slot-${params.slotId}@turnazo.app`,
      `DTSTAMP:${nowUtc}`,
      `DTSTART:${startUtc}`,
      `DTEND:${endUtc}`,
      `SUMMARY:${escapeIcsText(summary)}`,
      `LOCATION:${escapeIcsText(location)}`,
      `DESCRIPTION:${description}`,
      'STATUS:CONFIRMED',
      'BEGIN:VALARM',
      'TRIGGER:-PT2H',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcsText(`Tu turno en ${params.shopName} es en 2 horas`)}`,
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ]
      .map(foldIcsLine)
      .join('\r\n') + '\r\n'
  );
}

/**
 * Obtiene el inicio (Lunes 00:00:00.000Z) y fin (Domingo 23:59:59.999Z) de la semana en UTC.
 */
export function getWeekBoundsUtc(referenceDate: Date = new Date()): {
  weekStart: Date;
  weekEnd: Date;
} {
  const d = new Date(
    Date.UTC(
      referenceDate.getUTCFullYear(),
      referenceDate.getUTCMonth(),
      referenceDate.getUTCDate(),
    ),
  );
  const dayOfWeek = d.getUTCDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const weekStart = new Date(d.getTime() + diffToMonday * 24 * 60 * 60 * 1000);
  weekStart.setUTCHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
  weekEnd.setUTCHours(23, 59, 59, 999);

  return { weekStart, weekEnd };
}

/**
 * Calcula la Meta Semanal y Bonos de Gamificación (Lunes a Domingo):
 * - 15 turnos completados/semana -> Bono de $10.000 ARS.
 * - 35 turnos completados/semana -> Bono de $25.000 ARS.
 * - 50 turnos completados/semana -> Bono de $40.000 ARS + Reminder IA bonificado.
 */
export function calculateWeeklyGoalMetrics(
  confirmedCount: number,
  referenceDate: Date = new Date(),
): WeeklyGoalMetrics {
  const { weekStart, weekEnd } = getWeekBoundsUtc(referenceDate);

  let tier: 'NONE' | 'TIER_15' | 'TIER_35' | 'TIER_50' = 'NONE';
  let tierLabel = 'Sin bono alcanzado';
  let earnedBonusArs = 0;
  let currentTarget = 15;
  let nextBonusArs = 10000;
  let remainingForNextTier = Math.max(0, 15 - confirmedCount);
  let reminderIaBonified = false;

  if (confirmedCount >= 50) {
    tier = 'TIER_50';
    tierLabel = 'Nivel 3 (50+ turnos) · $40.000 ARS + Reminder IA Bonificado';
    earnedBonusArs = 40000;
    currentTarget = 50;
    nextBonusArs = 40000;
    remainingForNextTier = 0;
    reminderIaBonified = true;
  } else if (confirmedCount >= 35) {
    tier = 'TIER_35';
    tierLabel = 'Nivel 2 (35+ turnos) · $25.000 ARS';
    earnedBonusArs = 25000;
    currentTarget = 50;
    nextBonusArs = 40000;
    remainingForNextTier = 50 - confirmedCount;
    reminderIaBonified = false;
  } else if (confirmedCount >= 15) {
    tier = 'TIER_15';
    tierLabel = 'Nivel 1 (15+ turnos) · $10.000 ARS';
    earnedBonusArs = 10000;
    currentTarget = 35;
    nextBonusArs = 25000;
    remainingForNextTier = 35 - confirmedCount;
    reminderIaBonified = false;
  }

  const progressPercentage = Math.min(
    100,
    Math.round((confirmedCount / currentTarget) * 100),
  );
  const overallProgressPercentage = Math.min(
    100,
    Math.round((confirmedCount / 50) * 100),
  );

  return {
    week_start: weekStart.toISOString(),
    week_end: weekEnd.toISOString(),
    confirmed_count: confirmedCount,
    current_target: currentTarget,
    display_counter: `${confirmedCount}/${currentTarget} turnos esta semana`,
    progress_percentage: progressPercentage,
    overall_progress_percentage: overallProgressPercentage,
    tier,
    tier_label: tierLabel,
    earned_bonus_ars: earnedBonusArs,
    next_bonus_ars: nextBonusArs,
    remaining_for_next_tier: remainingForNextTier,
    reminder_ia_bonified: reminderIaBonified,
  };
}
