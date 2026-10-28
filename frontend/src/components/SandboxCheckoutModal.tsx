import React, { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Lock,
  ShieldAlert,
  X,
  XCircle,
  CreditCard,
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
  const paymentUrl =
    activeLock.payment.init_point || activeLock.payment.sandbox_init_point;
  const isExternalMpUrl =
    Boolean(paymentUrl) &&
    paymentUrl.includes('mercadopago.com') &&
    !activeLock.payment.is_sandbox_local;

  const handlePrimaryPaymentClick = async () => {
    // Si existe un init_point real de Mercado Pago, redirigir en la misma pestaña (evita bloqueo de popups en PC)
    if (isExternalMpUrl) {
      window.location.href = paymentUrl;
      return;
    }

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
    <div className="fixed inset-0 z-50 h-[100dvh] flex items-end sm:items-center justify-center bg-[#090D16]/85 backdrop-blur-xs p-0 sm:p-4 pointer-events-auto">
      <div
        className="fixed inset-0 z-40"
        onClick={() => {
          if (processingState === 'IDLE') onClose();
        }}
      />

      <div className="relative z-50 w-full max-w-lg bg-[#0F172A] border-t sm:border border-[#1E293B] rounded-t-xl sm:rounded-xl p-5 sm:p-6 space-y-4 max-h-[92dvh] overflow-y-auto pointer-events-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[#1E293B] pb-3.5">
          <div>
            <span className="inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#2563EB]/12 border border-[#2563EB]/30 text-[#F8FAFC]">
              Checkout Mercado Pago
            </span>
            <h2 className="text-lg font-semibold text-[#F8FAFC] mt-1.5">
              Abonar seña de reserva
            </h2>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              Acreditación inmediata para confirmar tu horario
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={processingState !== 'IDLE'}
            className="w-10 h-10 rounded-lg bg-[#090D16] border border-[#1E293B] hover:border-[#334155] flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Estado de bloqueo temporal */}
        <div className="p-3.5 rounded-lg bg-[#090D16] border border-[#1E293B] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Lock className="w-4 h-4 text-[#2563EB] shrink-0" />
            <div>
              <span className="block text-[11px] font-medium text-[#94A3B8]">
                Estado del turno
              </span>
              <span className="text-xs font-semibold text-[#F8FAFC]">
                Reserva temporal activa
              </span>
            </div>
          </div>

          <div className="px-3 py-1.5 rounded-lg bg-[#0F172A] border border-[#334155] text-right shrink-0">
            <span className="block text-[10px] font-medium text-[#94A3B8]">
              Expira en
            </span>
            <span className="text-sm font-semibold text-[#F8FAFC] flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-[#2563EB]" />
              {remainingSeconds > 0 ? countdownFormatted : '00:00'}
            </span>
          </div>
        </div>

        {/* Resumen del turno */}
        <div className="p-4 rounded-lg bg-[#090D16] border border-[#1E293B] space-y-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[#94A3B8]">Barbería</span>
            <span className="font-semibold text-[#F8FAFC]">{shopName}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[#94A3B8]">Fecha y horario (30 min)</span>
            <span className="font-semibold text-[#F8FAFC]">
              {slotDate} · {startLabel} a {endLabel} hs
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[#94A3B8]">Cliente</span>
            <span className="font-medium text-[#F8FAFC]">
              {user ? `${user.name} (DNI ${user.dni})` : 'Invitado'}
            </span>
          </div>

          <div className="pt-2.5 border-t border-[#1E293B] flex items-center justify-between">
            <span className="text-sm font-semibold text-[#F8FAFC]">
              Total seña a pagar
            </span>
            <span className="text-lg font-semibold text-[#2563EB]">
              $2.000 ARS
            </span>
          </div>
        </div>

        <p className="text-[11px] text-[#94A3B8]">{NON_REFUNDABLE_LEGEND}</p>

        {rejectedFeedback && (
          <div className="p-3.5 rounded-lg bg-[#090D16] border border-[#334155] space-y-1">
            <div className="flex items-center gap-2 text-[#F8FAFC]">
              <ShieldAlert className="w-4 h-4 text-[#2563EB] shrink-0" />
              <span className="text-xs font-semibold">
                Pago rechazado ({rejectedFeedback.mpPaymentId})
              </span>
            </div>
            <p className="text-xs text-[#94A3B8]">{rejectedFeedback.reason}</p>
          </div>
        )}

        {/* Botones de Acción (100% clickeables en PC y Mobile) */}
        <div className="space-y-2.5 pt-1">
          <button
            type="button"
            disabled={processingState !== 'IDLE' || remainingSeconds === 0}
            onClick={handlePrimaryPaymentClick}
            className="w-full min-h-[48px] px-4 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-[#F8FAFC] text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer pointer-events-auto"
          >
            {isExternalMpUrl ? (
              <>
                <CreditCard className="w-4 h-4 shrink-0" />
                <span>Pagar en Mercado Pago · $2.000 ARS</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  {processingState === 'APPROVING'
                    ? 'Acreditando pago...'
                    : 'Pagar y confirmar turno · $2.000 ARS'}
                </span>
              </>
            )}
          </button>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              disabled={processingState !== 'IDLE' || remainingSeconds === 0}
              onClick={handleRejectClick}
              className="min-h-[44px] px-3 rounded-lg bg-[#090D16] border border-[#334155] hover:border-[#94A3B8] text-[#94A3B8] hover:text-[#F8FAFC] disabled:opacity-50 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer pointer-events-auto"
            >
              <XCircle className="w-4 h-4 shrink-0" />
              <span>
                {processingState === 'REJECTING'
                  ? 'Probando...'
                  : 'Simular pago rechazado'}
              </span>
            </button>

            <button
              type="button"
              disabled={processingState !== 'IDLE'}
              onClick={handleReleaseClick}
              className="min-h-[44px] px-3 rounded-lg bg-[#090D16] border border-[#1E293B] hover:border-[#334155] text-[#94A3B8] hover:text-[#F8FAFC] disabled:opacity-50 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer pointer-events-auto"
            >
              <span>
                {processingState === 'RELEASING'
                  ? 'Liberando...'
                  : 'Cancelar y liberar horario'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
