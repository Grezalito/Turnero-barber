import React, { useEffect, useMemo, useState } from 'react';
import {
  Clock,
  MapPin,
  CheckCircle2,
  Lock,
  ExternalLink,
  Sparkles,
  RefreshCw,
  CreditCard,
  Bot,
  TicketCheck,
  CalendarPlus,
  Download,
  MessageCircle,
  Mail,
  ShieldAlert,
} from 'lucide-react';
import { api } from '../services/api';
import {
  AppointmentSlot,
  LockSlotResponse,
  PublicBarberScheduleResponse,
  User,
} from '../types/api';
import {
  buildGoogleCalendarUrl,
  buildWhatsAppShareUrl,
  NON_REFUNDABLE_LEGEND,
} from '../utils/postBookingAndGamification';
import { SandboxCheckoutModal } from './SandboxCheckoutModal';

interface PublicBookingViewProps {
  schedule: PublicBarberScheduleResponse;
  slug: string;
  onChangeSlug: (newSlug: string) => void;
  onRefresh: () => void;
  user: User | null;
  selectedSlot: AppointmentSlot | null;
  onSelectSlot: (slot: AppointmentSlot | null) => void;
  activeLock: LockSlotResponse | null;
  onInitiateLock: (slot: AppointmentSlot) => Promise<void>;
  onSimulateWebhook: (slotId: string) => Promise<void>;
  onSimulateRejectedWebhook: (
    slotId: string,
  ) => Promise<{ mpPaymentId: string; reason: string }>;
  onReleaseLock: (slotId: string) => Promise<void>;
  isSandboxCheckoutOpen: boolean;
  onSetSandboxCheckoutOpen: (open: boolean) => void;
  onGoToClientAppointments?: () => void;
  confirmedSlotInfo: {
    slotId: string;
    mpPaymentId: string;
    startTimeIso?: string;
    endTimeIso?: string;
    barberPhone?: string;
    reminderEnqueued: boolean;
    reminderMessage?: string | null;
    emailMode?: string;
  } | null;
  isLocking: boolean;
}

export function formatTime30m(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function formatDateHeader(dateStr: string): {
  dayName: string;
  dayNumber: string;
  monthShort: string;
} {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d));
  const days = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
  const months = [
    'ENE',
    'FEB',
    'MAR',
    'ABR',
    'MAY',
    'JUN',
    'JUL',
    'AGO',
    'SEP',
    'OCT',
    'NOV',
    'DIC',
  ];
  return {
    dayName: days[dateObj.getUTCDay()],
    dayNumber: String(d).padStart(2, '0'),
    monthShort: months[dateObj.getUTCMonth()],
  };
}

