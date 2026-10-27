import React, { useMemo, useState } from 'react';
import {
  CalendarPlus,
  Clock,
  CheckCircle2,
  Lock,
  Trash2,
  Coffee,
  Eye,
  Zap,
  Trophy,
  Sparkles,
} from 'lucide-react';
import { AppointmentSlot, WeeklyGoalMetrics } from '../types/api';
import {
  calculateWeeklyGoalMetrics,
  getWeekBoundsUtc,
} from '../utils/postBookingAndGamification';
import { formatDateHeader, formatTime30m } from './PublicBookingView';

interface BarberDashboardViewProps {
  barberInfo: {
    id: string;
    slug: string;
    shop_name: string;
    address?: string | null;
    reminder_addon_active: boolean;
  };
  slots: AppointmentSlot[];
  weeklyGoal?: WeeklyGoalMetrics | null;
  onGenerateRange: (payload: {
    date: string;
    end_date?: string;
    start_time: string;
    end_time: string;
    break_start_time?: string;
    break_end_time?: string;
  }) => Promise<{
    generated_count?: number;
    days_processed?: number;
  } | void>;
  onToggleSingleSlot: (payload: {
    date: string;
    slot_start_time: string;
  }) => Promise<void>;
  onSwitchToPublicView?: () => void;
}

