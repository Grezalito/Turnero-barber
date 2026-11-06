import React, { useEffect, useState } from 'react';
import {
  CalendarClock,
  CalendarPlus,
  CalendarX2,
  CheckCircle2,
  Clock3,
  Download,
  MapPin,
  MessageCircle,
  RefreshCw,
  Scissors,
  XCircle,
} from 'lucide-react';
import { api, API_BASE_URL } from '../services/api';
import { BookingSummary } from '../types/api';
import { buildGoogleCalendarUrl, NON_REFUNDABLE_LEGEND } from '../utils/postBookingAndGamification';
import { PushReminderOptIn } from './PushReminderOptIn';

const STATUS_UI: Record<string, { label: string; tone: string; icon: React.ReactNode; hint?: string }> = {
  CONFIRMED: {
    label: 'Turno confirmado',
    tone: 'text-[#3B82F6] border-[#2563EB]/50 bg-[#2563EB]/10',
    icon: <CheckCircle2 className="w-4 h-4" />,
  },
  PENDING_PAYMENT: {
    label: 'Pago pendiente',
    tone: 'text-[#FBBF24] border-[#FBBF24]/40 bg-[#FBBF24]/10',
    icon: <Clock3 className="w-4 h-4" />,
    hint: 'Estamos esperando la acreditación de la seña en Mercado Pago.',
  },
  CANCELLED: {
    label: 'Turno cancelado',
    tone: 'text-[#F87171] border-[#F87171]/40 bg-[#F87171]/10',
    icon: <XCircle className="w-4 h-4" />,
    hint: 'Este turno fue cancelado. Si querés, podés reservar uno nuevo.',
  },
  PAST: {
    label: 'Turno finalizado',
    tone: 'text-[#94A3B8] border-[#334155] bg-[#1E293B]/40',
    icon: <CalendarClock className="w-4 h-4" />,
  },
};

const btnPrimary =
  'min-h-[48px] px-4 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-[#F8FAFC] text-sm font-semibold flex items-center justify-center gap-2 transition-colors';
const btnSecondary =
  'min-h-[48px] px-4 rounded-xl bg-[#0F172A] border border-[#1E293B] hover:border-[#334155] text-[#F8FAFC] text-sm font-medium flex items-center justify-center gap-2 transition-colors';

/**
 * Página pública de la reserva: /reserva/:id?ref=...
 * Llega desde WhatsApp, email, notificaciones push y el banner de confirmación.
 */
