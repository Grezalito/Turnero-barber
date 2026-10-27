export type BonusTierCode = 'NONE' | 'TIER_15' | 'TIER_35' | 'TIER_50';

export interface WeeklyGoalMetrics {
  week_start: string;
  week_end: string;
  confirmed_count: number;
  current_target: number;
  display_counter: string;
  progress_percentage: number;
  overall_progress_percentage: number;
  tier: BonusTierCode;
  tier_label: string;
  earned_bonus_ars: number;
  next_bonus_ars: number;
  remaining_for_next_tier: number;
  reminder_ia_bonified: boolean;
}

export const WEEKLY_BONUS_TIERS = [
  { target: 15, bonusArs: 10000, reminderBonified: false, code: 'TIER_15' as const },
  { target: 35, bonusArs: 25000, reminderBonified: false, code: 'TIER_35' as const },
  { target: 50, bonusArs: 40000, reminderBonified: true, code: 'TIER_50' as const },
];

/**
 * Obtiene el inicio (Lunes 00:00:00.000Z) y fin (Domingo 23:59:59.999Z)
 * de la semana correspondiente a `referenceDate`.
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
  // En UTC: 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
  const dayOfWeek = d.getUTCDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const weekStart = new Date(d.getTime() + diffToMonday * 24 * 60 * 60 * 1000);
  weekStart.setUTCHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
  weekEnd.setUTCHours(23, 59, 59, 999);

  return { weekStart, weekEnd };
}

/**
 * Calcula la meta semanal y bonos de gamificación (Lunes a Domingo):
 * - 15 turnos completados/semana -> Bono de $10.000 ARS
 * - 35 turnos completados/semana -> Bono de $25.000 ARS
 * - 50 turnos completados/semana -> Bono de $40.000 ARS + Reminder IA bonificado
 */
export function calculateWeeklyGoalMetrics(
  confirmedCount: number,
  referenceDate: Date = new Date(),
): WeeklyGoalMetrics {
  const { weekStart, weekEnd } = getWeekBoundsUtc(referenceDate);

  let tier: BonusTierCode = 'NONE';
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
