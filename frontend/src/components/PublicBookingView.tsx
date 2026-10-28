import React, { useEffect, useMemo, useState } from 'react';
import {
  Clock,
  CheckCircle2,
  CreditCard,
  TicketCheck,
  CalendarPlus,
  Download,
  MessageCircle,
  ShieldAlert,
  X,
  CalendarX2,
  Loader2,
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
} from '../utils/postBookingAndGamification';

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
  user: User | null;
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
  onRefresh,
  user,
  selectedSlot,
  onSelectSlot,
  onGoToClientAppointments,
  confirmedSlotInfo,
  isLocking,
}) => {
  const dateKeys = useMemo(
    () => Object.keys(schedule.dates).sort(),
    [schedule.dates],
  );
  const [selectedDate, setSelectedDate] = useState<string>(dateKeys[0] || '');

  // Modal / Bottom Sheet minimalista de confirmación (DNI, Nombre, WhatsApp)
  const [isConfirmSheetOpen, setIsConfirmSheetOpen] = useState(false);
  const [confirmDni, setConfirmDni] = useState(user?.dni || '');
  const [confirmName, setConfirmName] = useState(user?.name || '');
  const [confirmPhone, setConfirmPhone] = useState(user?.phone || '');
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [isConnectingMp, setIsConnectingMp] = useState(false);
  const [toastAlert, setToastAlert] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setConfirmDni(user.dni || '');
      setConfirmName(user.name || '');
      setConfirmPhone(user.phone || '');
    }
  }, [user]);

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

      // Redirección nativa inmediata en la misma ventana a Mercado Pago
      window.location.href = data.init_point;
    } catch (err) {
      const message =
        (err as Error).message ||
        'Este horario acaba de ser tomado o no está disponible. Por favor elegí otro turno.';
      setConfirmError(message);
      setToastAlert(message);
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
          className="fixed top-14 left-3.5 right-3.5 sm:left-auto sm:right-6 sm:max-w-md z-50 p-3.5 rounded-xl bg-[#0F172A] border border-[#2563EB] shadow-2xl flex items-start justify-between gap-3"
        >
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-[#2563EB] shrink-0 mt-0.5" />
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
          <div className="p-6 rounded-lg bg-[#0F172A] border border-[#1E293B] text-center space-y-2">
            <CalendarX2 className="w-6 h-6 text-[#2563EB] mx-auto" />
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
            <div className="p-6 rounded-lg bg-[#0F172A] border border-[#1E293B] text-center space-y-2">
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
                <div className="p-3.5 rounded-lg bg-[#0F172A] border border-[#1E293B] space-y-2.5">
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
                <div className="p-3.5 rounded-lg bg-[#0F172A] border border-[#1E293B] space-y-2.5">
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

      {/* Banner de Éxito cuando el turno fue confirmado */}
      {confirmedSlotInfo && (
        <section className="p-4 rounded-lg bg-[#0F172A] border border-[#2563EB] space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-md bg-[#2563EB]/12 border border-[#2563EB]/40 flex items-center justify-center text-[#2563EB] shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-medium text-[#2563EB]">
                  Seña confirmada · $2.000 ARS
                </span>
                <h3 className="text-sm font-semibold text-[#F8FAFC]">
                  ¡Tu turno ya está reservado!
                </h3>
              </div>
            </div>

            {onGoToClientAppointments && (
              <button
                type="button"
                onClick={onGoToClientAppointments}
                className="min-h-[40px] px-3 rounded-lg bg-[#090D16] border border-[#334155] text-[#F8FAFC] text-xs font-medium flex items-center gap-1.5"
              >
                <TicketCheck className="w-3.5 h-3.5 text-[#2563EB]" />
                <span>Mis turnos</span>
              </button>
            )}
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
            const waUrl = buildWhatsAppShareUrl({
              barberPhone:
                confirmedSlotInfo.barberPhone || schedule.barber.barber_phone,
              startTimeIso: startIso,
              mpPaymentId: confirmedSlotInfo.mpPaymentId,
            });

            return (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
                      shopName: schedule.barber.shop_name,
                      address: schedule.barber.address,
                      barberName: schedule.barber.barber_name,
                      startTimeIso: startIso,
                      endTimeIso: endIso,
                      mpPaymentId: confirmedSlotInfo.mpPaymentId,
                    })
                  }
                  className="min-h-[44px] px-3 rounded-lg bg-[#090D16] border border-[#334155] text-[#F8FAFC] text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Download className="w-4 h-4 text-[#2563EB] shrink-0" />
                  <span>Descargar .ICS</span>
                </button>

                <a
                  href={waUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="min-h-[44px] px-3 rounded-lg bg-[#090D16] border border-[#334155] text-[#F8FAFC] text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                >
                  <MessageCircle className="w-4 h-4 text-[#2563EB] shrink-0" />
                  <span>Avisar por WhatsApp</span>
                </a>
              </div>
            );
          })()}
        </section>
      )}

      {/* 3. BARRA INFERIOR FIJA (Sticky Bottom Bar) de 60px */}
      <div className="fixed bottom-0 left-0 right-0 z-30 h-[60px] bg-[#0F172A]/95 backdrop-blur-md border-t border-[#1E293B] px-3.5 sm:px-6 flex items-center">
        <div className="max-w-3xl w-full mx-auto flex items-center justify-between gap-3">
          {!selectedSlot ? (
            <div className="w-full text-center text-sm font-medium text-[#94A3B8]">
              Seleccioná un horario para reservar
            </div>
          ) : (
            <div className="w-full flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-[#94A3B8] shrink-0">
                <Clock className="w-3.5 h-3.5 text-[#2563EB]" />
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
                className="w-full h-[44px] px-4 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-[#F8FAFC] text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer pointer-events-auto"
              >
                <span>
                  {isBusy
                    ? 'Conectando con Mercado Pago...'
                    : `${formatTime30m(selectedSlot.start_time)} hs · Reservar turno · Seña $2.000`}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 4. MODAL / BOTTOM-SHEET MINIMALISTA DE CONFIRMACIÓN (Solo DNI, Nombre y WhatsApp -> Redirección Real a MP) */}
      {isConfirmSheetOpen && selectedSlot && (
        <div className="fixed inset-0 z-50 h-[100dvh] flex items-end sm:items-center justify-center bg-[#090D16]/80 backdrop-blur-xs p-0 sm:p-4 pointer-events-auto">
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              if (!isBusy) setIsConfirmSheetOpen(false);
            }}
          />

          <div className="relative z-50 w-full max-w-md bg-[#0F172A] border-t sm:border border-[#1E293B] rounded-t-xl sm:rounded-xl p-5 space-y-4 max-h-[90dvh] overflow-y-auto pointer-events-auto shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-[#F8FAFC]">
                  Confirmar turno · {formatTime30m(selectedSlot.start_time)} hs
                </h2>
                <p className="text-xs text-[#94A3B8]">
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
              <div className="p-3 rounded-lg bg-[#090D16] border border-[#2563EB] flex items-center gap-2 text-xs text-[#F8FAFC]">
                <ShieldAlert className="w-4 h-4 text-[#2563EB] shrink-0" />
                <span>{confirmError}</span>
              </div>
            )}

            <form onSubmit={handleConfirmSheetSubmit} className="space-y-3">
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
                  className="w-full min-h-[48px] px-3.5 rounded-lg bg-[#090D16] border border-[#1E293B] focus:border-[#2563EB] focus:outline-none text-sm text-[#F8FAFC]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#94A3B8] mb-1">
                  Nombre
                </label>
                <input
                  type="text"
                  required
                  disabled={isBusy}
                  placeholder="Tu nombre y apellido"
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  className="w-full min-h-[48px] px-3.5 rounded-lg bg-[#090D16] border border-[#1E293B] focus:border-[#2563EB] focus:outline-none text-sm text-[#F8FAFC]"
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
                  className="w-full min-h-[48px] px-3.5 rounded-lg bg-[#090D16] border border-[#1E293B] focus:border-[#2563EB] focus:outline-none text-sm text-[#F8FAFC]"
                />
              </div>

              <p className="text-[11px] text-[#94A3B8] truncate">
                La seña de $2.000 ARS asegura tu turno y no es reembolsable por
                inasistencia.
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
                    <span>Reservar turno · Seña $2.000</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
