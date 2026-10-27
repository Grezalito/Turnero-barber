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
    <div className="pb-24 space-y-6">
      {/* Client Header Summary Card */}
      <section className="p-5 rounded-sm bg-[#121214] border border-[#242428] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono-code text-[11px] uppercase tracking-widest px-2 py-0.5 rounded-sm bg-[#0A0A0B] border border-[#D49A2A] text-[#D49A2A]">
              CLIENTE · DNI {user.dni}
            </span>
            <span className="font-mono-code text-xs text-[#8A8A93]">
              {confirmedSlots.length}{' '}
              {confirmedSlots.length === 1
                ? 'turno confirmado'
                : 'turnos confirmados'}
            </span>
          </div>
          <h1 className="font-display text-2xl font-extrabold uppercase tracking-tight text-[#F2EFE9] mt-2">
            MIS TURNOS Y COMPROBANTES DE SEÑA
          </h1>
          <p className="text-xs text-[#8A8A93] mt-0.5">
            Titular: <strong className="text-[#F2EFE9]">{user.name}</strong> ·
            Seña fija por reserva:{' '}
            <span className="font-mono-code text-[#D49A2A]">$2.000 ARS</span>
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <button
            type="button"
            onClick={onRefresh}
            title="Actualizar mis turnos"
            className="min-w-[44px] min-h-[44px] rounded-sm bg-[#0A0A0B] border border-[#242428] hover:border-[#D49A2A] flex items-center justify-center text-[#8A8A93] hover:text-[#F2EFE9] transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => onGoToBookNew()}
            className="min-h-[44px] px-4 rounded-sm bg-[#D49A2A] hover:bg-[#C85A32] text-[#0A0A0B] font-display text-xs uppercase font-extrabold tracking-wider flex items-center gap-2 transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            <span>SEÑAR NUEVO TURNO · $2.000</span>
          </button>
        </div>
      </section>

      {/* Pending Payment Section if any */}
      {(pendingSlots.length > 0 || activeLock) && (
        <section className="p-5 rounded-sm bg-[#121214] border border-[#D49A2A] space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[#D49A2A]">
              <Lock className="w-4 h-4" />
              <h2 className="font-display text-sm font-extrabold uppercase tracking-wider">
                TURNO EN PROCESO DE PAGO (PENDING_PAYMENT)
              </h2>
            </div>
            <span className="font-mono-code text-xs text-[#C85A32]">
              BLOQUEO TEMPORAL 10 MIN
            </span>
          </div>

          <p className="text-xs text-[#8A8A93]">
            Tenés un bloque de 30 minutos reservado temporalmente pendiente de acreditación de seña ($2.000 ARS).
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
            className="min-h-[44px] px-4 rounded-sm bg-[#D49A2A] hover:bg-[#C85A32] text-[#0A0A0B] font-display text-xs uppercase font-extrabold tracking-wider inline-flex items-center gap-2 transition-colors"
          >
            <CreditCard className="w-4 h-4" />
            <span>COMPLETAR PAGO DE SEÑA ($2.000 ARS)</span>
          </button>
        </section>
      )}

      {/* Confirmed Appointments List */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xs font-extrabold uppercase tracking-widest text-[#8A8A93]">
            TURNOS CONFIRMADOS (SEÑA ACREDITADA)
          </h2>
          <span className="font-mono-code text-xs text-[#D49A2A]">
            {confirmedSlots.length} {confirmedSlots.length === 1 ? 'REGISTRO' : 'REGISTROS'}
          </span>
        </div>

        {confirmedSlots.length === 0 ? (
          <div className="p-8 rounded-sm bg-[#121214] border border-[#242428] text-center space-y-3">
            <div className="w-11 h-11 mx-auto rounded-sm bg-[#0A0A0B] border border-[#242428] flex items-center justify-center text-[#D49A2A]">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display text-base font-extrabold uppercase text-[#F2EFE9]">
                TODAVÍA NO TENÉS TURNOS CONFIRMADOS
              </h3>
              <p className="text-xs text-[#8A8A93] mt-1 max-w-md mx-auto">
                Elegí un bloque disponible de 30 minutos en la agenda de la barbería y aboná la seña de $2.000 ARS para confirmar tu lugar.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onGoToBookNew()}
              className="min-h-[46px] px-5 rounded-sm bg-[#D49A2A] hover:bg-[#C85A32] text-[#0A0A0B] font-display text-xs uppercase font-extrabold tracking-wider inline-flex items-center gap-2 transition-colors"
            >
              <Scissors className="w-4 h-4" />
              <span>IR A LA AGENDA Y SEÑAR TURNO · $2.000</span>
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
                  className="p-5 rounded-sm bg-[#121214] border border-[#242428] hover:border-[#D49A2A]/60 transition-colors space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#242428] pb-3.5">
                    <div className="flex items-start gap-3">
                      <div className="min-w-[68px] p-2.5 rounded-sm bg-[#0A0A0B] border border-[#D49A2A] text-center shrink-0">
                        <span className="block font-display text-[10px] font-bold uppercase text-[#D49A2A]">
                          {dayName} · {monthShort}
                        </span>
                        <span className="block font-mono-code text-xl font-bold text-[#F2EFE9] mt-0.5">
                          {dayNumber}
                        </span>
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono-code text-[10px] uppercase px-2 py-0.5 rounded-sm bg-[#0A0A0B] border border-[#D49A2A] text-[#D49A2A] flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            CONFIRMED
                          </span>
                          <span className="font-mono-code text-sm font-bold text-[#F2EFE9] flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-[#D49A2A]" />
                            {startLabel} – {endLabel} HS (30 MIN)
                          </span>
                        </div>

                        <h3 className="font-display text-lg font-extrabold uppercase text-[#F2EFE9] mt-1.5">
                          {slot.barber?.shop_name || 'OBSIDIAN & RAW BRASS STUDIO'}
                        </h3>

                        <p className="text-xs text-[#8A8A93] flex items-center gap-1.5 mt-0.5">
                          <MapPin className="w-3.5 h-3.5 text-[#D49A2A]" />
                          <span>
                            {slot.barber?.address || 'Atención con reserva previa'}
                            {slot.barber?.user?.name
                              ? ` · Barbero: ${slot.barber.user.name}`
                              : ''}
                          </span>
                        </p>
                      </div>
                    </div>

                    {/* Deposit Receipt Box */}
                    <div className="p-3 rounded-sm bg-[#0A0A0B] border border-[#242428] sm:text-right shrink-0">
                      <span className="block font-display text-[10px] uppercase tracking-wider text-[#8A8A93]">
                        COMPROBANTE DE SEÑA
                      </span>
                      <span className="block font-mono-code text-base font-bold text-[#D49A2A] mt-0.5">
                        ${slot.deposit_amount.toLocaleString('es-AR')} ARS
                      </span>
                      <span className="block font-mono-code text-[11px] text-[#F2EFE9] mt-0.5">
                        MP ID: {slot.mp_payment_id || 'ACREDITADO'}
                      </span>
                    </div>
                  </div>

                  {/* Acciones Post-Confirmación: Google Calendar, .ICS y WhatsApp */}
                  {(() => {
                    const shopName =
                      slot.barber?.shop_name || 'OBSIDIAN & RAW BRASS STUDIO';
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
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <a
                          href={gcalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="min-h-[42px] px-3 rounded-sm bg-[#D49A2A] hover:bg-[#C85A32] text-[#0A0A0B] font-display text-[11px] uppercase font-extrabold tracking-wider flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <CalendarPlus className="w-4 h-4 shrink-0" />
                          <span>AGREGAR A GOOGLE CALENDAR</span>
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
                          className="min-h-[42px] px-3 rounded-sm bg-[#0A0A0B] border border-[#D49A2A] text-[#D49A2A] hover:bg-[#D49A2A] hover:text-[#0A0A0B] font-display text-[11px] uppercase font-bold tracking-wider flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Download className="w-4 h-4 shrink-0" />
                          <span>DESCARGAR CALENDARIO (.ICS)</span>
                        </button>

                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="min-h-[42px] px-3 rounded-sm bg-[#0A0A0B] border border-[#242428] hover:border-[#D49A2A] text-[#F2EFE9] font-display text-[11px] uppercase font-bold tracking-wider flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <MessageCircle className="w-4 h-4 text-[#D49A2A] shrink-0" />
                          <span>COMPARTIR POR WHATSAPP</span>
                        </a>
                      </div>
                    );
                  })()}

                  {/* Blindaje de Seña NO REEMBOLSABLE + Opción de Cancelación sin Refund */}
                  <div className="p-3 rounded-sm bg-[#0A0A0B] border border-[#C85A32]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <ShieldAlert className="w-4 h-4 text-[#C85A32] shrink-0 mt-0.5" />
                      <p className="font-mono-code text-[11px] text-[#F2EFE9] leading-relaxed">
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
                        className="min-h-[36px] px-3 rounded-sm bg-[#121214] border border-[#C85A32] text-[#C85A32] hover:bg-[#C85A32] hover:text-[#0A0A0B] font-display text-[10px] uppercase font-bold tracking-wider flex items-center justify-center gap-1.5 shrink-0 transition-colors"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>
                          {cancellingSlotId === slot.id
                            ? 'CANCELANDO...'
                            : 'CANCELAR TURNO (SIN REEMBOLSO)'}
                        </span>
                      </button>
                    )}
                  </div>

                  {/* DeepSeek AI Reminder Queue Status if present */}
                  {reminder && (
                    <div className="p-3 rounded-sm bg-[#0A0A0B] border border-[#D49A2A]/40 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono-code text-[10px] uppercase tracking-wider text-[#D49A2A] flex items-center gap-1.5">
                          <Bot className="w-3.5 h-3.5" />
                          RECORDATORIO IA ENCOLADO (REMINDER_QUEUE · {reminder.status})
                        </span>
                        <span className="font-mono-code text-[10px] text-[#8A8A93]">
                          Prog: {formatTime30m(reminder.scheduled_for)} hs
                        </span>
                      </div>
                      {reminder.generated_message && (
                        <p className="font-mono-code text-xs text-[#F2EFE9] leading-relaxed">
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
