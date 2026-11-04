import React, { useState } from 'react';
import { BellRing, CheckCircle2, Smartphone } from 'lucide-react';
import { enablePushReminders, getPushSupport } from '../services/push';

const MESSAGES: Record<string, string> = {
  denied: 'Bloqueaste las notificaciones. Podés habilitarlas desde la configuración del navegador.',
  disabled: 'Los recordatorios push no están disponibles en este momento.',
  'no-token': 'Abrí este turno desde el mismo dispositivo con el que reservaste para activar los recordatorios.',
  unsupported: 'Tu navegador no soporta notificaciones push. Te vamos a recordar el turno por email.',
  error: 'No pudimos activar los recordatorios. Intentá nuevamente.',
};

/**
 * Ofrece activar recordatorios push (24 hs y 2 hs antes) justo después de confirmar el turno.
 * El permiso se pide recién al tocar el botón: es el único momento en que Safari/iOS lo permite.
 */
export const PushReminderOptIn: React.FC<{ slotId: string }> = ({ slotId }) => {
  const support = getPushSupport();
  const [state, setState] = useState<'idle' | 'loading' | 'enabled'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  if (support === 'unsupported') return null;

  if (support === 'ios-needs-install') {
    return (
      <div className="flex items-start gap-2.5 p-3 rounded-lg bg-[#090D16] border border-[#1E293B] text-xs text-[#94A3B8]">
        <Smartphone className="w-4 h-4 text-[#3B82F6] shrink-0 mt-0.5" />
        <span>
          Para recibir recordatorios en tu iPhone, tocá <strong className="text-[#F8FAFC]">Compartir → Agregar a inicio</strong> y abrí Turnazo desde ahí.
        </span>
      </div>
    );
  }

  if (state === 'enabled') {
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg bg-[#2563EB]/10 border border-[#2563EB]/40 text-xs text-[#F8FAFC]">
        <CheckCircle2 className="w-4 h-4 text-[#3B82F6] shrink-0" />
        <span>Listo: te avisamos 24 hs y 2 hs antes del turno.</span>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        disabled={state === 'loading'}
        onClick={async () => {
          setState('loading');
          setMessage(null);
          const result = await enablePushReminders(slotId);
          if (result.ok) {
            setState('enabled');
          } else {
            setState('idle');
            setMessage(MESSAGES[result.reason] || MESSAGES.error);
          }
        }}
        className="w-full min-h-[44px] px-3 rounded-lg bg-[#090D16] border border-[#2563EB]/60 hover:border-[#3B82F6] text-[#F8FAFC] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60 cursor-pointer"
      >
        <BellRing className="w-4 h-4 text-[#3B82F6] shrink-0" />
        <span>{state === 'loading' ? 'Activando…' : 'Activar recordatorios en este celular'}</span>
      </button>
      {message && <p className="text-[11px] text-[#94A3B8] px-0.5">{message}</p>}
    </div>
  );
};