const STANDARD_30M_BLOCKS = [
  '08:00',
  '08:30',
  '09:00',
  '09:30',
  '10:00',
  '10:30',
  '11:00',
  '11:30',
  '12:00',
  '12:30',
  '13:00',
  '13:30',
  '14:00',
  '14:30',
  '15:00',
  '15:30',
  '16:00',
  '16:30',
  '17:00',
  '17:30',
  '18:00',
  '18:30',
  '19:00',
  '19:30',
  '20:00',
  '20:30',
  '21:00',
  '21:30',
];

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export const BarberDashboardView: React.FC<BarberDashboardViewProps> = ({
  barberInfo,
  slots,
  weeklyGoal,
  onGenerateRange,
  onToggleSingleSlot,
  onSwitchToPublicView,
}) => {
  const todayIsoDate = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const tomorrowIsoDate = useMemo(() => {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  }, []);

  // Cálculo en vivo de Meta Semanal (Lunes a Domingo)
  const liveWeeklyMetrics = useMemo<WeeklyGoalMetrics>(() => {
    const { weekStart, weekEnd } = getWeekBoundsUtc();
    const confirmedInCurrentWeek = slots.filter((s) => {
      if (s.status !== 'CONFIRMED') return false;
      const t = new Date(s.start_time).getTime();
      return t >= weekStart.getTime() && t <= weekEnd.getTime();
    }).length;

    const countToUse =
      confirmedInCurrentWeek > 0
        ? confirmedInCurrentWeek
        : weeklyGoal?.confirmed_count ?? 0;

    return calculateWeeklyGoalMetrics(countToUse);
  }, [slots, weeklyGoal]);

  const [selectedDate, setSelectedDate] = useState<string>(tomorrowIsoDate);
  const [useDateRange, setUseDateRange] = useState<boolean>(false);
  const [endDate, setEndDate] = useState<string>(tomorrowIsoDate);

  // Default "Apertura de Jornada": 10:00 to 20:00 with optional break 14:00 to 16:00
  const [rangeStart, setRangeStart] = useState<string>('10:00');
  const [rangeEnd, setRangeEnd] = useState<string>('20:00');
  const [includeBreak, setIncludeBreak] = useState<boolean>(true);
  const [breakStart, setBreakStart] = useState<string>('14:00');
  const [breakEnd, setBreakEnd] = useState<string>('16:00');

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // All dates that currently have slots in DB, plus today & tomorrow for quick navigation
  const availableDatesForStrip = useMemo(() => {
    const set = new Set<string>([todayIsoDate, tomorrowIsoDate, selectedDate]);
    for (const s of slots) {
      set.add(s.start_time.slice(0, 10));
    }
    return Array.from(set).sort();
  }, [slots, todayIsoDate, tomorrowIsoDate, selectedDate]);

  const slotsForDateMap = useMemo(() => {
    const map = new Map<string, AppointmentSlot>();
    for (const s of slots) {
      const dKey = s.start_time.slice(0, 10);
      if (dKey === selectedDate) {
        const hhmm = formatTime30m(s.start_time);
        map.set(hhmm, s);
      }
    }
    return map;
  }, [slots, selectedDate]);

  // Calculate preview of how many 30-min slots will be generated
  const generationPreview = useMemo(() => {
    const startMin = timeToMinutes(rangeStart);
    const endMin = timeToMinutes(rangeEnd);
    if (endMin <= startMin) return { perDay: 0, days: 1, total: 0 };

    let perDay = 0;
    const bStart = includeBreak ? timeToMinutes(breakStart) : -1;
    const bEnd = includeBreak ? timeToMinutes(breakEnd) : -1;

    for (let cursor = startMin; cursor < endMin; cursor += 30) {
      if (includeBreak && bEnd > bStart && cursor >= bStart && cursor < bEnd) {
        continue;
      }
      perDay++;
    }

    let days = 1;
    if (useDateRange && endDate >= selectedDate) {
      const d1 = new Date(`${selectedDate}T00:00:00.000Z`).getTime();
      const d2 = new Date(`${endDate}T00:00:00.000Z`).getTime();
      days = Math.max(1, Math.round((d2 - d1) / (24 * 60 * 60 * 1000)) + 1);
    }

    return {
      perDay,
      days,
      total: perDay * days,
    };
  }, [
    rangeStart,
    rangeEnd,
    includeBreak,
    breakStart,
    breakEnd,
    useDateRange,
    selectedDate,
    endDate,
  ]);

  const applyQuickDaysPreset = (numDays: number, startFromToday = false) => {
    const baseMs = startFromToday
      ? Date.now()
      : Date.now() + 24 * 60 * 60 * 1000;
    const startStr = new Date(baseMs).toISOString().slice(0, 10);
    setSelectedDate(startStr);

    if (numDays === 1) {
      setUseDateRange(false);
      setEndDate(startStr);
    } else {
      const endStr = new Date(baseMs + (numDays - 1) * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      setUseDateRange(true);
      setEndDate(endStr);
    }
  };

  const handleRangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    setErrorMsg(null);

    try {
      if (timeToMinutes(rangeEnd) <= timeToMinutes(rangeStart)) {
        throw new Error(
          'La hora de cierre debe ser posterior a la hora de apertura.',
        );
      }
      if (
        includeBreak &&
        timeToMinutes(breakEnd) <= timeToMinutes(breakStart)
      ) {
        throw new Error(
          'El fin del corte de descanso debe ser posterior al inicio del descanso.',
        );
      }

      const res = await onGenerateRange({
        date: selectedDate,
        ...(useDateRange && endDate >= selectedDate
          ? { end_date: endDate }
          : {}),
        start_time: rangeStart,
        end_time: rangeEnd,
        ...(includeBreak
          ? {
              break_start_time: breakStart,
              break_end_time: breakEnd,
            }
          : {}),
      });

      const countCreated =
        res && typeof res.generated_count === 'number'
          ? res.generated_count
          : generationPreview.total;

      const breakText = includeBreak
        ? ` (con descanso ${breakStart}–${breakEnd})`
        : '';
      const dateText =
        useDateRange && endDate > selectedDate
          ? `del ${selectedDate} al ${endDate}`
          : `para el ${selectedDate}`;

      setFeedback(
        `✓ Apertura de jornada aplicada ${dateText}: ${rangeStart} a ${rangeEnd}${breakText} · ${countCreated} bloques nuevos de 30 min habilitados.`,
      );
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pb-16 space-y-6">
      {/* Header Card */}
      <section className="p-5 rounded-sm bg-[#121214] border border-[#242428] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="font-mono-code text-[11px] uppercase tracking-widest text-[#D49A2A]">
            PANEL DE BARBERO · URL PÚBLICA: /{barberInfo.slug}
          </span>
          <h1 className="font-display text-2xl font-extrabold uppercase text-[#F2EFE9] mt-1">
            {barberInfo.shop_name}
          </h1>
          <p className="text-xs text-[#8A8A93] mt-0.5">
            {barberInfo.address || 'Gestión de bloques estrictos de 30 minutos'}
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-center">
          <div className="px-3 py-2 rounded-sm bg-[#0A0A0B] border border-[#242428]">
            <span className="block text-[10px] font-display uppercase tracking-wider text-[#8A8A93]">
              REMINDER IA (3 USD)
            </span>
            <span
              className={`font-mono-code text-xs font-bold ${
                barberInfo.reminder_addon_active
                  ? 'text-[#D49A2A]'
                  : 'text-[#8A8A93]'
              }`}
            >
              {barberInfo.reminder_addon_active ? 'ACTIVO' : 'INACTIVO'}
            </span>
          </div>

          {onSwitchToPublicView && (
            <button
              type="button"
              onClick={onSwitchToPublicView}
              className="min-h-[44px] px-3.5 rounded-sm bg-[#0A0A0B] border border-[#D49A2A] text-[#D49A2A] hover:bg-[#D49A2A] hover:text-[#0A0A0B] font-display text-xs uppercase font-bold tracking-wider flex items-center gap-1.5 transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>VER AGENDA PÚBLICA</span>
            </button>
          )}
        </div>
      </section>

      {/* Tarjeta Superior: Meta Semanal y Sistema de Bonos (Lunes a Domingo) */}
      <section className="p-5 rounded-sm bg-[#121214] border border-[#D49A2A] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#242428] pb-3.5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-sm bg-[#0A0A0B] border border-[#D49A2A] flex items-center justify-center text-[#D49A2A] shrink-0">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono-code text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-sm bg-[#0A0A0B] border border-[#D49A2A] text-[#D49A2A]">
                  GAMIFICACIÓN · LUNES A DOMINGO
                </span>
                <span className="font-mono-code text-xs text-[#8A8A93]">
                  {liveWeeklyMetrics.week_start.slice(0, 10)} al{' '}
                  {liveWeeklyMetrics.week_end.slice(0, 10)}
                </span>
              </div>
              <h2 className="font-display text-lg sm:text-xl font-extrabold uppercase tracking-wide text-[#F2EFE9] mt-1">
                META SEMANAL:{' '}
                <span className="font-mono-code text-[#D49A2A]">
                  {liveWeeklyMetrics.display_counter}
                </span>
              </h2>
            </div>
          </div>

          <div className="p-3 rounded-sm bg-[#0A0A0B] border border-[#242428] sm:text-right shrink-0">
            <span className="block font-display text-[10px] uppercase tracking-wider text-[#8A8A93]">
              BONO ACUMULADO EN JUEGO
            </span>
            <span className="block font-mono-code text-xl font-bold text-[#D49A2A] mt-0.5">
              ${liveWeeklyMetrics.earned_bonus_ars.toLocaleString('es-AR')} ARS
            </span>
            {liveWeeklyMetrics.reminder_ia_bonified && (
              <span className="inline-flex items-center gap-1 font-mono-code text-[10px] text-[#D49A2A] mt-0.5">
                <Sparkles className="w-3 h-3" />+ REMINDER IA BONIFICADO
              </span>
            )}
          </div>
        </div>

        {/* Barra de Progreso en Color Bronce (#D49A2A) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between font-mono-code text-xs">
            <span className="text-[#F2EFE9] font-semibold">
              {liveWeeklyMetrics.tier_label}
            </span>
            <span className="text-[#D49A2A] font-bold">
              {liveWeeklyMetrics.progress_percentage}% del objetivo actual (
              {liveWeeklyMetrics.confirmed_count}/{liveWeeklyMetrics.current_target})
            </span>
          </div>

          <div className="w-full h-3.5 rounded-sm bg-[#0A0A0B] border border-[#242428] overflow-hidden p-0.5">
            <div
              className="h-full rounded-xs transition-all duration-500"
              style={{
                width: `${liveWeeklyMetrics.progress_percentage}%`,
                backgroundColor: '#D49A2A',
              }}
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 font-mono-code text-xs text-[#8A8A93]">
            {liveWeeklyMetrics.remaining_for_next_tier > 0 ? (
              <span>
                Te faltan{' '}
                <strong className="text-[#D49A2A]">
                  {liveWeeklyMetrics.remaining_for_next_tier}{' '}
                  {liveWeeklyMetrics.remaining_for_next_tier === 1
                    ? 'turno confirmado'
                    : 'turnos confirmados'}
                </strong>{' '}
                para desbloquear el siguiente nivel de{' '}
                <strong className="text-[#F2EFE9]">
                  ${liveWeeklyMetrics.next_bonus_ars.toLocaleString('es-AR')} ARS
                  {liveWeeklyMetrics.current_target === 50
                    ? ' + Reminder IA bonificado'
                    : ''}
                </strong>
                .
              </span>
            ) : (
              <span className="text-[#D49A2A] font-bold">
                ★ ¡Alcanzaste la escala máxima de 50 turnos! Bono de $40.000 ARS + Reminder IA bonificado desbloqueado.
              </span>
            )}
          </div>
        </div>

        {/* Escala de Niveles Semanales */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
          <div
            className={`p-3 rounded-sm border ${
              liveWeeklyMetrics.confirmed_count >= 15
                ? 'bg-[#D49A2A]/15 border-[#D49A2A] text-[#F2EFE9]'
                : 'bg-[#0A0A0B] border-[#242428] text-[#8A8A93]'
            }`}
          >
            <div className="flex items-center justify-between font-mono-code text-xs">
              <span className="uppercase font-bold">NIVEL 1 · 15 TURNOS</span>
              {liveWeeklyMetrics.confirmed_count >= 15 && (
                <CheckCircle2 className="w-4 h-4 text-[#D49A2A]" />
              )}
            </div>
            <p className="font-mono-code text-sm font-bold text-[#D49A2A] mt-1">
              Bono $10.000 ARS
            </p>
          </div>

          <div
            className={`p-3 rounded-sm border ${
              liveWeeklyMetrics.confirmed_count >= 35
                ? 'bg-[#D49A2A]/15 border-[#D49A2A] text-[#F2EFE9]'
                : 'bg-[#0A0A0B] border-[#242428] text-[#8A8A93]'
            }`}
          >
            <div className="flex items-center justify-between font-mono-code text-xs">
              <span className="uppercase font-bold">NIVEL 2 · 35 TURNOS</span>
              {liveWeeklyMetrics.confirmed_count >= 35 && (
                <CheckCircle2 className="w-4 h-4 text-[#D49A2A]" />
              )}
            </div>
            <p className="font-mono-code text-sm font-bold text-[#D49A2A] mt-1">
              Bono $25.000 ARS
            </p>
          </div>

          <div
            className={`p-3 rounded-sm border ${
              liveWeeklyMetrics.confirmed_count >= 50
                ? 'bg-[#D49A2A]/15 border-[#D49A2A] text-[#F2EFE9]'
                : 'bg-[#0A0A0B] border-[#242428] text-[#8A8A93]'
            }`}
          >
            <div className="flex items-center justify-between font-mono-code text-xs">
              <span className="uppercase font-bold">NIVEL 3 · 50 TURNOS</span>
              {liveWeeklyMetrics.confirmed_count >= 50 && (
                <CheckCircle2 className="w-4 h-4 text-[#D49A2A]" />
              )}
            </div>
            <p className="font-mono-code text-sm font-bold text-[#D49A2A] mt-1">
              $40.000 ARS + Reminder IA
            </p>
          </div>
        </div>
      </section>

      {/* Rapid Day Opening Generator ("Apertura de Jornada") */}
      <section className="p-5 rounded-sm bg-[#121214] border border-[#242428] space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#242428] pb-3.5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-sm bg-[#0A0A0B] border border-[#D49A2A] flex items-center justify-center text-[#D49A2A]">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-display text-sm sm:text-base font-extrabold uppercase tracking-wider text-[#F2EFE9]">
                APERTURA DE JORNADA · GENERADOR RÁPIDO (SLOTS 30 MIN)
              </h2>
              <p className="text-xs text-[#8A8A93]">
                Habilitá de un solo toque todos los turnos del día o la semana con corte de descanso opcional
              </p>
            </div>
          </div>

          {/* Live Slot Counter Pill */}
          <div className="px-3 py-1.5 rounded-sm bg-[#0A0A0B] border border-[#D49A2A]/60 self-start sm:self-center">
            <span className="font-mono-code text-xs text-[#D49A2A] font-bold">
              {generationPreview.perDay} turnos/día
              {generationPreview.days > 1
                ? ` × ${generationPreview.days} días = ${generationPreview.total} bloques`
                : ` (${generationPreview.total} bloques de 30m)`}
            </span>
          </div>
        </div>

        {/* Quick Date Presets */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-[10px] uppercase tracking-wider text-[#8A8A93] mr-1">
            ATAJOS DE FECHA:
          </span>
          <button
            type="button"
            onClick={() => applyQuickDaysPreset(1, true)}
            className="px-2.5 py-1.5 rounded-sm bg-[#0A0A0B] border border-[#242428] hover:border-[#D49A2A] font-mono-code text-xs text-[#F2EFE9] transition-colors"
          >
            Hoy ({todayIsoDate.slice(5)})
          </button>
          <button
            type="button"
            onClick={() => applyQuickDaysPreset(1, false)}
            className="px-2.5 py-1.5 rounded-sm bg-[#0A0A0B] border border-[#242428] hover:border-[#D49A2A] font-mono-code text-xs text-[#F2EFE9] transition-colors"
          >
            Mañana ({tomorrowIsoDate.slice(5)})
          </button>
          <button
            type="button"
            onClick={() => applyQuickDaysPreset(3, false)}
            className="px-2.5 py-1.5 rounded-sm bg-[#0A0A0B] border border-[#242428] hover:border-[#D49A2A] font-mono-code text-xs text-[#F2EFE9] transition-colors"
          >
            Próximos 3 días
          </button>
          <button
            type="button"
            onClick={() => applyQuickDaysPreset(6, false)}
            className="px-2.5 py-1.5 rounded-sm bg-[#0A0A0B] border border-[#242428] hover:border-[#D49A2A] font-mono-code text-xs text-[#F2EFE9] transition-colors"
          >
            Semana (6 días)
          </button>
          <label className="ml-auto flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={useDateRange}
              onChange={(e) => {
                setUseDateRange(e.target.checked);
                if (e.target.checked && endDate < selectedDate) {
                  setEndDate(selectedDate);
                }
              }}
              className="accent-[#D49A2A] w-4 h-4"
            />
            <span className="font-display text-xs uppercase font-bold text-[#F2EFE9]">
              Rango de varios días
            </span>
          </label>
        </div>

        <form onSubmit={handleRangeSubmit} className="space-y-4">
          {/* Row 1: Dates & Main Hours */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-display uppercase tracking-wider text-[#8A8A93] mb-1">
                {useDateRange ? 'FECHA DESDE' : 'FECHA DE JORNADA'}
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  if (endDate < e.target.value) {
                    setEndDate(e.target.value);
                  }
                }}
                className="w-full min-h-[44px] px-3 rounded-sm bg-[#0A0A0B] border border-[#242428] focus:border-[#D49A2A] focus:outline-none font-mono-code text-xs text-[#F2EFE9]"
              />
            </div>

            {useDateRange && (
              <div>
                <label className="block text-[11px] font-display uppercase tracking-wider text-[#8A8A93] mb-1">
                  FECHA HASTA
                </label>
                <input
                  type="date"
                  min={selectedDate}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-sm bg-[#0A0A0B] border border-[#242428] focus:border-[#D49A2A] focus:outline-none font-mono-code text-xs text-[#F2EFE9]"
                />
              </div>
            )}

            <div>
              <label className="block text-[11px] font-display uppercase tracking-wider text-[#8A8A93] mb-1">
                HORA INICIO (:00 / :30)
              </label>
              <select
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-sm bg-[#0A0A0B] border border-[#242428] focus:border-[#D49A2A] focus:outline-none font-mono-code text-xs text-[#F2EFE9]"
              >
                {STANDARD_30M_BLOCKS.map((t) => (
                  <option key={t} value={t}>
                    {t} hs
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-display uppercase tracking-wider text-[#8A8A93] mb-1">
                HORA FIN (:00 / :30)
              </label>
              <select
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-sm bg-[#0A0A0B] border border-[#242428] focus:border-[#D49A2A] focus:outline-none font-mono-code text-xs text-[#F2EFE9]"
              >
                {STANDARD_30M_BLOCKS.map((t) => (
                  <option key={t} value={t}>
                    {t} hs
                  </option>
                ))}
                <option value="22:00">22:00 hs</option>
              </select>
            </div>
          </div>

          {/* Row 2: Optional Break / Rest Cut */}
          <div className="p-3.5 rounded-sm bg-[#0A0A0B] border border-[#242428] space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeBreak}
                  onChange={(e) => setIncludeBreak(e.target.checked)}
                  className="accent-[#D49A2A] w-4 h-4"
                />
                <Coffee className="w-4 h-4 text-[#D49A2A]" />
                <span className="font-display text-xs uppercase font-bold tracking-wider text-[#F2EFE9]">
                  INCLUIR CORTE DE DESCANSO / ALMUERZO
                </span>
              </label>

              {includeBreak && (
                <span className="font-mono-code text-[11px] text-[#8A8A93]">
                  Saltea bloques entre {breakStart} y {breakEnd} hs
                </span>
              )}
            </div>

            {includeBreak && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[10px] font-display uppercase tracking-wider text-[#8A8A93] mb-1">
                    INICIO DESCANSO
                  </label>
                  <select
                    value={breakStart}
                    onChange={(e) => setBreakStart(e.target.value)}
                    className="w-full min-h-[40px] px-3 rounded-sm bg-[#121214] border border-[#242428] font-mono-code text-xs text-[#F2EFE9]"
                  >
                    {STANDARD_30M_BLOCKS.map((t) => (
                      <option key={t} value={t}>
                        {t} hs
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-display uppercase tracking-wider text-[#8A8A93] mb-1">
                    FIN DESCANSO (RETOMA)
                  </label>
                  <select
                    value={breakEnd}
                    onChange={(e) => setBreakEnd(e.target.value)}
                    className="w-full min-h-[40px] px-3 rounded-sm bg-[#121214] border border-[#242428] font-mono-code text-xs text-[#F2EFE9]"
                  >
                    {STANDARD_30M_BLOCKS.map((t) => (
                      <option key={t} value={t}>
                        {t} hs
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting || generationPreview.total === 0}
            className="w-full min-h-[48px] px-5 rounded-sm bg-[#D49A2A] hover:bg-[#C85A32] disabled:bg-[#242428] disabled:text-[#8A8A93] text-[#0A0A0B] font-display text-xs sm:text-sm uppercase font-extrabold tracking-wider flex items-center justify-center gap-2 transition-colors"
          >
            <CalendarPlus className="w-4 h-4" />
            <span>
              {submitting
                ? 'GENERANDO BLOQUES DE 30 MIN...'
                : `ABRIR JORNADA · GENERAR ${generationPreview.total} SLOTS DE 30 MIN`}
            </span>
          </button>
        </form>

        {errorMsg && (
          <div className="p-3 rounded-sm bg-[#0A0A0B] border border-[#C85A32] font-mono-code text-xs text-[#C85A32]">
            {errorMsg}
          </div>
        )}

        {feedback && (
          <div className="p-3 rounded-sm bg-[#0A0A0B] border border-[#D49A2A] font-mono-code text-xs text-[#D49A2A]">
            {feedback}
          </div>
        )}
      </section>

      {/* Interactive Toggle Grid for Selected Date */}
      <section className="p-5 rounded-sm bg-[#121214] border border-[#242428] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-sm font-extrabold uppercase tracking-wider text-[#F2EFE9]">
              CONTROL INDIVIDUAL POR CHIP (30 MIN) · {selectedDate}
            </h2>
            <p className="text-xs text-[#8A8A93]">
              Tocá cualquier bloque de 30 minutos para encenderlo (AVAILABLE) o apagarlo al instante.
            </p>
          </div>
          <div className="flex items-center gap-3 font-mono-code text-[11px]">
            <span className="text-[#D49A2A]">■ DISPONIBLE</span>
            <span className="text-[#C85A32]">■ CONFIRMADO</span>
            <span className="text-[#8A8A93]">□ CERRADO</span>
          </div>
        </div>

        {/* Date Selector Strip for Barber Grid */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {availableDatesForStrip.map((dStr) => {
            const { dayName, dayNumber, monthShort } = formatDateHeader(dStr);
            const isSelected = dStr === selectedDate;
            const countOnDay = slots.filter(
              (s) => s.start_time.slice(0, 10) === dStr,
            ).length;

            return (
              <button
                key={dStr}
                type="button"
                onClick={() => setSelectedDate(dStr)}
                className={`min-w-[78px] px-2.5 py-2 rounded-sm border text-center transition-colors shrink-0 ${
                  isSelected
                    ? 'bg-[#D49A2A] border-[#D49A2A] text-[#0A0A0B]'
                    : 'bg-[#0A0A0B] border-[#242428] text-[#F2EFE9] hover:border-[#D49A2A]'
                }`}
              >
                <span
                  className={`block font-display text-[9px] font-bold uppercase ${
                    isSelected ? 'text-[#0A0A0B]' : 'text-[#8A8A93]'
                  }`}
                >
                  {dayName} {monthShort}
                </span>
                <span className="block font-mono-code text-base font-bold">
                  {dayNumber}
                </span>
                <span
                  className={`block font-mono-code text-[9px] ${
                    isSelected ? 'text-[#0A0A0B]/80' : 'text-[#8A8A93]'
                  }`}
                >
                  {countOnDay} slots
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
          {STANDARD_30M_BLOCKS.map((hhmm) => {
            const existing = slotsForDateMap.get(hhmm);
            const status = existing?.status;

            return (
              <button
                key={hhmm}
                type="button"
                disabled={
                  submitting || (existing && existing.status !== 'AVAILABLE')
                }
                onClick={async () => {
                  setSubmitting(true);
                  try {
                    await onToggleSingleSlot({
                      date: selectedDate,
                      slot_start_time: hhmm,
                    });
                  } finally {
                    setSubmitting(false);
                  }
                }}
                className={`min-h-[60px] p-2.5 rounded-sm border flex flex-col items-center justify-center transition-colors ${
                  status === 'CONFIRMED'
                    ? 'bg-[#C85A32]/20 border-[#C85A32] text-[#F2EFE9]'
                    : status === 'PENDING_PAYMENT'
                      ? 'bg-[#D49A2A]/20 border-[#D49A2A] text-[#D49A2A]'
                      : status === 'AVAILABLE'
                        ? 'bg-[#D49A2A] border-[#D49A2A] text-[#0A0A0B]'
                        : 'bg-[#0A0A0B] border-[#242428] text-[#8A8A93] hover:border-[#D49A2A]'
                }`}
              >
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span className="font-mono-code text-sm font-bold">
                    {hhmm}
                  </span>
                </div>
                <span className="font-mono-code text-[10px] uppercase mt-1 flex items-center gap-1">
                  {status === 'CONFIRMED' ? (
                    <>
                      <CheckCircle2 className="w-3 h-3" />
                      {existing?.client?.dni || 'SEÑADO'}
                    </>
                  ) : status === 'PENDING_PAYMENT' ? (
                    <>
                      <Lock className="w-3 h-3" />
                      BLOQUEADO
                    </>
                  ) : status === 'AVAILABLE' ? (
                    <>
                      <Trash2 className="w-3 h-3" />
                      ACTIVO
                    </>
                  ) : (
                    'CERRADO'
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
};
