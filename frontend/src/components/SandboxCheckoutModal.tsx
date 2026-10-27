import React, { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Lock,
  ShieldAlert,
  Sparkles,
  X,
  XCircle,
  ExternalLink,
  Bot,
} from 'lucide-react';
import { LockSlotResponse, User } from '../types/api';
import { NON_REFUNDABLE_LEGEND } from '../utils/postBookingAndGamification';
import { formatTime30m } from './PublicBookingView';

interface SandboxCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeLock: LockSlotResponse | null;
  shopName: string;
  barberSlug: string;
  user: User | null;
  remainingSeconds: number;
  countdownFormatted: string;
  onSimulateApproved: (slotId: string) => Promise<void>;
  onSimulateRejected: (slotId: string) => Promise<{
    mpPaymentId: string;
    reason: string;
  }>;
  onReleaseLock: (slotId: string) => Promise<void>;
}

export const SandboxCheckoutModal: React.FC<SandboxCheckoutModalProps> = ({
  isOpen,
  onClose,
  activeLock,
  shopName,
  barberSlug,
  user,
  remainingSeconds,
  countdownFormatted,
  onSimulateApproved,
  onSimulateRejected,
  onReleaseLock,
}) => {
  const [processingState, setProcessingState] = useState<
    'IDLE' | 'APPROVING' | 'REJECTING' | 'RELEASING'
  >('IDLE');
  const [rejectedFeedback, setRejectedFeedback] = useState<{
    mpPaymentId: string;
    reason: string;
  } | null>(null);

  if (!isOpen || !activeLock) return null;

  const slotDate = activeLock.slot.start_time.slice(0, 10);
  const startLabel = formatTime30m(activeLock.slot.start_time);
  const endLabel = formatTime30m(activeLock.slot.end_time);
  const isRealMpUrl =
    activeLock.payment.init_point.includes('mercadopago.com') &&
    !activeLock.payment.is_sandbox_local;

  const handleApproveClick = async () => {
    setProcessingState('APPROVING');
    setRejectedFeedback(null);
    try {
      await onSimulateApproved(activeLock.slot.id);
      onClose();
    } finally {
      setProcessingState('IDLE');
    }
  };

  const handleRejectClick = async () => {
    setProcessingState('REJECTING');
    try {
      const res = await onSimulateRejected(activeLock.slot.id);
      setRejectedFeedback(res);
    } finally {
      setProcessingState('IDLE');
    }
  };

  const handleReleaseClick = async () => {
    setProcessingState('RELEASING');
    try {
      await onReleaseLock(activeLock.slot.id);
      setRejectedFeedback(null);
      onClose();
    } finally {
      setProcessingState('IDLE');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#0A0A0B]/90 backdrop-blur-xs p-0 sm:p-4">
      <div
        className="fixed inset-0"
        onClick={() => {
          if (processingState === 'IDLE') onClose();
        }}
      />

      <div className="relative z-10 w-full max-w-lg bg-[#121214] border-t sm:border border-[#242428] rounded-t-md sm:rounded-sm p-5 sm:p-6 space-y-5 max-h-[92vh] overflow-y-auto">
        {/* Top Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[#242428] pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono-code text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-sm bg-[#0A0A0B] border border-[#D49A2A] text-[#D49A2A]">
                SANDBOX LOCAL · MP_ACCESS_TOKEN DUMMY
              </span>
            </div>
            <h2 className="font-display text-lg sm:text-xl font-extrabold uppercase tracking-wide text-[#F2EFE9] mt-2">
              CHECKOUT MERCADO PAGO (SANDBOX LOCAL)
            </h2>
            <p className="text-xs text-[#8A8A93] mt-0.5">
              Simulador de pasarela de pago y disparo de Webhook idempotente
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={processingState !== 'IDLE'}
            className="min-w-[44px] min-h-[44px] rounded-sm bg-[#0A0A0B] border border-[#242428] hover:border-[#D49A2A] flex items-center justify-center text-[#8A8A93] hover:text-[#F2EFE9] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 10-Minute Countdown Lock Bar */}
        <div className="p-3.5 rounded-sm bg-[#0A0A0B] border border-[#D49A2A]/70 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Lock className="w-4 h-4 text-[#D49A2A] shrink-0" />
            <div>
              <span className="block font-display text-[10px] uppercase tracking-wider text-[#8A8A93]">
                ESTADO DEL TURNO EN DB
              </span>
              <span className="font-mono-code text-xs font-bold text-[#D49A2A]">
                PENDING_PAYMENT (BLOQUEO ATÓMICO)
              </span>
            </div>
          </div>

          <div className="px-3 py-1.5 rounded-sm bg-[#121214] border border-[#C85A32] text-right shrink-0">
            <span className="block text-[9px] font-display uppercase tracking-wider text-[#8A8A93]">
              EXPIRA EN
            </span>
            <span className="font-mono-code text-base font-bold text-[#C85A32] flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {remainingSeconds > 0 ? countdownFormatted : '00:00'}
            </span>
          </div>
        </div>

        {/* Order & Preference Summary */}
        <div className="p-4 rounded-sm bg-[#0A0A0B] border border-[#242428] space-y-3">
          <div className="flex items-center justify-between border-b border-[#242428] pb-2.5">
            <span className="text-xs uppercase font-display tracking-wider text-[#8A8A93]">
              CONCEPTO DE COBRO
            </span>
            <span className="font-mono-code text-xs text-[#F2EFE9]">
              SEÑA DE TURNO (30 MIN)
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-display tracking-wider text-[#8A8A93]">
              BARBERÍA
            </span>
            <span className="text-xs font-bold uppercase text-[#F2EFE9]">
              {shopName} <span className="font-mono-code text-[#8A8A93]">(/{barberSlug})</span>
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-display tracking-wider text-[#8A8A93]">
              FECHA Y BLOQUE (30M)
            </span>
            <span className="font-mono-code text-xs font-bold text-[#D49A2A]">
              {slotDate} · {startLabel} – {endLabel} HS
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-display tracking-wider text-[#8A8A93]">
              CLIENTE (DNI)
            </span>
            <span className="font-mono-code text-xs text-[#F2EFE9]">
              {user ? `${user.dni} (${user.name})` : 'Autenticado'}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-display tracking-wider text-[#8A8A93]">
              PREFERENCE ID
            </span>
            <span className="font-mono-code text-[11px] text-[#8A8A93]">
              {activeLock.payment.preference_id}
            </span>
          </div>

          <div className="pt-2.5 border-t border-[#242428] flex items-center justify-between">
            <div>
              <span className="block font-display text-xs uppercase font-bold text-[#F2EFE9]">
                TOTAL SEÑA OBLIGATORIA
              </span>
              <span className="block font-mono-code text-[10px] text-[#8A8A93]">
                100% Cuenta Central de la Plataforma
              </span>
            </div>
            <span className="font-mono-code text-xl font-bold text-[#D49A2A]">
              $2.000 ARS
            </span>
          </div>

          {/* Leyenda Obligatoria de Blindaje de Seña NO REEMBOLSABLE */}
          <div className="p-3 rounded-sm bg-[#121214] border border-[#C85A32]/70 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-[#C85A32] shrink-0 mt-0.5" />
            <p className="font-mono-code text-[11px] text-[#F2EFE9] leading-relaxed">
              {NON_REFUNDABLE_LEGEND}
            </p>
          </div>
        </div>

        {/* Rejected Payment Feedback Alert */}
        {rejectedFeedback && (
          <div className="p-4 rounded-sm bg-[#0A0A0B] border border-[#C85A32] space-y-2">
            <div className="flex items-center gap-2 text-[#C85A32]">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span className="font-display text-xs font-extrabold uppercase tracking-wider">
                PAGO RECHAZADO SIMULADO (STATUS: REJECTED)
              </span>
            </div>
            <p className="font-mono-code text-[11px] text-[#8A8A93]">
              mp_payment_id: <span className="text-[#F2EFE9]">{rejectedFeedback.mpPaymentId}</span> ·{' '}
              {rejectedFeedback.reason}
            </p>
            <p className="text-xs text-[#F2EFE9]">
              El turno permanece bloqueado en <span className="font-mono-code text-[#D49A2A]">PENDING_PAYMENT</span> hasta que expire el reloj de 10 minutos, o podés reintentar el pago aprobado / liberar el turno ahora.
            </p>
          </div>
        )}

        {/* Webhook & DeepSeek Reminder Explanation */}
        <div className="p-3 rounded-sm bg-[#0A0A0B] border border-[#242428] flex items-start gap-2.5">
          <Bot className="w-4 h-4 text-[#D49A2A] shrink-0 mt-0.5" />
          <p className="font-mono-code text-[11px] text-[#8A8A93] leading-relaxed">
            Al tocar <strong className="text-[#F2EFE9]">&ldquo;Simular Pago Aprobado&rdquo;</strong> se dispara{' '}
            <span className="text-[#D49A2A]">POST /payments/webhook</span> con un{' '}
            <span className="text-[#F2EFE9]">mp_payment_id</span> único, pasa el turno a{' '}
            <span className="text-[#D49A2A]">CONFIRMED</span> y encola el recordatorio en{' '}
            <span className="text-[#F2EFE9]">ReminderQueue</span> si el barbero tiene activo el add-on de 3 USD.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5 pt-1">
          <button
            type="button"
            disabled={processingState !== 'IDLE' || remainingSeconds === 0}
            onClick={handleApproveClick}
            className="w-full min-h-[50px] px-4 rounded-sm bg-[#D49A2A] hover:bg-[#C85A32] disabled:bg-[#242428] disabled:text-[#8A8A93] text-[#0A0A0B] font-display text-xs sm:text-sm uppercase font-extrabold tracking-wider flex items-center justify-center gap-2 transition-colors"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>
              {processingState === 'APPROVING'
                ? 'EJECUTANDO WEBHOOK POST /payments/webhook...'
                : 'SIMULAR PAGO APROBADO ($2.000 ARS)'}
            </span>
          </button>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={processingState !== 'IDLE' || remainingSeconds === 0}
              onClick={handleRejectClick}
              className="min-h-[46px] px-3 rounded-sm bg-[#0A0A0B] border border-[#C85A32] text-[#C85A32] hover:bg-[#C85A32] hover:text-[#0A0A0B] disabled:opacity-50 font-display text-xs uppercase font-bold tracking-wider flex items-center justify-center gap-1.5 transition-colors"
            >
              <XCircle className="w-4 h-4 shrink-0" />
              <span>
                {processingState === 'REJECTING'
                  ? 'SIMULANDO...'
                  : 'SIMULAR PAGO RECHAZADO'}
              </span>
            </button>

            <button
              type="button"
              disabled={processingState !== 'IDLE'}
              onClick={handleReleaseClick}
              className="min-h-[46px] px-3 rounded-sm bg-[#0A0A0B] border border-[#242428] hover:border-[#8A8A93] text-[#8A8A93] hover:text-[#F2EFE9] disabled:opacity-50 font-mono-code text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <span>
                {processingState === 'RELEASING'
                  ? 'LIBERANDO...'
                  : 'CANCELAR Y LIBERAR TURNO'}
              </span>
            </button>
          </div>

          {isRealMpUrl && (
            <a
              href={activeLock.payment.init_point}
              target="_blank"
              rel="noreferrer"
              className="w-full min-h-[44px] px-4 rounded-sm bg-[#0A0A0B] border border-[#D49A2A]/60 text-[#D49A2A] font-mono-code text-xs flex items-center justify-center gap-2 hover:bg-[#D49A2A]/10 transition-colors"
            >
              <span>IR A PASARELA EXTERNA DE MERCADO PAGO</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
};
