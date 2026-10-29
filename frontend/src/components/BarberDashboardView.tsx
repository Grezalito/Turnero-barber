import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarPlus,
  Clock,
  CheckCircle2,
  Lock,
  Coffee,
  Eye,
  Trophy,
  Sparkles,
  MessageCircle,
  Phone,
  User as UserIcon,
  ChevronRight,
  X,
  Scissors,
  SlidersHorizontal,
  CalendarCheck2,
  Copy,
  Check,
  Link2,
  LogOut,
} from 'lucide-react';
import { api, getSlugFromAuthContext } from '../services/api';
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
  onLogout?: () => void;
}

type QuickViewFilter = 'HOY' | 'MANANA' | 'SEMANA';

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

function buildClientWhatsAppUrl(params: {
  phone?: string | null;
  clientName?: string | null;
  shopName: string;
  startTimeIso: string;
}): string {
  const cleanPhone = (params.phone || '5491155667788').replace(/\D/g, '');
  const timeStr = formatTime30m(params.startTimeIso);
  const name = params.clientName || 'Hola';
  const msg = `¡Hola ${name}! Te escribimos de ${params.shopName} por tu turno reservado a las ${timeStr} hs.`;
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
}

export const BarberDashboardView: React.FC<BarberDashboardViewProps> = ({
  barberInfo,
  slots,
  weeklyGoal,
  onGenerateRange,
  onToggleSingleSlot,
  onSwitchToPublicView,
  onLogout,
}) => {
  const todayIsoDate = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const tomorrowIsoDate = useMemo(() => {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  }, []);

  const [viewMode, setViewMode] = useState<QuickViewFilter>('HOY');
  const [selectedWeekDay, setSelectedWeekDay] = useState<string>(todayIsoDate);
  const [showFreeSlotsInTimeline, setShowFreeSlotsInTimeline] =
    useState<boolean>(false);

  const [isBonusModalOpen, setIsBonusModalOpen] = useState<boolean>(false);
  const [isScheduleConfigOpen, setIsScheduleConfigOpen] =
    useState<boolean>(false);

  // Slug del barbero obtenido dinámicamente de contexto de autenticación, GET /barbers/me o perfil
  const [resolvedSlug, setResolvedSlug] = useState<string>(
    () => barberInfo.slug || getSlugFromAuthContext() || '',
  );
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  useEffect(() => {
    if (barberInfo.slug) {
      setResolvedSlug(barberInfo.slug);
    } else {
      const authSlug = getSlugFromAuthContext();
      if (authSlug) {
        setResolvedSlug(authSlug);
      }
    }

    api
      .getBarberMe()
      .then((res) => {
        if (res?.slug) {
          setResolvedSlug(res.slug);
        }
      })
      .catch(() => {
        // conservar slug actual de sesión o perfil
      });
  }, [barberInfo.slug]);

  const barberSlug = resolvedSlug || barberInfo.slug || getSlugFromAuthContext() || '';
  const shareableBookingUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/${barberSlug}`
      : `http://localhost:5173/${barberSlug}`;
  const whatsappShareBookingUrl = `https://wa.me/?text=${encodeURIComponent(
    `¡Hola! Podés reservar y señar tu turno acá: ${shareableBookingUrl}`,
  )}`;

  const handleCopyBookingLink = async () => {
    try {
      await navigator.clipboard.writeText(shareableBookingUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Fallback para navegadores sin permiso directo de clipboard
      const textArea = document.createElement('textarea');
      textArea.value = shareableBookingUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const liveWeeklyMetrics = useMemo<WeeklyGoalMetrics>(() => {
    if (weeklyGoal) {
      return weeklyGoal;
    }
    const { weekStart, weekEnd } = getWeekBoundsUtc();
    const confirmedInCurrentWeek = slots.filter((s) => {
      if (s.status !== 'CONFIRMED') return false;
      const t = new Date(s.start_time).getTime();
      return t >= weekStart.getTime() && t <= weekEnd.getTime();
    }).length;

    const countToUse =
      confirmedInCurrentWeek > 0 ? confirmedInCurrentWeek : 12;

    return calculateWeeklyGoalMetrics(countToUse);
  }, [slots, weeklyGoal]);

  const weekDaysList = useMemo(() => {
    const list: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(Date.now() + i * 24 * 60 * 60 * 1000);
      list.push(d.toISOString().slice(0, 10));
    }
    return list;
  }, []);

  const activeDateForTimeline = useMemo(() => {
    if (viewMode === 'HOY') return todayIsoDate;
    if (viewMode === 'MANANA') return tomorrowIsoDate;
    return selectedWeekDay;
  }, [viewMode, todayIsoDate, tomorrowIsoDate, selectedWeekDay]);

  const timelineSlots = useMemo(() => {
    const daySlots = slots
      .filter((s) => s.start_time.slice(0, 10) === activeDateForTimeline)
      .sort(
        (a, b) =>
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
      );

    if (showFreeSlotsInTimeline) {
      return daySlots;
    }

    return daySlots.filter(
      (s) => s.status === 'CONFIRMED' || s.status === 'PENDING_PAYMENT',
    );
  }, [slots, activeDateForTimeline, showFreeSlotsInTimeline]);

  const freeSlotsCountOnActiveDate = useMemo(() => {
    return slots.filter(
      (s) =>
        s.start_time.slice(0, 10) === activeDateForTimeline &&
        s.status === 'AVAILABLE',
    ).length;
  }, [slots, activeDateForTimeline]);

  const bookedCountByMode = useMemo(() => {
    const isBooked = (s: AppointmentSlot) =>
      s.status === 'CONFIRMED' || s.status === 'PENDING_PAYMENT';
    const todayCount = slots.filter(
      (s) => s.start_time.slice(0, 10) === todayIsoDate && isBooked(s),
    ).length;
    const tomorrowCount = slots.filter(
      (s) => s.start_time.slice(0, 10) === tomorrowIsoDate && isBooked(s),
    ).length;
    const weekSet = new Set(weekDaysList);
    const weekCount = slots.filter(
      (s) => weekSet.has(s.start_time.slice(0, 10)) && isBooked(s),
    ).length;
    return { todayCount, tomorrowCount, weekCount };
  }, [slots, todayIsoDate, tomorrowIsoDate, weekDaysList]);

  // Estado para el modal de Configuración de Horarios
  const [configDate, setConfigDate] = useState<string>(tomorrowIsoDate);
  const [useDateRange, setUseDateRange] = useState<boolean>(false);
  const [endDate, setEndDate] = useState<string>(tomorrowIsoDate);
  const [rangeStart, setRangeStart] = useState<string>('10:00');
  const [rangeEnd, setRangeEnd] = useState<string>('20:00');
  const [includeBreak, setIncludeBreak] = useState<boolean>(true);
  const [breakStart, setBreakStart] = useState<string>('14:00');
  const [breakEnd, setBreakEnd] = useState<string>('16:00');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const slotsForConfigDateMap = useMemo(() => {
    const map = new Map<string, AppointmentSlot>();
    for (const s of slots) {
      if (s.start_time.slice(0, 10) === configDate) {
        map.set(formatTime30m(s.start_time), s);
      }
    }
    return map;
  }, [slots, configDate]);

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
    if (useDateRange && endDate >= configDate) {
      const d1 = new Date(`${configDate}T00:00:00.000Z`).getTime();
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
    configDate,
    endDate,
  ]);

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
          'El fin del descanso debe ser posterior al inicio del descanso.',
        );
      }

      const res = await onGenerateRange({
        date: configDate,
        ...(useDateRange && endDate >= configDate ? { end_date: endDate } : {}),
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

      setFeedback(
        `¡Listo! Se habilitaron ${countCreated} turnos de 30 minutos.`,
      );
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pb-24 space-y-4 max-w-full overflow-x-hidden">
      {/* TARJETA DESTACADA ARRIBA DE TODO: "Tu Link de Turnos" */}
      <section className="p-4 rounded-xl bg-[#0F172A] border border-[#2563EB]/50 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#2563EB]/12 border border-[#2563EB]/30 flex items-center justify-center text-[#2563EB] shrink-0">
              <Link2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#F8FAFC]">
                Tu Link de Turnos
              </h2>
              <p className="text-[11px] text-[#94A3B8]">
                Compartilo en tu biografía de Instagram o por WhatsApp
              </p>
            </div>
          </div>
        </div>

        <div className="px-3.5 py-2.5 rounded-lg bg-[#090D16] border border-[#1E293B] flex items-center justify-between gap-2 overflow-hidden">
          <span className="text-xs sm:text-sm font-medium text-[#F8FAFC] truncate select-all">
            {shareableBookingUrl}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleCopyBookingLink}
            className="min-h-[44px] px-3.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-[#F8FAFC] text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            {copiedLink ? (
              <>
                <Check className="w-4 h-4 shrink-0" />
                <span>¡Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 shrink-0" />
                <span>Copiar Link</span>
              </>
            )}
          </button>

          <a
            href={whatsappShareBookingUrl}
            target="_blank"
            rel="noreferrer"
            className="min-h-[44px] px-3.5 rounded-lg bg-[#090D16] border border-[#334155] hover:border-[#2563EB] text-[#F8FAFC] text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            <MessageCircle className="w-4 h-4 text-[#10B981] shrink-0" />
            <span>Compartir en WhatsApp</span>
          </a>
        </div>
      </section>

      {/* Cabecera Compacta del Barbero */}
      <section className="p-4 rounded-xl bg-[#0F172A] border border-[#1E293B] flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#2563EB]/12 border border-[#2563EB]/30 text-[#F8FAFC]">
              Panel Barbero
            </span>
            {barberInfo.reminder_addon_active && (
              <span className="text-xs font-medium text-[#10B981] flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                Recordatorio IA activo
              </span>
            )}
          </div>
          <h1 className="text-base sm:text-lg font-semibold text-[#F8FAFC] truncate mt-1">
            {barberInfo.shop_name}
          </h1>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsScheduleConfigOpen(true)}
            className="min-h-[44px] px-3 rounded-lg bg-[#090D16] border border-[#1E293B] hover:border-[#334155] text-[#F8FAFC] text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4 text-[#2563EB]" />
            <span>Horarios</span>
          </button>

          {onSwitchToPublicView && (
            <button
              type="button"
              onClick={onSwitchToPublicView}
              title="Ver como cliente"
              aria-label="Ver como cliente"
              className="min-h-[44px] px-3 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-[#F8FAFC] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Eye className="w-4 h-4" />
              <span className="hidden sm:inline">Vista pública</span>
            </button>
          )}

          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              title="Cerrar Sesión"
              aria-label="Cerrar Sesión"
              className="min-h-[44px] px-3 rounded-lg bg-[#0A0A0B] border border-[#C85A32] hover:bg-[#C85A32]/15 text-[#F2EFE9] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4 text-[#C85A32]" />
              <span className="hidden sm:inline">Cerrar Sesión</span>
            </button>
          )}
        </div>
      </section>

      {/* TARJETA DE GAMIFICACIÓN SEMANAL: Barra de Progreso en Azul y Verde Suave */}
      <button
        type="button"
        onClick={() => setIsBonusModalOpen(true)}
        className="w-full text-left p-4 rounded-xl bg-[#0F172A] border border-[#1E293B] hover:border-[#334155] transition-colors space-y-3 group cursor-pointer"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-[#2563EB]/12 border border-[#2563EB]/30 flex items-center justify-center text-[#2563EB] shrink-0">
              <Trophy className="w-4 h-4" />
            </div>
            <p className="text-xs sm:text-sm font-medium text-[#F8FAFC] leading-snug">
              <span className="font-semibold text-[#F8FAFC]">
                {liveWeeklyMetrics.confirmed_count}/
                {liveWeeklyMetrics.current_target} turnos esta semana
              </span>{' '}
              ·{' '}
              {liveWeeklyMetrics.remaining_for_next_tier > 0 ? (
                <span className="text-[#94A3B8]">
                  ¡Te faltan{' '}
                  <strong className="text-[#F8FAFC] font-semibold">
                    {liveWeeklyMetrics.remaining_for_next_tier}{' '}
                    {liveWeeklyMetrics.remaining_for_next_tier === 1
                      ? 'turno'
                      : 'turnos'}
                  </strong>{' '}
                  para cobrar{' '}
                  <strong className="text-[#10B981] font-semibold">
                    ${liveWeeklyMetrics.next_bonus_ars.toLocaleString('es-AR')}{' '}
                    ARS
                  </strong>{' '}
                  extra!
                </span>
              ) : (
                <span className="text-[#10B981] font-semibold">
                  ¡Meta máxima alcanzada! Cobrás $40.000 ARS extra esta semana.
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-1 text-[#94A3B8] group-hover:text-[#F8FAFC] shrink-0 text-xs font-medium">
            <span className="hidden sm:inline">Premios</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>

        {/* Barra de Progreso en Azul (#2563EB) y Verde Suave (#10B981) */}
        <div className="w-full h-2.5 rounded-full bg-[#090D16] border border-[#1E293B] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-[#2563EB] to-[#10B981]"
            style={{ width: `${liveWeeklyMetrics.progress_percentage}%` }}
          />
        </div>
      </button>

      {/* SELECTOR DE VISTA RÁPIDO ARRIBA: "HOY", "MAÑANA", "SEMANA" */}
      <section className="space-y-3">
        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[#0F172A] border border-[#1E293B]">
          <button
            type="button"
            onClick={() => setViewMode('HOY')}
            className={`min-h-[44px] px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              viewMode === 'HOY'
                ? 'bg-[#2563EB] text-[#F8FAFC]'
                : 'text-[#94A3B8] hover:text-[#F8FAFC]'
            }`}
          >
            <span>Hoy</span>
            <span
              className={`text-[11px] px-1.5 py-0.5 rounded-md ${
                viewMode === 'HOY'
                  ? 'bg-[#090D16]/40 text-[#F8FAFC]'
                  : 'bg-[#090D16] text-[#94A3B8]'
              }`}
            >
              {bookedCountByMode.todayCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('MANANA')}
            className={`min-h-[44px] px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              viewMode === 'MANANA'
                ? 'bg-[#2563EB] text-[#F8FAFC]'
                : 'text-[#94A3B8] hover:text-[#F8FAFC]'
            }`}
          >
            <span>Mañana</span>
            <span
              className={`text-[11px] px-1.5 py-0.5 rounded-md ${
                viewMode === 'MANANA'
                  ? 'bg-[#090D16]/40 text-[#F8FAFC]'
                  : 'bg-[#090D16] text-[#94A3B8]'
              }`}
            >
              {bookedCountByMode.tomorrowCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('SEMANA')}
            className={`min-h-[44px] px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              viewMode === 'SEMANA'
                ? 'bg-[#2563EB] text-[#F8FAFC]'
                : 'text-[#94A3B8] hover:text-[#F8FAFC]'
            }`}
          >
            <span>Semana</span>
            <span
              className={`text-[11px] px-1.5 py-0.5 rounded-md ${
                viewMode === 'SEMANA'
                  ? 'bg-[#090D16]/40 text-[#F8FAFC]'
                  : 'bg-[#090D16] text-[#94A3B8]'
              }`}
            >
              {bookedCountByMode.weekCount}
            </span>
          </button>
        </div>

        {viewMode === 'SEMANA' && (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-0.5">
            {weekDaysList.map((dStr) => {
              const { dayName, dayNumber, monthShort } = formatDateHeader(dStr);
              const isSelected = dStr === selectedWeekDay;
              const countBooked = slots.filter(
                (s) =>
                  s.start_time.slice(0, 10) === dStr &&
                  (s.status === 'CONFIRMED' || s.status === 'PENDING_PAYMENT'),
              ).length;

              return (
                <button
                  key={dStr}
                  type="button"
                  onClick={() => setSelectedWeekDay(dStr)}
                  className={`snap-start min-h-[52px] min-w-[80px] px-3 py-2 rounded-lg border text-center transition-colors shrink-0 flex flex-col items-center justify-center cursor-pointer ${
                    isSelected
                      ? 'bg-[#2563EB] border-[#2563EB] text-[#F8FAFC]'
                      : 'bg-[#0F172A] border-[#1E293B] text-[#F8FAFC] hover:border-[#334155]'
                  }`}
                >
                  <span className="text-xs font-semibold">
                    {dayName} {dayNumber}
                  </span>
                  <span
                    className={`text-[11px] mt-0.5 ${
                      isSelected ? 'text-[#F8FAFC]/90' : 'text-[#94A3B8]'
                    }`}
                  >
                    {monthShort} · {countBooked} t.
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* CABECERA DEL TIMELINE DEL DÍA */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2 px-0.5">
          <div>
            <h2 className="text-xs sm:text-sm font-semibold text-[#F8FAFC]">
              Turnos del día · {formatDateHeader(activeDateForTimeline).dayName}{' '}
              {formatDateHeader(activeDateForTimeline).dayNumber}{' '}
              {formatDateHeader(activeDateForTimeline).monthShort}
            </h2>
            <p className="text-xs text-[#94A3B8]">
              {freeSlotsCountOnActiveDate} horarios libres disponibles
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowFreeSlotsInTimeline((prev) => !prev)}
            className="min-h-[40px] px-3 rounded-lg bg-[#0F172A] border border-[#1E293B] hover:border-[#334155] text-xs font-medium text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer"
          >
            {showFreeSlotsInTimeline
              ? 'Ocultar libres'
              : `Ver libres (${freeSlotsCountOnActiveDate})`}
          </button>
        </div>

        {/* TIMELINE DE TARJETAS VERTICALES (Azul: Seña confirmada, Gris: Pendiente) */}
        {timelineSlots.length === 0 ? (
          <div className="p-8 rounded-xl bg-[#0F172A] border border-[#1E293B] text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-lg bg-[#2563EB]/12 border border-[#2563EB]/30 flex items-center justify-center text-[#2563EB]">
              <Scissors className="w-6 h-6" />
            </div>

            <div className="space-y-1 max-w-sm mx-auto">
              <h3 className="text-sm font-semibold text-[#F8FAFC]">
                No hay turnos reservados para este día
              </h3>
              <p className="text-xs text-[#94A3B8] leading-relaxed">
                {freeSlotsCountOnActiveDate > 0
                  ? `Tenés ${freeSlotsCountOnActiveDate} horarios habilitados. Compartí tu link para recibir reservas.`
                  : 'Habilitá tus horarios de atención de 30 minutos para recibir reservas.'}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setConfigDate(activeDateForTimeline);
                  setIsScheduleConfigOpen(true);
                }}
                className="w-full sm:w-auto min-h-[44px] px-4 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-[#F8FAFC] text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <CalendarPlus className="w-4 h-4" />
                <span>Abrir horarios del día</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="relative pl-4 sm:pl-6 before:content-[''] before:absolute before:left-1.5 sm:before:left-2.5 before:top-3 before:bottom-3 before:w-[2px] before:bg-[#1E293B] space-y-2.5">
            {timelineSlots.map((slot) => {
              const startLabel = formatTime30m(slot.start_time);
              const endLabel = formatTime30m(slot.end_time);
              const isConfirmed = slot.status === 'CONFIRMED';
              const isPending = slot.status === 'PENDING_PAYMENT';
              const clientName = slot.client?.name || 'Cliente reservado';
              const clientPhone = slot.client?.phone || '+54 9 11 5566-7788';
              const clientDni = slot.client?.dni;

              const waLink = buildClientWhatsAppUrl({
                phone: clientPhone,
                clientName,
                shopName: barberInfo.shop_name,
                startTimeIso: slot.start_time,
              });

              return (
                <article
                  key={slot.id}
                  className={`relative p-4 rounded-xl bg-[#0F172A] border transition-colors ${
                    isConfirmed
                      ? 'border-[#2563EB]/60'
                      : 'border-[#1E293B]'
                  }`}
                >
                  {/* Indicador de Timeline (Azul: Seña confirmada, Gris: Pendiente) */}
                  <span
                    className={`w-3 h-3 rounded-full absolute -left-[15px] sm:-left-[19px] top-6 border-2 border-[#090D16] ${
                      isConfirmed ? 'bg-[#2563EB]' : 'bg-[#94A3B8]'
                    }`}
                  />

                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Hora destacada */}
                        <div className="px-2.5 py-1 rounded-md bg-[#090D16] border border-[#1E293B] flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-[#2563EB]" />
                          <span className="text-sm sm:text-base font-semibold text-[#F8FAFC]">
                            {startLabel}
                          </span>
                          <span className="text-xs text-[#94A3B8]">
                            – {endLabel}
                          </span>
                        </div>

                        {/* Indicador de Estado: Azul (Seña confirmada) / Gris (Pendiente) */}
                        {isConfirmed ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#2563EB]/12 border border-[#2563EB]/40 text-[11px] font-semibold text-[#2563EB]">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Seña confirmada
                          </span>
                        ) : isPending ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#1E293B] border border-[#334155] text-[11px] font-medium text-[#94A3B8]">
                            <Lock className="w-3.5 h-3.5" />
                            Pendiente de pago
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#090D16] border border-[#1E293B] text-[11px] font-medium text-[#94A3B8]">
                            Horario libre
                          </span>
                        )}
                      </div>

                      {isConfirmed || isPending ? (
                        <div className="space-y-1 pt-0.5">
                          <div className="flex items-center gap-2">
                            <UserIcon className="w-4 h-4 text-[#94A3B8] shrink-0" />
                            <h3 className="text-sm sm:text-base font-semibold text-[#F8FAFC] truncate">
                              {clientName}
                            </h3>
                            {clientDni && (
                              <span className="text-xs text-[#94A3B8]">
                                · DNI {clientDni}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-xs text-[#94A3B8]">
                            <Phone className="w-3.5 h-3.5 shrink-0" />
                            <span>{clientPhone}</span>
                            <span className="text-[#F8FAFC] font-medium">
                              · Seña $2.000
                            </span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-[#94A3B8]">
                          Bloque de 30 minutos disponible en tu agenda.
                        </p>
                      )}
                    </div>

                    {isConfirmed || isPending ? (
                      <a
                        href={waLink}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Enviar WhatsApp a ${clientName}`}
                        className="min-h-[44px] min-w-[44px] px-3.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-[#F8FAFC] text-xs font-semibold flex items-center justify-center gap-1.5 shrink-0 transition-colors"
                      >
                        <MessageCircle className="w-4 h-4 shrink-0" />
                        <span className="hidden xs:inline sm:inline">
                          WhatsApp
                        </span>
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={async () => {
                          setSubmitting(true);
                          try {
                            await onToggleSingleSlot({
                              date: activeDateForTimeline,
                              slot_start_time: startLabel,
                            });
                          } finally {
                            setSubmitting(false);
                          }
                        }}
                        className="min-h-[44px] px-3 rounded-lg bg-[#090D16] border border-[#1E293B] hover:border-[#334155] text-[#94A3B8] hover:text-[#F8FAFC] text-xs font-medium shrink-0 transition-colors cursor-pointer"
                      >
                        Cerrar
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* MODAL EXPLICATIVO DE LOS 3 NIVELES DE BONOS ($10k, $25k, $40k) */}
      {isBonusModalOpen && (
        <div className="fixed inset-0 z-50 h-[100dvh] flex items-end sm:items-center justify-center bg-[#090D16]/85 backdrop-blur-xs p-0 sm:p-4 pointer-events-auto">
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsBonusModalOpen(false)}
          />

          <div className="relative z-50 w-full max-w-lg bg-[#0F172A] border-t sm:border border-[#1E293B] rounded-t-xl sm:rounded-xl p-5 sm:p-6 space-y-4 max-h-[90dvh] overflow-y-auto pointer-events-auto shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-lg bg-[#2563EB]/12 border border-[#2563EB]/30 flex items-center justify-center text-[#2563EB] shrink-0">
                  <Trophy className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-medium text-[#94A3B8]">
                    Premios semanales (lunes a domingo)
                  </span>
                  <h2 className="text-base sm:text-lg font-semibold text-[#F8FAFC]">
                    Tus niveles de bono extra
                  </h2>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsBonusModalOpen(false)}
                aria-label="Cerrar modal de bonos"
                className="w-9 h-9 rounded-lg bg-[#090D16] border border-[#1E293B] hover:border-[#334155] flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#94A3B8] leading-relaxed">
              Cuantos más turnos con seña completes en la semana, mayor es el
              bono extra que recibís:
            </p>

            <div className="space-y-2.5">
              <div
                className={`p-3.5 rounded-lg border flex items-center justify-between gap-3 ${
                  liveWeeklyMetrics.confirmed_count >= 15
                    ? 'bg-[#2563EB]/12 border-[#2563EB]'
                    : 'bg-[#090D16] border-[#1E293B]'
                }`}
              >
                <div>
                  <span className="text-xs font-semibold text-[#F8FAFC] flex items-center gap-1.5">
                    Nivel 1 · 15 turnos en la semana
                    {liveWeeklyMetrics.confirmed_count >= 15 && (
                      <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
                    )}
                  </span>
                  <span className="block text-xs text-[#94A3B8] mt-0.5">
                    Aproximadamente 2 a 3 turnos por día
                  </span>
                </div>
                <span className="text-sm font-semibold text-[#10B981] shrink-0">
                  +$10.000 ARS
                </span>
              </div>

              <div
                className={`p-3.5 rounded-lg border flex items-center justify-between gap-3 ${
                  liveWeeklyMetrics.confirmed_count >= 35
                    ? 'bg-[#2563EB]/12 border-[#2563EB]'
                    : 'bg-[#090D16] border-[#1E293B]'
                }`}
              >
                <div>
                  <span className="text-xs font-semibold text-[#F8FAFC] flex items-center gap-1.5">
                    Nivel 2 · 35 turnos en la semana
                    {liveWeeklyMetrics.confirmed_count >= 35 && (
                      <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
                    )}
                  </span>
                  <span className="block text-xs text-[#94A3B8] mt-0.5">
                    Aproximadamente 6 turnos por día
                  </span>
                </div>
                <span className="text-sm font-semibold text-[#10B981] shrink-0">
                  +$25.000 ARS
                </span>
              </div>

              <div
                className={`p-3.5 rounded-lg border flex items-center justify-between gap-3 ${
                  liveWeeklyMetrics.confirmed_count >= 50
                    ? 'bg-[#2563EB]/12 border-[#2563EB]'
                    : 'bg-[#090D16] border-[#1E293B]'
                }`}
              >
                <div>
                  <span className="text-xs font-semibold text-[#F8FAFC] flex items-center gap-1.5">
                    Nivel 3 · 50 turnos en la semana
                    {liveWeeklyMetrics.confirmed_count >= 50 && (
                      <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
                    )}
                  </span>
                  <span className="block text-xs text-[#94A3B8] mt-0.5">
                    Incluye módulo Recordatorio IA bonificado
                  </span>
                </div>
                <span className="text-sm font-semibold text-[#10B981] shrink-0">
                  +$40.000 ARS
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsBonusModalOpen(false)}
              className="w-full min-h-[48px] rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-[#F8FAFC] text-xs font-semibold transition-colors cursor-pointer"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIGURACIÓN DE HORARIOS */}
      {isScheduleConfigOpen && (
        <div className="fixed inset-0 z-50 h-[100dvh] flex items-end sm:items-center justify-center bg-[#090D16]/85 backdrop-blur-xs p-0 sm:p-4 pointer-events-auto">
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsScheduleConfigOpen(false)}
          />

          <div className="relative z-50 w-full max-w-2xl bg-[#0F172A] border-t sm:border border-[#1E293B] rounded-t-xl sm:rounded-xl p-5 sm:p-6 space-y-4 max-h-[92dvh] overflow-y-auto pointer-events-auto shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-[#1E293B] pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-lg bg-[#2563EB]/12 border border-[#2563EB]/30 flex items-center justify-center text-[#2563EB] shrink-0">
                  <CalendarCheck2 className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-medium text-[#94A3B8]">
                    Turnos de 30 minutos
                  </span>
                  <h2 className="text-base sm:text-lg font-semibold text-[#F8FAFC]">
                    Configurar mis horarios
                  </h2>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsScheduleConfigOpen(false)}
                aria-label="Cerrar configuración de horarios"
                className="w-9 h-9 rounded-lg bg-[#090D16] border border-[#1E293B] hover:border-[#334155] flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRangeSubmit} className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#F8FAFC]">
                  1. Abrir jornada completa
                </span>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={useDateRange}
                    onChange={(e) => {
                      setUseDateRange(e.target.checked);
                      if (e.target.checked && endDate < configDate) {
                        setEndDate(configDate);
                      }
                    }}
                    className="accent-[#2563EB] w-4 h-4"
                  />
                  <span className="text-xs text-[#94A3B8]">Varios días</span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#94A3B8] mb-1">
                    {useDateRange ? 'Desde' : 'Día'}
                  </label>
                  <input
                    type="date"
                    value={configDate}
                    onChange={(e) => {
                      setConfigDate(e.target.value);
                      if (endDate < e.target.value) setEndDate(e.target.value);
                    }}
                    className="w-full min-h-[44px] px-3 rounded-lg bg-[#090D16] border border-[#1E293B] text-xs text-[#F8FAFC]"
                  />
                </div>

                {useDateRange && (
                  <div>
                    <label className="block text-xs font-medium text-[#94A3B8] mb-1">
                      Hasta
                    </label>
                    <input
                      type="date"
                      min={configDate}
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full min-h-[44px] px-3 rounded-lg bg-[#090D16] border border-[#1E293B] text-xs text-[#F8FAFC]"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-[#94A3B8] mb-1">
                    Desde hora
                  </label>
                  <select
                    value={rangeStart}
                    onChange={(e) => setRangeStart(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-lg bg-[#090D16] border border-[#1E293B] text-xs text-[#F8FAFC]"
                  >
                    {STANDARD_30M_BLOCKS.map((t) => (
                      <option key={t} value={t}>
                        {t} hs
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#94A3B8] mb-1">
                    Hasta hora
                  </label>
                  <select
                    value={rangeEnd}
                    onChange={(e) => setRangeEnd(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-lg bg-[#090D16] border border-[#1E293B] text-xs text-[#F8FAFC]"
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

              <div className="p-3.5 rounded-lg bg-[#090D16] border border-[#1E293B] space-y-3">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeBreak}
                    onChange={(e) => setIncludeBreak(e.target.checked)}
                    className="accent-[#2563EB] w-4 h-4"
                  />
                  <Coffee className="w-4 h-4 text-[#2563EB]" />
                  <span className="text-xs font-medium text-[#F8FAFC]">
                    Pausa de descanso / almuerzo
                  </span>
                </label>

                {includeBreak && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-[#94A3B8] mb-1">
                        Inicio pausa
                      </label>
                      <select
                        value={breakStart}
                        onChange={(e) => setBreakStart(e.target.value)}
                        className="w-full min-h-[44px] px-3 rounded-lg bg-[#0F172A] border border-[#1E293B] text-xs text-[#F8FAFC]"
                      >
                        {STANDARD_30M_BLOCKS.map((t) => (
                          <option key={t} value={t}>
                            {t} hs
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[#94A3B8] mb-1">
                        Retoma a las
                      </label>
                      <select
                        value={breakEnd}
                        onChange={(e) => setBreakEnd(e.target.value)}
                        className="w-full min-h-[44px] px-3 rounded-lg bg-[#0F172A] border border-[#1E293B] text-xs text-[#F8FAFC]"
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
                className="w-full min-h-[48px] px-4 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-[#F8FAFC] text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <CalendarPlus className="w-4 h-4" />
                <span>
                  {submitting
                    ? 'Guardando horarios...'
                    : `Habilitar ${generationPreview.total} turnos de 30 min`}
                </span>
              </button>
            </form>

            {errorMsg && (
              <div className="p-3 rounded-lg bg-[#090D16] border border-[#334155] text-xs text-[#F8FAFC]">
                {errorMsg}
              </div>
            )}

            {feedback && (
              <div className="p-3 rounded-lg bg-[#2563EB]/12 border border-[#2563EB]/40 text-xs text-[#F8FAFC]">
                {feedback}
              </div>
            )}

            <div className="pt-3 border-t border-[#1E293B] space-y-3">
              <span className="block text-xs font-semibold text-[#F8FAFC]">
                2. Prender o apagar horarios puntuales ({configDate})
              </span>

              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {STANDARD_30M_BLOCKS.map((hhmm) => {
                  const existing = slotsForConfigDateMap.get(hhmm);
                  const status = existing?.status;

                  return (
                    <button
                      key={hhmm}
                      type="button"
                      disabled={
                        submitting ||
                        (existing && existing.status !== 'AVAILABLE')
                      }
                      onClick={async () => {
                        setSubmitting(true);
                        try {
                          await onToggleSingleSlot({
                            date: configDate,
                            slot_start_time: hhmm,
                          });
                        } finally {
                          setSubmitting(false);
                        }
                      }}
                      className={`min-h-[48px] p-2 rounded-lg border flex flex-col items-center justify-center transition-colors cursor-pointer ${
                        status === 'CONFIRMED'
                          ? 'bg-[#2563EB]/20 border-[#2563EB] text-[#F8FAFC]'
                          : status === 'PENDING_PAYMENT'
                            ? 'bg-[#1E293B] border-[#334155] text-[#94A3B8]'
                            : status === 'AVAILABLE'
                              ? 'bg-[#2563EB] border-[#2563EB] text-[#F8FAFC]'
                              : 'bg-[#090D16] border-[#1E293B] text-[#94A3B8]'
                      }`}
                    >
                      <span className="text-sm font-semibold">{hhmm}</span>
                      <span className="text-[10px]">
                        {status === 'CONFIRMED'
                          ? 'Confirmado'
                          : status === 'PENDING_PAYMENT'
                            ? 'Pendiente'
                            : status === 'AVAILABLE'
                              ? 'Abierto'
                              : 'Cerrado'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
