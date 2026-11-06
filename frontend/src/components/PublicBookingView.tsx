import React, { useEffect, useMemo, useState } from 'react';
import {
  Clock,
  CheckCircle2,
  CreditCard,
  CalendarPlus,
  Download,
  MessageCircle,
  ShieldAlert,
  X,
  CalendarX2,
  Loader2,
  KeyRound,
  Ticket,
} from 'lucide-react';
import { api } from '../services/api';
import {
  AppointmentSlot,
  LockSlotResponse,
  PublicBarberScheduleResponse,
} from '../types/api';
import { PushReminderOptIn } from './PushReminderOptIn';
import {
  buildGoogleCalendarUrl,
  buildWhatsAppShareUrl,
} from '../utils/postBookingAndGamification';
import { SandboxCheckoutModal } from './SandboxCheckoutModal';
import { formatDateHeader, formatTime30m } from '../utils/slotFormat';

export interface InlineBookingClientData {
  dni: string;
  name: string;
  phone: string;
  password?: string;
}

interface PublicBookingViewProps {
  schedule: PublicBarberScheduleResponse;
  slug: string;
  onChangeSlug: (newSlug: string) => void;
  onRefresh: () => void;
  selectedSlot: AppointmentSlot | null;
  onSelectSlot: (slot: AppointmentSlot | null) => void;
  activeLock?: LockSlotResponse | null;
  onInitiateLock?: (
    slot: AppointmentSlot,
    clientData?: InlineBookingClientData,
  ) => Promise<void>;
  onSimulateWebhook?: (slotId: string) => Promise<void>;
  onSimulateRejectedWebhook?: (
    slotId: string,
  ) => Promise<{ mpPaymentId: string; reason: string }>;
  onReleaseLock?: (slotId: string) => Promise<void>;
  isSandboxCheckoutOpen?: boolean;
  onSetSandboxCheckoutOpen?: (open: boolean) => void;
  onOpenBarberAccess?: () => void;
  confirmedSlotInfo: {
    slotId: string;
    mpPaymentId: string;
    startTimeIso?: string;
    endTimeIso?: string;
    barberPhone?: string;
    emailMode?: string;
    whatsappBarberNotifyUrl?: string | null;
    bookingUrl?: string | null;
  } | null;
  isLocking: boolean;
}

