import React, { useState } from 'react';
import {
  X,
  LogOut,
  KeyRound,
  ShieldAlert,
  Calendar,
  Eye,
  ShieldCheck,
} from 'lucide-react';
import { User } from '../types/api';
import { ActiveView } from './Header';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onLoginSuccess: (dni: string, password: string) => Promise<void>;
  onLogout: () => void;
  onNavigateView?: (view: ActiveView) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  user,
  onLoginSuccess,
  onLogout,
  onNavigateView,
}) => {
  const [dni, setDni] = useState('');
  const [password, setPassword] = useState('');
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

      await onLoginSuccess(sanitizedDni, password);
      setPassword('');
      onClose();
    } catch (err) {
      setError((err as Error).message || 'DNI o contraseña incorrectos');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 h-[100dvh] flex items-center justify-center bg-[#090D16]/85 backdrop-blur-xs p-4 pointer-events-auto"
    >
      <div className="fixed inset-0 z-40" onClick={onClose} />

      <div className="relative z-50 w-full max-w-md bg-[#0F172A] border border-[#1E293B] rounded-xl p-5 sm:p-6 shadow-2xl pointer-events-auto">
        <div className="flex items-start justify-between gap-4 mb-4 border-b border-[#1E293B] pb-3.5">
          <div>
            <span className="text-[11px] font-medium text-[#3B82F6] block">
              Uso exclusivo staff
            </span>
            <h2 className="text-base font-semibold text-[#F8FAFC] mt-0.5">
              {user ? 'Sesión de Barbero / Admin' : 'Acceso Barberos'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-9 h-9 rounded-lg bg-[#090D16] border border-[#1E293B] hover:border-[#334155] flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {user ? (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-[#090D16] border border-[#1E293B] space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[#94A3B8]">Rol activo</span>
                <span className="px-2.5 py-0.5 rounded-full bg-[#2563EB]/15 border border-[#2563EB]/40 font-semibold text-[#3B82F6]">
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
              {user.barber_profile?.slug && (
                <div className="flex items-center justify-between">
                  <span className="text-[#94A3B8]">Slug Público</span>
                  <span className="font-medium text-[#3B82F6]">
                    /{user.barber_profile.slug}
                  </span>
                </div>
              )}
            </div>

            {onNavigateView && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                      Mi Agenda
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onNavigateView('PUBLIC_BOOKING');
                        onClose();
                      }}
                      className="min-h-[44px] px-3 rounded-lg bg-[#090D16] border border-[#1E293B] hover:border-[#334155] text-[#F8FAFC] text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <Eye className="w-4 h-4 text-[#3B82F6]" />
                      Vista Pública
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
                      <Eye className="w-4 h-4 text-[#3B82F6]" />
                      Vista Pública
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
              className="w-full min-h-[44px] rounded-lg bg-[#090D16] border border-[#1E293B] hover:border-[#334155] text-[#94A3B8] hover:text-[#F8FAFC] text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4 text-[#3B82F6]" />
              Cerrar Sesión
            </button>
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-[#090D16] border border-[#334155] flex items-center gap-2 text-xs text-[#F8FAFC]">
                <ShieldAlert className="w-4 h-4 text-[#3B82F6] shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-[#94A3B8] mb-1">
                  DNI de Barbero / Admin
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

              <p className="text-[11px] text-[#94A3B8]">
                Los clientes reservan su turno directamente desde la grilla sin
                necesidad de iniciar sesión.
              </p>

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[48px] mt-1 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-[#F8FAFC] text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <KeyRound className="w-4 h-4" />
                <span>{loading ? 'Verificando...' : 'Ingresar al Panel'}</span>
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
