import React, { useState } from 'react';
import {
  Bot,
  Calendar,
  CalendarPlus,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  Lock,
  MapPin,
  MessageCircle,
  PlusCircle,
  RefreshCw,
  Scissors,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { api } from '../services/api';
import { ClientAppointmentSlot, LockSlotResponse, User } from '../types/api';
import {
  buildGoogleCalendarUrl,
  buildWhatsAppShareUrl,
  NON_REFUNDABLE_LEGEND,
} from '../utils/postBookingAndGamification';
import { formatDateHeader, formatTime30m } from './PublicBookingView';

interface ClientAppointmentsViewProps {
  user: User;
  slots: ClientAppointmentSlot[];
  loading: boolean;
  onRefresh: () => void;
  onGoToBookNew: (barberSlug?: string) => void;
  activeLock: LockSlotResponse | null;
  onOpenSandboxCheckout: () => void;
  onCancelAppointment?: (slotId: string) => Promise<void>;
}

export const ClientAppointmentsView: React.FC<ClientAppointmentsViewProps> = ({
  user,
  slots,
  loading,
  onRefresh,
  onGoToBookNew,
  activeLock,
  onOpenSandboxCheckout,
  onCancelAppointment,
}) => {
  const [cancellingSlotId, setCancellingSlotId] = useState<string | null>(null);
  const confirmedSlots = slots.filter((s) => s.status === 'CONFIRMED');
  const pendingSlots = slots.filter((s) => s.status === 'PENDING_PAYMENT');

  return (
    <div className="pb-24 space-y-5">
      <section className="p-5 rounded-xl bg-[#0F172A] border border-[#1E293B] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#2563EB]/12 border border-[#2563EB]/30 text-[#F8FAFC]">
              Cliente · DNI {user.dni}
            </span>
            <span className="text-xs text-[#94A3B8]">
              {confirmedSlots.length}{' '}
              {confirmedSlots.length === 1
                ? 'turno confirmado'
                : 'turnos confirmados'}
            </span>
          </div>
          <h1 className="text-lg sm:text-xl font-semibold text-[#F8FAFC] mt-1.5">
            Mis turnos y comprobantes
          </h1>
          <p className="text-xs text-[#94A3B8] mt-0.5">
            Titular: <strong className="text-[#F8FAFC]">{user.name}</strong> ·
            Seña fija por reserva:{' '}
            <span className="text-[#2563EB] font-semibold">$2.000 ARS</span>
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <button
            type="button"
            onClick={onRefresh}
            title="Actualizar mis turnos"
            className="w-11 h-11 rounded-lg bg-[#090D16] border border-[#1E293B] hover:border-[#334155] flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => onGoToBookNew()}
            className="min-h-[44px] px-4 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-[#F8FAFC] text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Reservar nuevo turno</span>
          </button>
        </div>
      </section>

      {(pendingSlots.length > 0 || activeLock) && (
        <section className="p-4 rounded-xl bg-[#0F172A] border border-[#2563EB] space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[#F8FAFC]">
              <Lock className="w-4 h-4 text-[#2563EB]" />
              <h2 className="text-sm font-semibold">Turno pendiente de pago</h2>
            </div>
            <span className="text-xs font-medium text-[#94A3B8]">
              Reserva temporal 10 min
            </span>
          </div>

          <p className="text-xs text-[#94A3B8]">
            Tenés un bloque de 30 minutos reservado temporalmente pendiente de
            acreditación de seña ($2.000 ARS).
          </p>

          <button
            type="button"
            onClick={() => {
              if (activeLock) {
                onOpenSandboxCheckout();
              } else {
                onGoToBookNew(pendingSlots[0]?.barber?.slug);
              }
            }}
            className="min-h-[44px] px-4 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-[#F8FAFC] text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer"
          >
            <CreditCard className="w-4 h-4" />
            <span>Completar pago de seña ($2.000 ARS)</span>
          </button>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase text-[#94A3B8]">
            Turnos confirmados
          </h2>
          <span className="text-xs font-medium text-[#94A3B8]">
            {confirmedSlots.length}{' '}
            {confirmedSlots.length === 1 ? 'registro' : 'registros'}
          </span>
        </div>

        {confirmedSlots.length === 0 ? (
          <div className="p-8 rounded-xl bg-[#0F172A] border border-[#1E293B] text-center space-y-3">
            <div className="w-11 h-11 mx-auto rounded-lg bg-[#2563EB]/12 border border-[#2563EB]/30 flex items-center justify-center text-[#2563EB]">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#F8FAFC]">
                Todavía no tenés turnos confirmados
              </h3>
              <p className="text-xs text-[#94A3B8] mt-1 max-w-md mx-auto">
                Elegí un horario disponible de 30 minutos en la agenda y aboná
                la seña de $2.000 ARS para confirmar tu lugar.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onGoToBookNew()}
              className="min-h-[44px] px-5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-[#F8FAFC] text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Scissors className="w-4 h-4" />
              <span>Ir a la agenda y reservar turno</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {confirmedSlots.map((slot) => {
              const dateStr = slot.start_time.slice(0, 10);
              const { dayName, dayNumber, monthShort } =
                formatDateHeader(dateStr);
              const startLabel = formatTime30m(slot.start_time);
              const endLabel = formatTime30m(slot.end_time);
              const reminder = slot.reminders?.[0];

              return (
                <article
                  key={slot.id}
                  className="p-5 rounded-xl bg-[#0F172A] border border-[#1E293B] space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1E293B] pb-3.5">
                    <div className="flex items-start gap-3">
                      <div className="min-w-[64px] p-2.5 rounded-lg bg-[#090D16] border border-[#1E293B] text-center shrink-0">
                        <span className="block text-[10px] font-semibold uppercase text-[#2563EB]">
                          {dayName} · {monthShort}
                        </span>
                        <span className="block text-lg font-semibold text-[#F8FAFC] mt-0.5">
                          {dayNumber}
                        </span>
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#2563EB]/12 border border-[#2563EB]/40 text-[#2563EB] flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Seña confirmada
                          </span>
                          <span className="text-sm font-semibold text-[#F8FAFC] flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-[#2563EB]" />
                            {startLabel} – {endLabel} hs
                          </span>
                        </div>

                        <h3 className="text-base font-semibold text-[#F8FAFC] mt-1">
                          {slot.barber?.shop_name ||
                            'Obsidian & Raw Brass Studio'}
                        </h3>

                        <p className="text-xs text-[#94A3B8] flex items-center gap-1.5 mt-0.5">
                          <MapPin className="w-3.5 h-3.5 text-[#2563EB]" />
                          <span>
                            {slot.barber?.address ||
                              'Atención con reserva previa'}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-[#090D16] border border-[#1E293B] sm:text-right shrink-0">
                      <span className="block text-[10px] font-medium text-[#94A3B8]">
                        Comprobante de seña
                      </span>
                      <span className="block text-sm font-semibold text-[#2563EB] mt-0.5">
                        ${slot.deposit_amount.toLocaleString('es-AR')} ARS
                      </span>
                      <span className="block text-[11px] text-[#94A3B8] mt-0.5">
                        ID: {slot.mp_payment_id || 'Acreditado'}
                      </span>
                    </div>
                  </div>

                  {(() => {
                    const shopName =
                      slot.barber?.shop_name || 'Obsidian Barber Studio';
                    const mpId = slot.mp_payment_id || 'ACREDITADO';
                    const gcalUrl = buildGoogleCalendarUrl({
                      shopName,
                      address: slot.barber?.address,
                      barberName: slot.barber?.user?.name,
                      startTimeIso: slot.start_time,
                      endTimeIso: slot.end_time,
                      mpPaymentId: mpId,
                      depositAmountArs: slot.deposit_amount,
                    });
                    const waUrl = buildWhatsAppShareUrl({
                      barberPhone: slot.barber?.user?.phone,
                      startTimeIso: slot.start_time,
                      mpPaymentId: mpId,
                    });

                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <a
                          href={gcalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="min-h-[42px] px-3 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-[#F8FAFC] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <CalendarPlus className="w-4 h-4 shrink-0" />
                          <span>Google Calendar</span>
                        </a>

                        <button
                          type="button"
                          onClick={() =>
                            api.downloadSlotIcs({
                              slotId: slot.id,
                              shopName,
                              address: slot.barber?.address,
                              barberName: slot.barber?.user?.name,
                              startTimeIso: slot.start_time,
                              endTimeIso: slot.end_time,
                              mpPaymentId: mpId,
                            })
                          }
                          className="min-h-[42px] px-3 rounded-lg bg-[#090D16] border border-[#334155] text-[#F8FAFC] text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Download className="w-4 h-4 text-[#2563EB] shrink-0" />
                          <span>Descargar .ICS</span>
                        </button>

                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="min-h-[42px] px-3 rounded-lg bg-[#090D16] border border-[#334155] text-[#F8FAFC] text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <MessageCircle className="w-4 h-4 text-[#2563EB] shrink-0" />
                          <span>Compartir por WhatsApp</span>
                        </a>
                      </div>
                    );
                  })()}

                  <div className="p-3 rounded-lg bg-[#090D16] border border-[#1E293B] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <ShieldAlert className="w-4 h-4 text-[#94A3B8] shrink-0 mt-0.5" />
                      <p className="text-[11px] text-[#94A3B8] leading-relaxed">
                        {NON_REFUNDABLE_LEGEND}
                      </p>
                    </div>

                    {onCancelAppointment && (
                      <button
                        type="button"
                        disabled={cancellingSlotId === slot.id}
                        onClick={async () => {
                          setCancellingSlotId(slot.id);
                          try {
                            await onCancelAppointment(slot.id);
                          } finally {
                            setCancellingSlotId(null);
                          }
                        }}
                        className="min-h-[36px] px-3 rounded-lg bg-[#0F172A] border border-[#334155] hover:border-[#94A3B8] text-[#94A3B8] hover:text-[#F8FAFC] text-xs font-medium flex items-center justify-center gap-1.5 shrink-0 transition-colors cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>
                          {cancellingSlotId === slot.id
                            ? 'Cancelando...'
                            : 'Cancelar turno'}
                        </span>
                      </button>
                    )}
                  </div>

                  {reminder && (
                    <div className="p-3 rounded-lg bg-[#090D16] border border-[#1E293B] space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-[#2563EB] flex items-center gap-1.5">
                          <Bot className="w-3.5 h-3.5" />
                          Recordatorio IA programado ({reminder.status})
                        </span>
                        <span className="text-[11px] text-[#94A3B8]">
                          {formatTime30m(reminder.scheduled_for)} hs
                        </span>
                      </div>
                      {reminder.generated_message && (
                        <p className="text-xs text-[#F8FAFC] leading-relaxed">
                          {reminder.generated_message}
                        </p>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
