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
      className="fixed inset-0 z-50 h-[100dvh] flex items-center justify-center bg-[#0A0A0B]/85 backdrop-blur-xs p-4 pointer-events-auto"
    >
      <div className="fixed inset-0 z-40" onClick={onClose} />

      <div className="relative z-50 w-full max-w-md bg-[#121214] border border-[#242428] rounded-sm p-5 sm:p-6 shadow-2xl pointer-events-auto">
        <div className="flex items-start justify-between gap-4 mb-4 border-b border-[#242428] pb-3.5">
          <div>
            <span className="font-mono-code text-[10px] uppercase tracking-widest text-[#D49A2A] block">
              USO EXCLUSIVO STAFF
            </span>
            <h2 className="font-display text-base font-extrabold uppercase tracking-wider text-[#F2EFE9] mt-0.5">
              {user ? 'SESIÓN DE BARBERO / ADMIN' : 'ACCESO BARBEROS'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-9 h-9 rounded-sm bg-[#0A0A0B] border border-[#242428] hover:border-[#D49A2A] flex items-center justify-center text-[#8A8A93] hover:text-[#F2EFE9] cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {user ? (
          <div className="space-y-4">
            <div className="p-4 rounded-sm bg-[#0A0A0B] border border-[#242428] space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[#8A8A93]">Rol activo</span>
                <span className="font-mono-code px-2 py-0.5 rounded-sm bg-[#D49A2A]/15 border border-[#D49A2A] font-bold text-[#D49A2A]">
                  {user.role}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#8A8A93]">DNI</span>
                <span className="font-mono-code font-bold text-[#F2EFE9]">
                  {user.dni}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#8A8A93]">Nombre</span>
                <span className="font-semibold text-[#F2EFE9]">
                  {user.name}
                </span>
              </div>
              {user.barber_profile?.slug && (
                <div className="flex items-center justify-between">
                  <span className="text-[#8A8A93]">Slug Público</span>
                  <span className="font-mono-code text-[#D49A2A]">
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
                      className="min-h-[44px] px-3 rounded-sm bg-[#D49A2A] hover:bg-[#b8831f] text-[#0A0A0B] font-display text-xs uppercase font-extrabold tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer"
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
                      className="min-h-[44px] px-3 rounded-sm bg-[#0A0A0B] border border-[#242428] hover:border-[#D49A2A] text-[#F2EFE9] font-display text-xs uppercase font-bold tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <Eye className="w-4 h-4 text-[#D49A2A]" />
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
                      className="min-h-[44px] px-3 rounded-sm bg-[#D49A2A] hover:bg-[#b8831f] text-[#0A0A0B] font-display text-xs uppercase font-extrabold tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer"
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
                      className="min-h-[44px] px-3 rounded-sm bg-[#0A0A0B] border border-[#242428] hover:border-[#D49A2A] text-[#F2EFE9] font-display text-xs uppercase font-bold tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <Eye className="w-4 h-4 text-[#D49A2A]" />
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
              className="w-full min-h-[44px] rounded-sm bg-[#0A0A0B] border border-[#C85A32] hover:bg-[#C85A32]/15 text-[#F2EFE9] font-display text-xs uppercase font-bold tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4 text-[#C85A32]" />
              Cerrar Sesión
            </button>
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-4 p-3 rounded-sm bg-[#0A0A0B] border border-[#C85A32] flex items-center gap-2 font-mono-code text-xs text-[#F2EFE9]">
                <ShieldAlert className="w-4 h-4 text-[#C85A32] shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="block font-display text-[10px] uppercase tracking-wider text-[#8A8A93] mb-1">
                  DNI DE BARBERO / ADMIN
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  required
                  placeholder="Ej: 34888999"
                  value={dni}
                  onChange={(e) => setDni(e.target.value.replace(/\D/g, ''))}
                  className="w-full min-h-[46px] px-3.5 rounded-sm bg-[#0A0A0B] border border-[#242428] focus:border-[#D49A2A] focus:outline-none font-mono-code text-sm text-[#F2EFE9]"
                />
              </div>

              <div>
                <label className="block font-display text-[10px] uppercase tracking-wider text-[#8A8A93] mb-1">
                  CONTRASEÑA
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full min-h-[46px] px-3.5 rounded-sm bg-[#0A0A0B] border border-[#242428] focus:border-[#D49A2A] focus:outline-none font-mono-code text-sm text-[#F2EFE9]"
                />
              </div>

              <p className="text-[11px] text-[#8A8A93]">
                Los clientes reservan su turno directamente desde la grilla sin
                necesidad de iniciar sesión.
              </p>

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[48px] mt-1 rounded-sm bg-[#D49A2A] hover:bg-[#b8831f] text-[#0A0A0B] font-display text-xs uppercase font-extrabold tracking-wider flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <KeyRound className="w-4 h-4" />
                <span>{loading ? 'VERIFICANDO...' : 'INGRESAR AL PANEL'}</span>
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