export const PublicBookingView: React.FC<PublicBookingViewProps> = ({
  schedule,
  slug,
  onChangeSlug,
  onRefresh,
  user,
  selectedSlot,
  onSelectSlot,
  activeLock,
  onInitiateLock,
  onSimulateWebhook,
  onSimulateRejectedWebhook,
  onReleaseLock,
  isSandboxCheckoutOpen,
  onSetSandboxCheckoutOpen,
  onGoToClientAppointments,
  confirmedSlotInfo,
  isLocking,
}) => {
  const dateKeys = useMemo(
    () => Object.keys(schedule.dates).sort(),
    [schedule.dates],
  );
  const [selectedDate, setSelectedDate] = useState<string>(dateKeys[0] || '');
  const [slugInput, setSlugInput] = useState(slug);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);

  useEffect(() => {
    if (dateKeys.length > 0 && !dateKeys.includes(selectedDate)) {
      setSelectedDate(dateKeys[0]);
    }
  }, [dateKeys, selectedDate]);

  useEffect(() => {
    if (!activeLock?.slot.locked_until) {
      setRemainingSeconds(0);
      return;
    }

    const updateTimer = () => {
      const expiresMs = new Date(activeLock.slot.locked_until!).getTime();
      const diffSec = Math.max(0, Math.floor((expiresMs - Date.now()) / 1000));
      setRemainingSeconds(diffSec);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeLock]);

  const slotsForSelectedDate = useMemo(() => {
    if (!selectedDate) return [];
    return schedule.dates[selectedDate] || [];
  }, [schedule.dates, selectedDate]);

  const countdownFormatted = useMemo(() => {
    const mins = String(Math.floor(remainingSeconds / 60)).padStart(2, '0');
    const secs = String(remainingSeconds % 60).padStart(2, '0');
    return `${mins}:${secs}`;
  }, [remainingSeconds]);

  const isSandboxMode = activeLock?.payment.is_sandbox_local !== false;

  return (
    <div className="pb-32 space-y-6">
      {/* Barber Editorial Hero Card */}
      <section className="p-5 rounded-sm bg-[#121214] border border-[#242428]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#242428] pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono-code text-[11px] uppercase tracking-widest px-2 py-0.5 rounded-sm bg-[#0A0A0B] border border-[#D49A2A]/60 text-[#D49A2A]">
                AGENDA PÚBLICA
              </span>
              <span className="font-mono-code text-xs text-[#8A8A93]">
                /{schedule.barber.slug}
              </span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold uppercase tracking-tight text-[#F2EFE9] mt-2">
              {schedule.barber.shop_name}
            </h1>
            <p className="text-xs text-[#8A8A93] mt-1 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[#D49A2A]" />
              <span>
                {schedule.barber.address || 'Atención con reserva previa'} ·
                Barbero:{' '}
                <strong className="text-[#F2EFE9]">
                  {schedule.barber.barber_name}
                </strong>
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <div className="px-3 py-2 rounded-sm bg-[#0A0A0B] border border-[#242428] text-right">
              <span className="block text-[10px] font-display uppercase tracking-wider text-[#8A8A93]">
                SEÑA FIJA
              </span>
              <span className="font-mono-code text-base font-bold text-[#D49A2A]">
                $2.000 ARS
              </span>
            </div>
            <button
              type="button"
              onClick={onRefresh}
              title="Actualizar disponibilidad"
              className="min-w-[44px] min-h-[44px] rounded-sm bg-[#0A0A0B] border border-[#242428] hover:border-[#D49A2A] flex items-center justify-center text-[#8A8A93] hover:text-[#F2EFE9] transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Barber Slug Selector */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (slugInput.trim()) onChangeSlug(slugInput.trim());
          }}
          className="mt-4 flex items-center gap-2"
        >
          <span className="font-mono-code text-xs text-[#8A8A93] shrink-0">
            barberia/
          </span>
          <input
            type="text"
            value={slugInput}
            onChange={(e) => setSlugInput(e.target.value)}
            placeholder="slug-barbero"
            className="flex-1 min-h-[38px] px-3 rounded-sm bg-[#0A0A0B] border border-[#242428] focus:border-[#D49A2A] focus:outline-none font-mono-code text-xs text-[#F2EFE9]"
          />
          <button
            type="submit"
            className="min-h-[38px] px-3 rounded-sm bg-[#0A0A0B] border border-[#242428] hover:border-[#D49A2A] font-display text-[11px] uppercase font-bold tracking-wider text-[#F2EFE9] transition-colors"
          >
            CARGAR
          </button>
        </form>

        {/* Blindaje de Seña NO REEMBOLSABLE en Tarjeta de Reserva */}
        <div className="mt-4 p-3 rounded-sm bg-[#0A0A0B] border border-[#C85A32]/60 flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 text-[#C85A32] shrink-0 mt-0.5" />
          <p className="font-mono-code text-[11px] text-[#F2EFE9] leading-relaxed">
            {NON_REFUNDABLE_LEGEND}
          </p>
        </div>
      </section>

      {/* Active 10-Minute Lock Banner (PENDING_PAYMENT) */}
      {activeLock && remainingSeconds > 0 && (
        <section className="p-5 rounded-sm bg-[#121214] border border-[#D49A2A] space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-sm bg-[#0A0A0B] border border-[#D49A2A] flex items-center justify-center">
                <Lock className="w-4 h-4 text-[#D49A2A]" />
              </div>
              <div>
                <span className="font-mono-code text-[11px] uppercase tracking-widest text-[#D49A2A]">
                  BLOQUEADO POR 10 MINUTOS (PENDING_PAYMENT)
                </span>
                <h3 className="font-display text-base font-extrabold uppercase text-[#F2EFE9]">
                  TURNO {formatTime30m(activeLock.slot.start_time)} –{' '}
                  {formatTime30m(activeLock.slot.end_time)} HS
                </h3>
              </div>
            </div>
            <div className="px-3 py-1.5 rounded-sm bg-[#0A0A0B] border border-[#C85A32] text-right">
              <span className="block text-[9px] uppercase tracking-wider text-[#8A8A93]">
                EXPIRA EN
              </span>
              <span className="font-mono-code text-sm font-bold text-[#C85A32]">
                {countdownFormatted}
              </span>
            </div>
          </div>

          <p className="text-xs text-[#8A8A93] leading-relaxed">
            Tu bloque de 30 minutos está reservado temporalmente. Aboná la seña
            fija de{' '}
            <span className="font-mono-code text-[#F2EFE9] font-semibold">
              $2.000 ARS
            </span>{' '}
            antes de que el cron libere el turno.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {isSandboxMode ? (
              <button
                type="button"
                onClick={() => onSetSandboxCheckoutOpen(true)}
                className="min-h-[46px] px-4 rounded-sm bg-[#D49A2A] hover:bg-[#C85A32] text-[#0A0A0B] font-display text-xs uppercase font-extrabold tracking-wider flex items-center justify-center gap-2 transition-colors"
              >
                <CreditCard className="w-4 h-4" />
                <span>ABRIR CHECKOUT MERCADO PAGO · $2.000</span>
              </button>
            ) : (
              <a
                href={activeLock.payment.init_point}
                target="_blank"
                rel="noreferrer"
                className="min-h-[46px] px-4 rounded-sm bg-[#D49A2A] hover:bg-[#C85A32] text-[#0A0A0B] font-display text-xs uppercase font-extrabold tracking-wider flex items-center justify-center gap-2 transition-colors"
              >
                <span>PAGAR SEÑA EN MERCADO PAGO · $2.000</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}

            <button
              type="button"
              onClick={() => onSimulateWebhook(activeLock.slot.id)}
              className="min-h-[46px] px-4 rounded-sm bg-[#0A0A0B] border border-[#D49A2A] text-[#D49A2A] hover:bg-[#D49A2A]/10 font-mono-code text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>SIMULAR PAGO APROBADO ($2.000 ARS)</span>
            </button>
          </div>
        </section>
      )}

      {/* Confirmed Payment Banner (Pantalla de Éxito Post-Confirmación) */}
      {confirmedSlotInfo && (
        <section className="p-5 rounded-sm bg-[#121214] border border-[#D49A2A] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#242428] pb-3.5">
            <div className="flex items-center gap-2 text-[#D49A2A]">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <h3 className="font-display text-base font-extrabold uppercase tracking-wide text-[#F2EFE9]">
                ¡TURNO CONFIRMADO! SEÑA DE $2.000 ACREDITADA
              </h3>
            </div>

            {onGoToClientAppointments && (
              <button
                type="button"
                onClick={onGoToClientAppointments}
                className="min-h-[38px] px-3 rounded-sm bg-[#0A0A0B] border border-[#D49A2A] text-[#D49A2A] hover:bg-[#D49A2A] hover:text-[#0A0A0B] font-display text-[11px] uppercase font-bold tracking-wider flex items-center gap-1.5 self-start sm:self-center transition-colors"
              >
                <TicketCheck className="w-3.5 h-3.5" />
                <span>VER COMPROBANTE EN MIS TURNOS</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono-code text-xs text-[#8A8A93]">
            <span>
              mp_payment_id:{' '}
              <strong className="text-[#F2EFE9]">
                {confirmedSlotInfo.mpPaymentId}
              </strong>
            </span>
            <span>
              · slot_id:{' '}
              <strong className="text-[#F2EFE9]">
                {confirmedSlotInfo.slotId.slice(0, 8)}
              </strong>
            </span>
            <span>
              · estado: <strong className="text-[#D49A2A]">CONFIRMED</strong>
            </span>
            {confirmedSlotInfo.startTimeIso && confirmedSlotInfo.endTimeIso && (
              <span>
                · horario:{' '}
                <strong className="text-[#F2EFE9]">
                  {confirmedSlotInfo.startTimeIso.slice(0, 10)}{' '}
                  {formatTime30m(confirmedSlotInfo.startTimeIso)}–
                  {formatTime30m(confirmedSlotInfo.endTimeIso)} hs (30m)
                </strong>
              </span>
            )}
          </div>

          {/* Botones Post-Confirmación: Google Calendar, .ICS y WhatsApp */}
          {(() => {
            const startIso =
              confirmedSlotInfo.startTimeIso ||
              new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
            const endIso =
              confirmedSlotInfo.endTimeIso ||
              new Date(new Date(startIso).getTime() + 30 * 60 * 1000).toISOString();
            const gcalUrl = buildGoogleCalendarUrl({
              shopName: schedule.barber.shop_name,
              address: schedule.barber.address,
              barberName: schedule.barber.barber_name,
              startTimeIso: startIso,
              endTimeIso: endIso,
              mpPaymentId: confirmedSlotInfo.mpPaymentId,
              depositAmountArs: 2000,
            });
            const waUrl = buildWhatsAppShareUrl({
              barberPhone:
                confirmedSlotInfo.barberPhone || schedule.barber.barber_phone,
              startTimeIso: startIso,
              mpPaymentId: confirmedSlotInfo.mpPaymentId,
            });

            return (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <a
                  href={gcalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="min-h-[44px] px-3 rounded-sm bg-[#D49A2A] hover:bg-[#C85A32] text-[#0A0A0B] font-display text-[11px] uppercase font-extrabold tracking-wider flex items-center justify-center gap-1.5 transition-colors"
                >
                  <CalendarPlus className="w-4 h-4 shrink-0" />
                  <span>AGREGAR A GOOGLE CALENDAR</span>
                </a>

                <button
                  type="button"
                  onClick={() =>
                    api.downloadSlotIcs({
                      slotId: confirmedSlotInfo.slotId,
                      shopName: schedule.barber.shop_name,
                      address: schedule.barber.address,
                      barberName: schedule.barber.barber_name,
                      startTimeIso: startIso,
                      endTimeIso: endIso,
                      mpPaymentId: confirmedSlotInfo.mpPaymentId,
                    })
                  }
                  className="min-h-[44px] px-3 rounded-sm bg-[#0A0A0B] border border-[#D49A2A] text-[#D49A2A] hover:bg-[#D49A2A] hover:text-[#0A0A0B] font-display text-[11px] uppercase font-bold tracking-wider flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  <span>DESCARGAR CALENDARIO (.ICS)</span>
                </button>

                <a
                  href={waUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="min-h-[44px] px-3 rounded-sm bg-[#0A0A0B] border border-[#242428] hover:border-[#D49A2A] text-[#F2EFE9] font-display text-[11px] uppercase font-bold tracking-wider flex items-center justify-center gap-1.5 transition-colors"
                >
                  <MessageCircle className="w-4 h-4 text-[#D49A2A] shrink-0" />
                  <span>COMPARTIR POR WHATSAPP</span>
                </a>
              </div>
            );
          })()}

          {/* Notificación de Email + .ICS Adjunto */}
          <div className="p-3 rounded-sm bg-[#0A0A0B] border border-[#242428] flex items-center gap-2 font-mono-code text-[11px] text-[#8A8A93]">
            <Mail className="w-3.5 h-3.5 text-[#D49A2A] shrink-0" />
            <span>
              ✓ Comprobante con archivo <strong className="text-[#F2EFE9]">.ics adjunto</strong> enviado al cliente y aviso enviado al barbero vía <strong className="text-[#D49A2A]">MailService ({confirmedSlotInfo.emailMode || 'Nodemailer SMTP / Dev Fallback'})</strong>.
            </span>
          </div>

          {confirmedSlotInfo.reminderEnqueued && (
            <div className="p-3 rounded-sm bg-[#0A0A0B] border border-[#D49A2A]/50 space-y-1">
              <div className="flex items-center gap-1.5 font-mono-code text-[11px] text-[#D49A2A]">
                <Bot className="w-3.5 h-3.5" />
                <span>
                  ✓ Recordatorio IA generado en ReminderQueue (MockDeepSeekReminderService):
                </span>
              </div>
              {confirmedSlotInfo.reminderMessage && (
                <p className="font-mono-code text-xs text-[#F2EFE9] leading-relaxed">
                  {confirmedSlotInfo.reminderMessage}
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {/* Date Selector Strip */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xs font-extrabold uppercase tracking-widest text-[#8A8A93]">
            1. SELECCIONÁ FECHA
          </h2>
          <span className="font-mono-code text-xs text-[#8A8A93]">
            {dateKeys.length} {dateKeys.length === 1 ? 'día' : 'días'} con cupo
          </span>
        </div>

        {dateKeys.length === 0 ? (
          <div className="p-6 rounded-sm bg-[#121214] border border-[#242428] text-center">
            <p className="font-display text-sm uppercase font-bold text-[#F2EFE9]">
              SIN BLOQUES DISPONIBLES
            </p>
            <p className="text-xs text-[#8A8A93] mt-1">
              El barbero aún no habilitó bloques de 30 minutos para los próximos
              días.
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {dateKeys.map((dateStr) => {
              const { dayName, dayNumber, monthShort } =
                formatDateHeader(dateStr);
              const isSelected = dateStr === selectedDate;
              const count = schedule.dates[dateStr]?.length || 0;

              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => {
                    setSelectedDate(dateStr);
                    onSelectSlot(null);
                  }}
                  className={`min-w-[82px] p-3 rounded-sm border text-center transition-colors shrink-0 ${
                    isSelected
                      ? 'bg-[#D49A2A] border-[#D49A2A] text-[#0A0A0B]'
                      : 'bg-[#121214] border-[#242428] text-[#F2EFE9] hover:border-[#D49A2A]'
                  }`}
                >
                  <span
                    className={`block font-display text-[10px] font-bold uppercase tracking-wider ${
                      isSelected ? 'text-[#0A0A0B]' : 'text-[#8A8A93]'
                    }`}
                  >
                    {dayName} · {monthShort}
                  </span>
                  <span className="block font-mono-code text-xl font-bold mt-0.5">
                    {dayNumber}
                  </span>
                  <span
                    className={`block font-mono-code text-[10px] mt-1 ${
                      isSelected ? 'text-[#0A0A0B]/80' : 'text-[#8A8A93]'
                    }`}
                  >
                    {count} {count === 1 ? 'turno' : 'turnos'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* 3-to-4 Column Tactile Grid of 30-Minute Blocks */}
      {selectedDate && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xs font-extrabold uppercase tracking-widest text-[#8A8A93]">
              2. ELEGÍ TU BLOQUE EXACTO DE 30 MINUTOS
            </h2>
            <span className="font-mono-code text-[11px] text-[#D49A2A] flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              30 MIN ESTRICTOS
            </span>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
            {slotsForSelectedDate.map((slot) => {
              const startLabel = formatTime30m(slot.start_time);
              const endLabel = formatTime30m(slot.end_time);
              const isSelected = selectedSlot?.id === slot.id;

              return (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => onSelectSlot(isSelected ? null : slot)}
                  className={`min-h-[58px] px-2.5 py-2.5 rounded-sm border flex flex-col items-center justify-center transition-colors ${
                    isSelected
                      ? 'bg-[#D49A2A] border-[#D49A2A] text-[#0A0A0B]'
                      : 'bg-[#121214] border-[#242428] text-[#F2EFE9] hover:border-[#D49A2A]'
                  }`}
                >
                  <span className="font-mono-code text-base font-bold tracking-tight">
                    {startLabel}
                  </span>
                  <span
                    className={`font-mono-code text-[10px] mt-0.5 ${
                      isSelected ? 'text-[#0A0A0B]/80' : 'text-[#8A8A93]'
                    }`}
                  >
                    a {endLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Sticky Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-[#121214] border-t border-[#242428] p-3.5 sm:px-6">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            {selectedSlot ? (
              <>
                <span className="block font-display text-[10px] uppercase tracking-wider text-[#D49A2A] font-bold">
                  BLOQUE SELECCIONADO (30M)
                </span>
                <div className="flex items-baseline gap-2 truncate">
                  <span className="font-mono-code text-sm sm:text-base font-bold text-[#F2EFE9]">
                    {formatTime30m(selectedSlot.start_time)} –{' '}
                    {formatTime30m(selectedSlot.end_time)}
                  </span>
                  <span className="font-mono-code text-xs text-[#8A8A93]">
                    · {selectedDate}
                  </span>
                </div>
              </>
            ) : (
              <>
                <span className="block font-display text-[10px] uppercase tracking-wider text-[#8A8A93]">
                  RESERVA CON SEÑA OBLIGATORIA
                </span>
                <span className="block font-mono-code text-xs sm:text-sm text-[#F2EFE9]">
                  Tocá un horario de 30 min en la grilla
                </span>
              </>
            )}
          </div>

          <button
            type="button"
            disabled={!selectedSlot || isLocking}
            onClick={() => {
              if (selectedSlot) {
                onInitiateLock(selectedSlot);
              }
            }}
            className="min-h-[48px] px-4 sm:px-6 rounded-sm bg-[#D49A2A] hover:bg-[#C85A32] disabled:bg-[#242428] disabled:text-[#8A8A93] text-[#0A0A0B] font-display uppercase font-extrabold text-xs sm:text-sm tracking-wider shrink-0 transition-colors"
          >
            {isLocking ? (
              'BLOQUEANDO...'
            ) : (
              <>
                SEÑAR TURNO ·{' '}
                <span className="font-mono-code font-bold">$2.000</span>
              </>
            )}
          </button>
        </div>
        {!user && selectedSlot && (
          <div className="max-w-3xl mx-auto mt-1.5 text-[11px] text-[#8A8A93] font-mono-code">
            Al tocar &ldquo;Señar turno · $2.000&rdquo; se pedirá tu DNI y
            contraseña.
          </div>
        )}
        <div className="max-w-3xl mx-auto mt-1.5 text-[10px] text-[#C85A32] font-mono-code">
          {NON_REFUNDABLE_LEGEND}
        </div>
      </div>

      {/* Checkout Mercado Pago (Sandbox Local) Modal */}
      <SandboxCheckoutModal
        isOpen={isSandboxCheckoutOpen}
        onClose={() => onSetSandboxCheckoutOpen(false)}
        activeLock={activeLock}
        shopName={schedule.barber.shop_name}
        barberSlug={schedule.barber.slug}
        user={user}
        remainingSeconds={remainingSeconds}
        countdownFormatted={countdownFormatted}
        onSimulateApproved={onSimulateWebhook}
        onSimulateRejected={onSimulateRejectedWebhook}
        onReleaseLock={onReleaseLock}
      />
    </div>
  );
};
