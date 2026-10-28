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
    <div className="fixed inset-0 z-50 h-[100dvh] flex items-end sm:items-center justify-center bg-[#090D16]/85 backdrop-blur-xs p-0 sm:p-4 pointer-events-auto">
      <div className="fixed inset-0 z-40" onClick={onClose} />

      <div className="relative z-50 w-full max-w-lg bg-[#0F172A] border-t sm:border border-[#1E293B] rounded-t-xl sm:rounded-xl p-5 sm:p-6 shadow-2xl max-h-[92dvh] overflow-y-auto pointer-events-auto">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <span className="text-xs font-medium text-[#94A3B8]">
              Acceso para barberos y clientes
            </span>
            <h2 className="text-lg font-semibold text-[#F8FAFC] mt-0.5">
              {user ? 'Mi cuenta' : 'Ingresar con DNI'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-9 h-9 rounded-lg bg-[#090D16] border border-[#1E293B] hover:border-[#334155] flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {pendingSlotLabel && !user && (
          <div className="mb-4 p-3 rounded-lg bg-[#090D16] border border-[#2563EB]/50 flex items-center justify-between">
            <div>
              <p className="text-xs text-[#94A3B8]">
                Iniciá sesión con tu DNI para reservar el turno:
              </p>
              <p className="text-sm font-semibold text-[#F8FAFC] mt-0.5">
                {pendingSlotLabel} · Seña $2.000
              </p>
            </div>
          </div>
        )}

        {user ? (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-[#090D16] border border-[#1E293B] space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[#94A3B8]">Rol activo</span>
                <span className="px-2.5 py-0.5 rounded-full bg-[#2563EB]/12 border border-[#2563EB]/30 font-semibold text-[#F8FAFC]">
                  {user.role}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#94A3B8]">DNI</span>
                <span className="font-semibold text-[#F8FAFC]">{user.dni}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#94A3B8]">Nombre</span>
                <span className="font-semibold text-[#F8FAFC]">
                  {user.name}
                </span>
              </div>
              {user.phone && (
                <div className="flex items-center justify-between">
                  <span className="text-[#94A3B8]">WhatsApp</span>
                  <span className="text-[#94A3B8]">{user.phone}</span>
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
                      className="min-h-[44px] px-3 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-[#F8FAFC] text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <TicketCheck className="w-4 h-4" />
                      Mis turnos confirmados
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onNavigateView('PUBLIC_BOOKING');
                        onClose();
                      }}
                      className="min-h-[44px] px-3 rounded-lg bg-[#090D16] border border-[#1E293B] hover:border-[#334155] text-[#F8FAFC] text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <Calendar className="w-4 h-4 text-[#2563EB]" />
                      Reservar nuevo turno
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
                      className="min-h-[44px] px-3 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-[#F8FAFC] text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <Calendar className="w-4 h-4" />
                      Mi agenda de barbero
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onNavigateView('PUBLIC_BOOKING');
                        onClose();
                      }}
                      className="min-h-[44px] px-3 rounded-lg bg-[#090D16] border border-[#1E293B] hover:border-[#334155] text-[#F8FAFC] text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <Eye className="w-4 h-4 text-[#2563EB]" />
                      Vista pública
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
                      className="min-h-[44px] px-3 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-[#F8FAFC] text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      Panel SuperAdmin
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onNavigateView('PUBLIC_BOOKING');
                        onClose();
                      }}
                      className="min-h-[44px] px-3 rounded-lg bg-[#090D16] border border-[#1E293B] hover:border-[#334155] text-[#F8FAFC] text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <Eye className="w-4 h-4 text-[#2563EB]" />
                      Vista pública
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
              className="w-full min-h-[44px] rounded-lg bg-[#090D16] border border-[#334155] hover:border-[#94A3B8] text-[#94A3B8] hover:text-[#F8FAFC] text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Cerrar sesión
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-1 p-1 bg-[#090D16] border border-[#1E293B] rounded-lg mb-4">
              <button
                type="button"
                onClick={() => {
                  setMode('LOGIN');
                  setError(null);
                }}
                className={`min-h-[40px] rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  mode === 'LOGIN'
                    ? 'bg-[#2563EB] text-[#F8FAFC]'
                    : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                }`}
              >
                Iniciar sesión
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('REGISTER');
                  setError(null);
                }}
                className={`min-h-[40px] rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  mode === 'REGISTER'
                    ? 'bg-[#2563EB] text-[#F8FAFC]'
                    : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                }`}
              >
                Crear cuenta
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-[#090D16] border border-[#334155] flex items-center gap-2 text-xs text-[#F8FAFC]">
                <ShieldAlert className="w-4 h-4 text-[#2563EB] shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[#94A3B8] mb-1">
                  Número de DNI
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  required
                  placeholder="Ej: 34888999"
                  value={dni}
                  onChange={(e) => setDni(e.target.value.replace(/\D/g, ''))}
                  className="w-full min-h-[46px] px-3.5 rounded-lg bg-[#090D16] border border-[#1E293B] focus:border-[#2563EB] focus:outline-none text-sm text-[#F8FAFC]"
                />
              </div>

              {mode === 'REGISTER' && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[#94A3B8] mb-1">
                        Nombre y apellido
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Juan Pérez"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
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
                        placeholder="+54911..."
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full min-h-[46px] px-3.5 rounded-lg bg-[#090D16] border border-[#1E293B] focus:border-[#2563EB] focus:outline-none text-sm text-[#F8FAFC]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#94A3B8] mb-1">
                      Email (opcional)
                    </label>
                    <input
                      type="email"
                      placeholder="cliente@correo.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full min-h-[46px] px-3.5 rounded-lg bg-[#090D16] border border-[#1E293B] focus:border-[#2563EB] focus:outline-none text-sm text-[#F8FAFC]"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-[#94A3B8] mb-1">
                  Contraseña
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full min-h-[46px] px-3.5 rounded-lg bg-[#090D16] border border-[#1E293B] focus:border-[#2563EB] focus:outline-none text-sm text-[#F8FAFC]"
                />
              </div>

              <p className="text-[11px] text-[#94A3B8]">{NON_REFUNDABLE_LEGEND}</p>

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[48px] mt-1 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-[#F8FAFC] text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {mode === 'LOGIN' ? (
                  <>
                    <KeyRound className="w-4 h-4" />
                    {loading ? 'Verificando...' : 'Ingresar con DNI'}
                  </>
                ) : (
                  <>
                    <UserCheck className="w-4 h-4" />
                    {loading ? 'Creando cuenta...' : 'Registrarme y continuar'}
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