export const PublicBookingView: React.FC<PublicBookingViewProps> = ({
  schedule,
  slug,
  onRefresh,
  selectedSlot,
  onSelectSlot,
  activeLock = null,
  onInitiateLock,
  onSimulateWebhook,
  onSimulateRejectedWebhook,
  onReleaseLock,
  isSandboxCheckoutOpen = false,
  onSetSandboxCheckoutOpen,
  onOpenBarberAccess,
  confirmedSlotInfo,
  isLocking,
}) => {
  const dateKeys = useMemo(
    () => Object.keys(schedule.dates).sort(),
    [schedule.dates],
  );
  const [selectedDate, setSelectedDate] = useState<string>(dateKeys[0] || '');

  // Guest Checkout 100% libre de login (Solo Nombre, DNI, WhatsApp transaccionales)
  const [isConfirmSheetOpen, setIsConfirmSheetOpen] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [confirmDni, setConfirmDni] = useState('');
  const [confirmPhone, setConfirmPhone] = useState('');
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [isConnectingMp, setIsConnectingMp] = useState(false);
  const [toastAlert, setToastAlert] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(600);

  useEffect(() => {
    if (dateKeys.length > 0 && !dateKeys.includes(selectedDate)) {
      setSelectedDate(dateKeys[0]);
    }
  }, [dateKeys, selectedDate]);

  useEffect(() => {
    if (!toastAlert) return;
    const timer = setTimeout(() => setToastAlert(null), 6000);
    return () => clearTimeout(timer);
  }, [toastAlert]);

  useEffect(() => {
    if (!activeLock?.slot.locked_until) {
      setRemainingSeconds(600);
      return;
    }
    const updateCountdown = () => {
      const diffSec = Math.max(
        0,
        Math.floor(
          (new Date(activeLock.slot.locked_until!).getTime() - Date.now()) /
            1000,
        ),
      );
      setRemainingSeconds(diffSec);
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [activeLock]);

  const countdownFormatted = useMemo(() => {
    const mins = String(Math.floor(remainingSeconds / 60)).padStart(2, '0');
    const secs = String(remainingSeconds % 60).padStart(2, '0');
    return `${mins}:${secs}`;
  }, [remainingSeconds]);

  const slotsForSelectedDate = useMemo(() => {
    if (!selectedDate) return [];
    return schedule.dates[selectedDate] || [];
  }, [schedule.dates, selectedDate]);

  const { morningSlots, afternoonSlots } = useMemo(() => {
    const morning: AppointmentSlot[] = [];
    const afternoon: AppointmentSlot[] = [];
    for (const slot of slotsForSelectedDate) {
      const hourUtc = new Date(slot.start_time).getUTCHours();
      if (hourUtc < 13) {
        morning.push(slot);
      } else {
        afternoon.push(slot);
      }
    }
    return { morningSlots: morning, afternoonSlots: afternoon };
  }, [slotsForSelectedDate]);

  const handleConfirmSheetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot) return;

    const cleanDni = confirmDni.replace(/\D/g, '');
    if (cleanDni.length < 7 || cleanDni.length > 9) {
      setConfirmError('Ingresá un DNI válido de 7 a 9 números.');
      return;
    }
    if (!confirmName.trim()) {
      setConfirmError('Ingresá tu nombre y apellido.');
      return;
    }
    if (!confirmPhone.trim() || confirmPhone.replace(/\D/g, '').length < 8) {
      setConfirmError('Ingresá un número de WhatsApp válido.');
      return;
    }

    setConfirmError(null);
    setToastAlert(null);
    setIsConnectingMp(true);

    try {
      const data = await api.createPaymentPreference({
        slotId: selectedSlot.id,
        clientDni: cleanDni,
        clientName: confirmName.trim(),
        clientPhone: confirmPhone.trim(),
      });

      if (!data?.init_point) {
        throw new Error(
          'No se recibió el link de pago desde Mercado Pago. Intentá nuevamente.',
        );
      }

      // Validación anti-Open Redirect (ISO 27001 A.8.26): verificar que init_point apunte exclusivamente a dominios oficiales de Mercado Pago (o localhost en dev)
      const parsedCheckoutUrl = new URL(data.init_point);
      const allowedMpHost =
        parsedCheckoutUrl.protocol === 'https:' &&
        (parsedCheckoutUrl.hostname.endsWith('.mercadopago.com') ||
          parsedCheckoutUrl.hostname.endsWith('.mercadopago.com.ar') ||
          parsedCheckoutUrl.hostname.endsWith('.mercadopago.cl') ||
          parsedCheckoutUrl.hostname.endsWith('.mercadopago.com.mx') ||
          parsedCheckoutUrl.hostname.endsWith('.mercadolivre.com'));
      const allowedDevHost =
        import.meta.env.DEV &&
        (parsedCheckoutUrl.hostname === 'localhost' ||
          parsedCheckoutUrl.hostname === '127.0.0.1');

      if (!allowedMpHost && !allowedDevHost) {
        throw new Error(
          'Por seguridad se bloqueó una redirección hacia un dominio de pago no verificado.',
        );
      }

      // Limpiar PII de memoria del formulario antes de abandonar la página (ISO 27701 Minimización)
      setConfirmDni('');
      setConfirmPhone('');

      // Redirección nativa inmediata en la misma ventana a Mercado Pago
      window.location.href = parsedCheckoutUrl.toString();
    } catch (err) {
      const message = (err as Error).message || '';

      // En desarrollo local (desacoplado de producción), si no hay MP_ACCESS_TOKEN productivo configurado,
      // permitimos abrir el simulador Sandbox local para pruebas de flujo sin afectar producción.
      if (
        import.meta.env.DEV &&
        onInitiateLock &&
        !message.includes('409') &&
        !message.includes('reservado')
      ) {
        setIsConfirmSheetOpen(false);
        setIsConnectingMp(false);
        await onInitiateLock(selectedSlot, {
          dni: cleanDni,
          name: confirmName.trim(),
          phone: confirmPhone.trim(),
        });
        return;
      }

      const displayMessage =
        message ||
        'Este horario acaba de ser tomado o no está disponible. Por favor elegí otro turno.';
      setConfirmError(displayMessage);
      setToastAlert(displayMessage);
      setIsConnectingMp(false);
      onRefresh();
    }
  };

  const isBusy = isLocking || isConnectingMp;

  return (
    <div className="pb-24 space-y-4 max-w-full overflow-x-hidden">
      {/* Toast de Alerta Amigable */}
      {toastAlert && (
        <div
          role="alert"
          className="fixed top-16 left-3.5 right-3.5 sm:left-auto sm:right-6 sm:max-w-md z-50 p-3.5 rounded-xl bg-[#0F172A] border border-[#2563EB] shadow-2xl flex items-start justify-between gap-3"
        >
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-[#3B82F6] shrink-0 mt-0.5" />
            <p className="text-xs font-medium text-[#F8FAFC] leading-relaxed">
              {toastAlert}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setToastAlert(null)}
            aria-label="Cerrar alerta"
            className="text-[#94A3B8] hover:text-[#F8FAFC] shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Banner de Éxito cuando el turno fue confirmado (Retorno de Mercado Pago o Webhook) */}
      {confirmedSlotInfo && (
        <section className="p-4 sm:p-5 rounded-xl bg-[#0F172A] border border-[#2563EB] space-y-3.5 shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#2563EB]/15 border border-[#2563EB]/40 flex items-center justify-center text-[#3B82F6] shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-semibold text-[#3B82F6] block">
                  Seña acreditada · $2.000 ARS · ID{' '}
                  {confirmedSlotInfo.mpPaymentId}
                </span>
                <h3 className="text-sm sm:text-base font-semibold text-[#F8FAFC]">
                  ¡Tu turno de 30 minutos ya está confirmado!
                </h3>
              </div>
            </div>
          </div>

          {(() => {
            const startIso =
              confirmedSlotInfo.startTimeIso ||
              new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
            const endIso =
              confirmedSlotInfo.endTimeIso ||
              new Date(
                new Date(startIso).getTime() + 30 * 60 * 1000,
              ).toISOString();
            const gcalUrl = buildGoogleCalendarUrl({
              shopName: schedule.barber.shop_name,
              address: schedule.barber.address,
              barberName: schedule.barber.barber_name,
              startTimeIso: startIso,
              endTimeIso: endIso,
              mpPaymentId: confirmedSlotInfo.mpPaymentId,
              depositAmountArs: 2000,
            });
            // El backend arma el aviso completo (cliente, teléfono, servicio, seña); el builder local es fallback.
            const waUrl =
              confirmedSlotInfo.whatsappBarberNotifyUrl ||
              buildWhatsAppShareUrl({
                barberPhone:
                  confirmedSlotInfo.barberPhone || schedule.barber.barber_phone,
                startTimeIso: startIso,
                mpPaymentId: confirmedSlotInfo.mpPaymentId,
              });

            return (
              <div className="space-y-2">
              <div className={`grid grid-cols-1 gap-2 ${waUrl ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
                <a
                  href={gcalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="min-h-[44px] px-3 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-[#F8FAFC] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <CalendarPlus className="w-4 h-4 shrink-0" />
                  <span>Google Calendar</span>
                </a>

                <button
                  type="button"
                  onClick={() =>
                    api.downloadSlotIcs({
                      slotId: confirmedSlotInfo.slotId,
                      bookingRef: confirmedSlotInfo.bookingUrl
                        ? new URL(confirmedSlotInfo.bookingUrl).searchParams.get('ref')
                        : null,
                      shopName: schedule.barber.shop_name,
                      address: schedule.barber.address,
                      barberName: schedule.barber.barber_name,
                      startTimeIso: startIso,
                      endTimeIso: endIso,
                      mpPaymentId: confirmedSlotInfo.mpPaymentId,
                    })
                  }
                  className="min-h-[44px] px-3 rounded-lg bg-[#090D16] border border-[#1E293B] hover:border-[#334155] text-[#F8FAFC] text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4 text-[#3B82F6] shrink-0" />
                  <span>Descargar .ICS</span>
                </button>

                {waUrl && (
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="min-h-[44px] px-3 rounded-lg bg-[#090D16] border border-[#1E293B] hover:border-[#334155] text-[#F8FAFC] text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <MessageCircle className="w-4 h-4 text-[#3B82F6] shrink-0" />
                    <span>Avisar al barbero por WhatsApp</span>
                  </a>
                )}
              </div>
              {confirmedSlotInfo.bookingUrl && (
                <a
                  href={new URL(confirmedSlotInfo.bookingUrl).pathname + new URL(confirmedSlotInfo.bookingUrl).search}
                  className="min-h-[44px] px-3 rounded-lg bg-[#090D16] border border-[#1E293B] hover:border-[#334155] text-[#F8FAFC] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Ticket className="w-4 h-4 text-[#3B82F6] shrink-0" />
                  <span>Ver o gestionar mi turno</span>
                </a>
              )}
              <PushReminderOptIn slotId={confirmedSlotInfo.slotId} />
              </div>
            );
          })()}
        </section>
      )}

      {/* 1. BARRA DE SELECCIÓN DE DÍA (En Primera Pantalla Móvil sin scroll) */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-0.5">
          <h2 className="text-xs font-semibold uppercase tracking-normal text-[#94A3B8]">
            Seleccioná el día
          </h2>
          <span className="text-xs font-medium text-[#94A3B8]">
            Turnos de 30 min
          </span>
        </div>

        {dateKeys.length === 0 ? (
          <div className="p-6 rounded-xl bg-[#0F172A] border border-[#1E293B] text-center space-y-2">
            <CalendarX2 className="w-6 h-6 text-[#3B82F6] mx-auto" />
            <p className="text-sm font-semibold text-[#F8FAFC]">
              Sin turnos disponibles por el momento
            </p>
            <p className="text-xs text-[#94A3B8]">
              El barbero actualizará su agenda en breve.
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-0.5">
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
                  className={`snap-start min-h-[54px] min-w-[82px] px-3 py-2 rounded-lg border text-center transition-colors shrink-0 flex flex-col items-center justify-center cursor-pointer ${
                    isSelected
                      ? 'bg-[#2563EB] border-[#2563EB] text-[#F8FAFC]'
                      : 'bg-[#0F172A] border-[#1E293B] text-[#F8FAFC] hover:border-[#334155]'
                  }`}
                >
                  <span className="text-xs font-semibold">
                    {dayName} {dayNumber}
                  </span>
                  <span
                    className={`text-[11px] font-medium mt-0.5 ${
                      isSelected ? 'text-[#F8FAFC]/90' : 'text-[#94A3B8]'
                    }`}
                  >
                    {monthShort} · {count} disp.
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* 2. GRILLA DE HORARIOS DE 30 MINUTOS (Directo en primera pantalla) */}
      {selectedDate && (
        <section className="space-y-3">
          {slotsForSelectedDate.length === 0 ? (
            <div className="p-6 rounded-xl bg-[#0F172A] border border-[#1E293B] text-center space-y-2">
              <CalendarX2 className="w-6 h-6 text-[#94A3B8] mx-auto" />
              <p className="text-sm font-semibold text-[#F8FAFC]">
                No quedan horarios libres en este día
              </p>
              <p className="text-xs text-[#94A3B8]">
                Elegí otro día en la barra superior.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Bloque Mañana */}
              {morningSlots.length > 0 && (
                <div className="p-3.5 rounded-xl bg-[#0F172A] border border-[#1E293B] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#94A3B8]">
                      Mañana
                    </span>
                    <span className="text-[11px] font-medium text-[#94A3B8]">
                      {morningSlots.length} disponibles
                    </span>
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {morningSlots.map((slot) => {
                      const startLabel = formatTime30m(slot.start_time);
                      const isSelected = selectedSlot?.id === slot.id;

                      return (
                        <button
                          key={slot.id}
                          type="button"
                          onClick={() => onSelectSlot(isSelected ? null : slot)}
                          className={`min-h-[48px] px-3 py-2.5 rounded-lg border text-sm font-semibold transition-colors flex items-center justify-center cursor-pointer ${
                            isSelected
                              ? 'bg-[#2563EB] border-[#2563EB] text-[#F8FAFC]'
                              : 'bg-[#090D16] border-[#1E293B] text-[#F8FAFC] hover:border-[#334155]'
                          }`}
                        >
                          {startLabel}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Bloque Tarde */}
              {afternoonSlots.length > 0 && (
                <div className="p-3.5 rounded-xl bg-[#0F172A] border border-[#1E293B] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#94A3B8]">
                      Tarde
                    </span>
                    <span className="text-[11px] font-medium text-[#94A3B8]">
                      {afternoonSlots.length} disponibles
                    </span>
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {afternoonSlots.map((slot) => {
                      const startLabel = formatTime30m(slot.start_time);
                      const isSelected = selectedSlot?.id === slot.id;

                      return (
                        <button
                          key={slot.id}
                          type="button"
                          onClick={() => onSelectSlot(isSelected ? null : slot)}
                          className={`min-h-[48px] px-3 py-2.5 rounded-lg border text-sm font-semibold transition-colors flex items-center justify-center cursor-pointer ${
                            isSelected
                              ? 'bg-[#2563EB] border-[#2563EB] text-[#F8FAFC]'
                              : 'bg-[#090D16] border-[#1E293B] text-[#F8FAFC] hover:border-[#334155]'
                          }`}
                        >
                          {startLabel}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Footer discreto con botón "Acceso Barberos" */}
      {onOpenBarberAccess && (
        <footer className="pt-6 pb-2 flex items-center justify-center">
          <button
            type="button"
            onClick={onOpenBarberAccess}
            className="px-3.5 py-2 rounded-lg bg-[#0F172A] border border-[#1E293B] hover:border-[#3B82F6] text-[#94A3B8] hover:text-[#F8FAFC] text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5 text-[#3B82F6]" />
            <span>Acceso Barberos</span>
          </button>
        </footer>
      )}

      {/* 3. BARRA INFERIOR FIJA (Sticky Bottom Bar) de 60px */}
      <div className="fixed bottom-0 left-0 right-0 z-30 h-[64px] bg-[#0F172A]/95 backdrop-blur-md border-t border-[#1E293B] px-3.5 sm:px-6 flex items-center">
        <div className="max-w-3xl w-full mx-auto flex items-center justify-between gap-3">
          {!selectedSlot ? (
            <div className="w-full text-center text-sm font-medium text-[#94A3B8]">
              Seleccioná un horario para reservar
            </div>
          ) : (
            <div className="w-full flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-[#94A3B8] shrink-0">
                <Clock className="w-3.5 h-3.5 text-[#3B82F6]" />
                <span className="text-[#F8FAFC] font-semibold">
                  {formatDateHeader(selectedDate).dayName}{' '}
                  {formatDateHeader(selectedDate).dayNumber} ·{' '}
                  {formatTime30m(selectedSlot.start_time)} hs
                </span>
              </div>

              <button
                type="button"
                disabled={isBusy}
                onClick={() => {
                  setConfirmError(null);
                  setIsConfirmSheetOpen(true);
                }}
                className="w-full h-[46px] px-4 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-[#F8FAFC] text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer pointer-events-auto"
              >
                <span>
                  {isBusy
                    ? 'Conectando con Mercado Pago...'
                    : `${formatTime30m(selectedSlot.start_time)} hs · Señar turno · $2.000`}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 4. MODAL / BOTTOM-SHEET GUEST CHECKOUT (100% Invitado: Solo Nombre, DNI y WhatsApp -> Redirección a MP) */}
      {isConfirmSheetOpen && selectedSlot && (
        <div className="fixed inset-0 z-50 h-[100dvh] flex items-end sm:items-center justify-center bg-[#090D16]/85 backdrop-blur-xs p-0 sm:p-4 pointer-events-auto">
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              if (!isBusy) setIsConfirmSheetOpen(false);
            }}
          />

          <div className="relative z-50 w-full max-w-md bg-[#0F172A] border-t sm:border border-[#1E293B] rounded-t-xl sm:rounded-xl p-5 space-y-4 max-h-[90dvh] overflow-y-auto pointer-events-auto shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-[#1E293B] pb-3">
              <div>
                <h2 className="text-sm sm:text-base font-semibold text-[#F8FAFC]">
                  Confirmar turno · {formatTime30m(selectedSlot.start_time)} hs
                </h2>
                <p className="text-xs text-[#94A3B8] mt-0.5">
                  {formatDateHeader(selectedDate).dayName}{' '}
                  {formatDateHeader(selectedDate).dayNumber}{' '}
                  {formatDateHeader(selectedDate).monthShort} ·{' '}
                  {schedule.barber.shop_name}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsConfirmSheetOpen(false)}
                disabled={isBusy}
                aria-label="Cerrar"
                className="w-9 h-9 rounded-lg bg-[#090D16] border border-[#1E293B] hover:border-[#334155] flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {confirmError && (
              <div className="p-3 rounded-lg bg-[#090D16] border border-[#334155] flex items-center gap-2 text-xs text-[#F8FAFC]">
                <ShieldAlert className="w-4 h-4 text-[#3B82F6] shrink-0" />
                <span>{confirmError}</span>
              </div>
            )}

            <form onSubmit={handleConfirmSheetSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[#94A3B8] mb-1">
                  Nombre y Apellido
                </label>
                <input
                  type="text"
                  required
                  disabled={isBusy}
                  placeholder="Tu nombre y apellido"
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  className="w-full min-h-[46px] px-3.5 rounded-lg bg-[#090D16] border border-[#1E293B] focus:border-[#2563EB] focus:outline-none text-sm text-[#F8FAFC]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#94A3B8] mb-1">
                  DNI
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  required
                  disabled={isBusy}
                  placeholder="Ej: 40123456"
                  value={confirmDni}
                  onChange={(e) =>
                    setConfirmDni(e.target.value.replace(/\D/g, ''))
                  }
                  className="w-full min-h-[46px] px-3.5 rounded-lg bg-[#090D16] border border-[#1E293B] focus:border-[#2563EB] focus:outline-none text-sm text-[#F8FAFC]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#94A3B8] mb-1">
                  WhatsApp
                </label>
                <input
                  type="tel"
                  inputMode="tel"
                  required
                  disabled={isBusy}
                  placeholder="Ej: 11 5566 7788"
                  value={confirmPhone}
                  onChange={(e) => setConfirmPhone(e.target.value)}
                  className="w-full min-h-[46px] px-3.5 rounded-lg bg-[#090D16] border border-[#1E293B] focus:border-[#2563EB] focus:outline-none text-sm text-[#F8FAFC]"
                />
              </div>

              <p className="text-[11px] text-[#94A3B8]">
                Sin registro ni cuenta. La seña de $2.000 ARS asegura tu turno y
                no es reembolsable por inasistencia.
              </p>

              <button
                type="submit"
                disabled={isBusy}
                className="w-full min-h-[48px] rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-[#F8FAFC] text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer pointer-events-auto"
              >
                {isBusy ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span>Conectando con Mercado Pago...</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4 shrink-0" />
                    <span>Continuar · Seña $2.000</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 5. MODAL SANDBOX DESACOPLADO (Solo activo en entorno local de desarrollo) */}
      {import.meta.env.DEV &&
        onSimulateWebhook &&
        onSimulateRejectedWebhook &&
        onReleaseLock && (
          <SandboxCheckoutModal
            isOpen={isSandboxCheckoutOpen}
            onClose={() => onSetSandboxCheckoutOpen?.(false)}
            activeLock={activeLock}
            shopName={schedule.barber.shop_name}
            barberSlug={slug}
            user={
              confirmDni
                ? {
                    id: 'guest',
                    dni: confirmDni,
                    name: confirmName || 'Invitado',
                    phone: confirmPhone,
                    role: 'CLIENT',
                  }
                : null
            }
            remainingSeconds={remainingSeconds}
            countdownFormatted={countdownFormatted}
            onSimulateApproved={onSimulateWebhook}
            onSimulateRejected={onSimulateRejectedWebhook}
            onReleaseLock={onReleaseLock}
          />
        )}
    </div>
  );
};
