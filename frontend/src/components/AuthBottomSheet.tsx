import React, { useState } from 'react';
import {
  X,
  UserCheck,
  LogOut,
  KeyRound,
  ShieldAlert,
  TicketCheck,
  Calendar,
  Eye,
  ShieldCheck,
} from 'lucide-react';
import { User } from '../types/api';
import { NON_REFUNDABLE_LEGEND } from '../utils/postBookingAndGamification';
import { ActiveView } from './Header';

interface AuthBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  pendingSlotLabel?: string | null;
  onLoginSuccess: (dni: string, password: string) => Promise<void>;
  onRegisterSuccess: (payload: {
    dni: string;
    password: string;
    name: string;
    phone: string;
    email?: string;
  }) => Promise<void>;
  onLogout: () => void;
  onNavigateView?: (view: ActiveView) => void;
}

export const AuthBottomSheet: React.FC<AuthBottomSheetProps> = ({
  isOpen,
  onClose,
  user,
  pendingSlotLabel,
  onLoginSuccess,
  onRegisterSuccess,
  onLogout,
  onNavigateView,
}) => {
  const [mode, setMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
  const [dni, setDni] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const sanitizedDni = dni.replace(/\D/g, '');
      if (sanitizedDni.length < 7 || sanitizedDni.length > 9) {
        throw new Error('Ingresá un DNI válido de 7 a 9 números sin puntos.');
      }

      if (mode === 'LOGIN') {
        await onLoginSuccess(sanitizedDni, password);
      } else {
        if (!name.trim() || !phone.trim()) {
          throw new Error('Completá tu nombre y teléfono para registrarte.');
        }
        await onRegisterSuccess({
          dni: sanitizedDni,
          password,
          name: name.trim(),
          phone: phone.trim(),
          ...(email.trim() ? { email: email.trim() } : {}),
        });
      }
      setPassword('');
      onClose();
    } catch (err) {
      setError((err as Error).message || 'Error al autenticar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-[#0A0A0B]/85 backdrop-blur-xs">
      {/* Backdrop click */}
      <div className="flex-1" onClick={onClose} />

      {/* Bottom Sheet Panel */}
      <div className="w-full max-w-lg mx-auto bg-[#121214] border-t border-x border-[#242428] rounded-t-md p-5 sm:p-6 shadow-2xl">
        {/* Top Grab Bar */}
        <div className="w-10 h-1 bg-[#242428] mx-auto mb-4 rounded-sm" />

        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <span className="font-mono-code text-[11px] uppercase tracking-widest text-[#D49A2A]">
              IDENTIFICACIÓN SIN EMAIL
            </span>
            <h2 className="font-display text-xl font-extrabold uppercase tracking-wide text-[#F2EFE9] mt-0.5">
              {user ? 'PERFIL DE USUARIO' : 'ACCESO POR DNI'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] rounded-sm bg-[#0A0A0B] border border-[#242428] flex items-center justify-center text-[#8A8A93] hover:text-[#F2EFE9] hover:border-[#D49A2A]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {pendingSlotLabel && !user && (
          <div className="mb-4 p-3 rounded-sm bg-[#0A0A0B] border border-[#D49A2A]/50 flex items-center justify-between">
            <div>
              <p className="text-xs text-[#8A8A93]">
                Iniciá sesión con tu DNI para bloquear el turno:
              </p>
              <p className="font-mono-code text-sm font-semibold text-[#D49A2A] mt-0.5">
                {pendingSlotLabel} · SEÑA $2.000
              </p>
            </div>
          </div>
        )}

        {user ? (
          <div className="space-y-4">
            <div className="p-4 rounded-sm bg-[#0A0A0B] border border-[#242428] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-[#8A8A93]">
                  ROL ACTIVO
                </span>
                <span className="font-mono-code text-xs px-2 py-0.5 rounded-sm bg-[#121214] border border-[#D49A2A] text-[#D49A2A]">
                  {user.role}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-[#8A8A93]">
                  DNI
                </span>
                <span className="font-mono-code text-sm font-bold text-[#F2EFE9]">
                  {user.dni}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-[#8A8A93]">
                  NOMBRE
                </span>
                <span className="text-sm font-semibold text-[#F2EFE9]">
                  {user.name}
                </span>
              </div>
              {user.phone && (
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wider text-[#8A8A93]">
                    WHATSAPP
                  </span>
                  <span className="font-mono-code text-xs text-[#8A8A93]">
                    {user.phone}
                  </span>
                </div>
              )}
            </div>

            {onNavigateView && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {user.role === 'CLIENT' && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        onNavigateView('CLIENT_APPOINTMENTS');
                        onClose();
                      }}
                      className="min-h-[44px] px-3 rounded-sm bg-[#D49A2A] hover:bg-[#C85A32] text-[#0A0A0B] font-display uppercase font-extrabold text-xs tracking-wider flex items-center justify-center gap-2 transition-colors"
                    >
                      <TicketCheck className="w-4 h-4" />
                      MIS TURNOS CONFIRMADOS
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onNavigateView('PUBLIC_BOOKING');
                        onClose();
                      }}
                      className="min-h-[44px] px-3 rounded-sm bg-[#0A0A0B] border border-[#242428] hover:border-[#D49A2A] text-[#F2EFE9] font-display uppercase font-bold text-xs tracking-wider flex items-center justify-center gap-2 transition-colors"
                    >
                      <Calendar className="w-4 h-4 text-[#D49A2A]" />
                      SEÑAR NUEVO TURNO
                    </button>
                  </>
                )}

                {user.role === 'BARBER' && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        onNavigateView('BARBER_PANEL');
                        onClose();
                      }}
                      className="min-h-[44px] px-3 rounded-sm bg-[#D49A2A] hover:bg-[#C85A32] text-[#0A0A0B] font-display uppercase font-extrabold text-xs tracking-wider flex items-center justify-center gap-2 transition-colors"
                    >
                      <Calendar className="w-4 h-4" />
                      MI PANEL DE BARBERO
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onNavigateView('PUBLIC_BOOKING');
                        onClose();
                      }}
                      className="min-h-[44px] px-3 rounded-sm bg-[#0A0A0B] border border-[#242428] hover:border-[#D49A2A] text-[#F2EFE9] font-display uppercase font-bold text-xs tracking-wider flex items-center justify-center gap-2 transition-colors"
                    >
                      <Eye className="w-4 h-4 text-[#D49A2A]" />
                      VISTA PÚBLICA
                    </button>
                  </>
                )}

                {user.role === 'SUPERADMIN' && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        onNavigateView('SUPERADMIN_PANEL');
                        onClose();
                      }}
                      className="min-h-[44px] px-3 rounded-sm bg-[#D49A2A] hover:bg-[#C85A32] text-[#0A0A0B] font-display uppercase font-extrabold text-xs tracking-wider flex items-center justify-center gap-2 transition-colors"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      PANEL SUPERADMIN
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onNavigateView('PUBLIC_BOOKING');
                        onClose();
                      }}
                      className="min-h-[44px] px-3 rounded-sm bg-[#0A0A0B] border border-[#242428] hover:border-[#D49A2A] text-[#F2EFE9] font-display uppercase font-bold text-xs tracking-wider flex items-center justify-center gap-2 transition-colors"
                    >
                      <Eye className="w-4 h-4 text-[#D49A2A]" />
                      VISTA PÚBLICA
                    </button>
                  </>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                onLogout();
                onClose();
              }}
              className="w-full min-h-[48px] rounded-sm bg-[#0A0A0B] border border-[#C85A32] text-[#C85A32] hover:bg-[#C85A32] hover:text-[#0A0A0B] font-display uppercase font-bold text-xs tracking-wider flex items-center justify-center gap-2 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              CERRAR SESIÓN
            </button>
          </div>
        ) : (
          <>
            {/* Mode Switcher */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-[#0A0A0B] border border-[#242428] rounded-sm mb-4">
              <button
                type="button"
                onClick={() => {
                  setMode('LOGIN');
                  setError(null);
                }}
                className={`min-h-[40px] rounded-sm font-display text-xs uppercase font-bold tracking-wider transition-colors ${
                  mode === 'LOGIN'
                    ? 'bg-[#D49A2A] text-[#0A0A0B]'
                    : 'text-[#8A8A93] hover:text-[#F2EFE9]'
                }`}
              >
                YA TENGO CUENTA
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('REGISTER');
                  setError(null);
                }}
                className={`min-h-[40px] rounded-sm font-display text-xs uppercase font-bold tracking-wider transition-colors ${
                  mode === 'REGISTER'
                    ? 'bg-[#D49A2A] text-[#0A0A0B]'
                    : 'text-[#8A8A93] hover:text-[#F2EFE9]'
                }`}
              >
                SOY NUEVO CLIENTE
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-sm bg-[#0A0A0B] border border-[#C85A32] flex items-center gap-2 text-xs text-[#C85A32]">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-display uppercase tracking-wider text-[#8A8A93] mb-1">
                  NÚMERO DE DNI (SIN PUNTOS)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  required
                  placeholder="Ej: 40123456"
                  value={dni}
                  onChange={(e) => setDni(e.target.value.replace(/\D/g, ''))}
                  className="w-full min-h-[46px] px-3.5 rounded-sm bg-[#0A0A0B] border border-[#242428] focus:border-[#D49A2A] focus:outline-none font-mono-code text-base text-[#F2EFE9] placeholder:text-[#8A8A93]/40"
                />
              </div>

              {mode === 'REGISTER' && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-display uppercase tracking-wider text-[#8A8A93] mb-1">
                        NOMBRE Y APELLIDO
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Juan Pérez"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full min-h-[46px] px-3.5 rounded-sm bg-[#0A0A0B] border border-[#242428] focus:border-[#D49A2A] focus:outline-none text-sm text-[#F2EFE9] placeholder:text-[#8A8A93]/40"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-display uppercase tracking-wider text-[#8A8A93] mb-1">
                        WHATSAPP
                      </label>
                      <input
                        type="tel"
                        inputMode="tel"
                        required
                        placeholder="+54911..."
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full min-h-[46px] px-3.5 rounded-sm bg-[#0A0A0B] border border-[#242428] focus:border-[#D49A2A] focus:outline-none font-mono-code text-sm text-[#F2EFE9] placeholder:text-[#8A8A93]/40"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-display uppercase tracking-wider text-[#8A8A93] mb-1">
                      EMAIL (OPCIONAL · PARA RECIBIR COMPROBANTE .ICS)
                    </label>
                    <input
                      type="email"
                      placeholder="cliente@correo.com (opcional)"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full min-h-[46px] px-3.5 rounded-sm bg-[#0A0A0B] border border-[#242428] focus:border-[#D49A2A] focus:outline-none font-mono-code text-sm text-[#F2EFE9] placeholder:text-[#8A8A93]/40"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-[11px] font-display uppercase tracking-wider text-[#8A8A93] mb-1">
                  CONTRASEÑA
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full min-h-[46px] px-3.5 rounded-sm bg-[#0A0A0B] border border-[#242428] focus:border-[#D49A2A] focus:outline-none font-mono-code text-base text-[#F2EFE9] placeholder:text-[#8A8A93]/40"
                />
              </div>

              {/* Leyenda Obligatoria de Blindaje de Seña NO REEMBOLSABLE */}
              <div className="p-3 rounded-sm bg-[#0A0A0B] border border-[#C85A32]/60 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-[#C85A32] shrink-0 mt-0.5" />
                <p className="font-mono-code text-[11px] text-[#F2EFE9] leading-relaxed">
                  {NON_REFUNDABLE_LEGEND}
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[48px] mt-2 rounded-sm bg-[#D49A2A] hover:bg-[#C85A32] text-[#0A0A0B] font-display uppercase font-extrabold text-sm tracking-wider flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                {mode === 'LOGIN' ? (
                  <>
                    <KeyRound className="w-4 h-4" />
                    {loading ? 'VERIFICANDO...' : 'INGRESAR CON DNI'}
                  </>
                ) : (
                  <>
                    <UserCheck className="w-4 h-4" />
                    {loading ? 'CREANDO CUENTA...' : 'REGISTRAR DNI Y CONTINUAR'}
                  </>
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