export const BookingStatusPage: React.FC<{ slotId: string; refToken: string | null }> = ({ slotId, refToken }) => {
  const [summary, setSummary] = useState<BookingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!refToken) {
      setError('El link de la reserva está incompleto.');
      return;
    }
    api
      .getBookingSummary(slotId, refToken)
      .then(setSummary)
      .catch(() => setError('No encontramos esta reserva o el link ya no es válido.'));
  }, [slotId, refToken]);

  if (error) {
    return (
      <Shell>
        <div className="p-6 rounded-2xl bg-[#0F172A] border border-[#1E293B] text-center space-y-3">
          <CalendarX2 className="w-8 h-8 text-[#3B82F6] mx-auto" />
          <p className="text-base font-semibold text-[#F8FAFC]">{error}</p>
          <p className="text-sm text-[#94A3B8]">Revisá el último mensaje que te enviamos o contactá a la barbería.</p>
        </div>
      </Shell>
    );
  }

  if (!summary) {
    return (
      <Shell>
        <div className="p-6 rounded-2xl bg-[#0F172A] border border-[#1E293B] animate-pulse space-y-3" aria-busy="true">
          <div className="h-4 w-32 rounded bg-[#1E293B]" />
          <div className="h-7 w-56 rounded bg-[#1E293B]" />
          <div className="h-4 w-40 rounded bg-[#1E293B]" />
        </div>
      </Shell>
    );
  }

  const statusKey = summary.status === 'CONFIRMED' && summary.is_past ? 'PAST' : summary.status;
  const status = STATUS_UI[statusKey] ?? STATUS_UI.PAST;
  const isActive = summary.status === 'CONFIRMED' && !summary.is_past;
  const shopUrl = `/${encodeURIComponent(summary.barber_slug)}`;
  const mapsUrl = summary.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${summary.address}, ${summary.shop_name}`)}`
    : null;
  const gcalUrl = buildGoogleCalendarUrl({
    shopName: summary.shop_name,
    address: summary.address,
    barberName: summary.barber_name,
    startTimeIso: summary.start_time,
    endTimeIso: summary.end_time,
    mpPaymentId: summary.mp_payment_reference || 'Seña acreditada',
    depositAmountArs: summary.deposit_amount,
  });

  return (
    <Shell>
      <section className="p-5 rounded-2xl bg-[#0F172A] border border-[#1E293B] space-y-4">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${status.tone}`}>
          {status.icon}
          {status.label}
        </span>

        <div className="space-y-1">
          <p className="text-sm text-[#94A3B8]">Hola {summary.client_first_name}, este es tu turno</p>
          <h1 className="text-2xl font-bold text-[#F8FAFC] first-letter:uppercase leading-tight">{summary.date_label}</h1>
          <p className="text-lg font-semibold text-[#F8FAFC]">
            {summary.time_label} a {summary.end_time_label} hs
            <span className="text-sm font-normal text-[#94A3B8]"> · {summary.duration_minutes} min</span>
          </p>
          <p className="text-xs text-[#64748B]">Hora de Argentina</p>
        </div>

        <ul className="space-y-2.5 text-sm">
          <li className="flex items-start gap-2.5 text-[#F8FAFC]">
            <Scissors className="w-4 h-4 text-[#3B82F6] mt-0.5 shrink-0" />
            <span>
              {summary.barber_name} · <span className="text-[#94A3B8]">{summary.shop_name}</span>
            </span>
          </li>
          {summary.address && (
            <li className="flex items-start gap-2.5">
              <MapPin className="w-4 h-4 text-[#3B82F6] mt-0.5 shrink-0" />
              {mapsUrl ? (
                <a href={mapsUrl} target="_blank" rel="noreferrer" className="text-[#F8FAFC] underline decoration-[#334155] underline-offset-4">
                  {summary.address}
                </a>
              ) : (
                <span className="text-[#F8FAFC]">{summary.address}</span>
              )}
            </li>
          )}
          {summary.status === 'CONFIRMED' && (
            <li className="flex items-start gap-2.5 text-[#94A3B8]">
              <CheckCircle2 className="w-4 h-4 text-[#3B82F6] mt-0.5 shrink-0" />
              <span>
                Seña de ${summary.deposit_amount.toLocaleString('es-AR')} acreditada
                {summary.mp_payment_reference ? ` · Comprobante ${summary.mp_payment_reference}` : ''}
              </span>
            </li>
          )}
        </ul>

        {status.hint && <p className="text-sm text-[#94A3B8]">{status.hint}</p>}
      </section>

      {isActive && (
        <>
          <section className="space-y-2.5">
            <h2 className="text-xs font-semibold uppercase text-[#94A3B8] px-1">Agendalo</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <a href={gcalUrl} target="_blank" rel="noreferrer" className={btnPrimary}>
                <CalendarPlus className="w-4 h-4 shrink-0" />
                Google Calendar
              </a>
              <a href={`${API_BASE_URL}${summary.ics_path}`} className={btnSecondary} download>
                <Download className="w-4 h-4 text-[#3B82F6] shrink-0" />
                Descargar .ics (iPhone / Outlook)
              </a>
            </div>
            <PushReminderOptIn slotId={summary.id} />
          </section>

          {(summary.whatsapp_reschedule_url || summary.whatsapp_cancel_url) && (
            <section className="space-y-2.5">
              <h2 className="text-xs font-semibold uppercase text-[#94A3B8] px-1">¿Necesitás un cambio?</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {summary.whatsapp_reschedule_url && (
                  <a href={summary.whatsapp_reschedule_url} target="_blank" rel="noreferrer" className={btnSecondary}>
                    <RefreshCw className="w-4 h-4 text-[#3B82F6] shrink-0" />
                    Reprogramar por WhatsApp
                  </a>
                )}
                {summary.whatsapp_cancel_url && (
                  <a href={summary.whatsapp_cancel_url} target="_blank" rel="noreferrer" className={btnSecondary}>
                    <MessageCircle className="w-4 h-4 text-[#F87171] shrink-0" />
                    Cancelar por WhatsApp
                  </a>
                )}
              </div>
              <p className="text-xs text-[#64748B] px-1">{NON_REFUNDABLE_LEGEND}.</p>
            </section>
          )}
        </>
      )}

      <a href={shopUrl} className={`${btnSecondary} w-full`}>
        Reservar otro turno en {summary.shop_name}
      </a>
    </Shell>
  );
};

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <main className="min-h-screen bg-[#090D16] text-[#F8FAFC] px-4 py-6 sm:py-10">
    <div className="mx-auto w-full max-w-md space-y-4">
      <p className="text-sm font-bold tracking-tight text-[#F8FAFC] px-1">Turnazo</p>
      {children}
    </div>
  </main>
);

/** Ruta /reserva/:uuid (también acepta /turnos/:uuid). */
export function matchBookingRoute(pathname: string): string | null {
  const m = pathname.match(/^\/(?:reserva|turnos)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i);
  return m ? m[1] : null;
}
