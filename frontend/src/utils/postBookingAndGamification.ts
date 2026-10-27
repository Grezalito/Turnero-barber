import { WeeklyGoalMetrics } from '../types/api';

export const NON_REFUNDABLE_LEGEND =
  'Reserva garantizada: la seña de $2.000 ARS no es reembolsable ni transferible ante cancelaciones o inasistencias';

/**
 * Convierte un ISO string a formato UTC compacto YYYYMMDDTHHMMSSZ para Google Calendar e ICS.
 */
export function toUtcCalendarTimestamp(iso: string): string {
  const d = new Date(iso);
  return d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Construye el enlace dinámico para "AGREGAR A GOOGLE CALENDAR":
 * Incluye título del corte, barbería, horario UTC de inicio y fin de 30 min, y seña acreditada.
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
  const startUtc = toUtcCalendarTimestamp(params.startTimeIso);
  const endUtc = toUtcCalendarTimestamp(params.endTimeIso);
  const deposit = params.depositAmountArs ?? 2000;

  const title = `Corte de Barbería (30 min) - ${params.shopName}`;
  const location = params.address
    ? `${params.shopName}, ${params.address}`
    : params.shopName;
  const details = [
    `Turno confirmado de 30 minutos en ${params.shopName}.`,
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
  url.searchParams.set('details', details);
  url.searchParams.set('location', location);

  return url.toString();
}

/**
 * Construye el link wa.me al teléfono del barbero con el mensaje predeterminado:
 * "Hola! Señé mi turno para el [fecha] a las [hora]. Comprobante: [mp_payment_id]"
 */
export function buildWhatsAppShareUrl(params: {
  barberPhone?: string | null;
  startTimeIso: string;
  mpPaymentId: string;
}): string {
  const cleanPhone = (params.barberPhone || '+5491155667788').replace(
    /\D/g,
    '',
  );
  const fecha = params.startTimeIso.slice(0, 10);
  const d = new Date(params.startTimeIso);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const hora = `${hh}:${mm}`;

  const message = `Hola! Señé mi turno para el ${fecha} a las ${hora}. Comprobante: ${params.mpPaymentId}`;
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
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
  const startUtc = toUtcCalendarTimestamp(params.startTimeIso);
  const endUtc = toUtcCalendarTimestamp(params.endTimeIso);
  const summary = `Corte de Barbería (30 min) - ${params.shopName}`;
  const location = params.address || params.shopName;
  const description = `Reserva confirmada en ${params.shopName}\\nSeña acreditada: $2.000 ARS\\nComprobante MP: ${params.mpPaymentId}\\n${NON_REFUNDABLE_LEGEND}`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Turnero Barber Craft//Booking Engine 30m//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:slot-${params.slotId}@turnero-barber.local`,
    `DTSTAMP:${nowUtc}`,
    `DTSTART:${startUtc}`,
    `DTEND:${endUtc}`,
    `SUMMARY:${summary}`,
    `LOCATION:${location}`,
    `DESCRIPTION:${description}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
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
