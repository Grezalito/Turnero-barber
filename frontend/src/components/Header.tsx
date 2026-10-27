import React from 'react';
import {
  Scissors,
  ShieldCheck,
  Calendar,
  User as UserIcon,
  Eye,
  TicketCheck,
  PlusCircle,
} from 'lucide-react';
import { User } from '../types/api';

export type ActiveView =
  | 'PUBLIC_BOOKING'
  | 'CLIENT_APPOINTMENTS'
  | 'BARBER_PANEL'
  | 'SUPERADMIN_PANEL';

interface HeaderProps {
  user: User | null;
  activeView: ActiveView;
  onChangeView: (view: ActiveView) => void;
  onOpenAuthSheet: () => void;
  currentSlug?: string;
  clientConfirmedCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  activeView,
  onChangeView,
  onOpenAuthSheet,
  currentSlug = 'obsidian-studio',
  clientConfirmedCount = 0,
}) => {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-16 bg-[#0A0A0B]/95 backdrop-blur-xs border-b border-[#242428]">
      <div className="max-w-3xl mx-auto h-full px-4 flex items-center justify-between gap-2">
        {/* Left: Editorial Brand Logo */}
        <button
          type="button"
          onClick={() => onChangeView('PUBLIC_BOOKING')}
          className="flex items-center gap-2.5 text-left group focus:outline-none shrink-0"
        >
          <div className="w-9 h-9 rounded-sm bg-[#121214] border border-[#242428] group-hover:border-[#D49A2A] flex items-center justify-center transition-colors">
            <Scissors className="w-4 h-4 text-[#D49A2A]" />
          </div>
          <div>
            <span className="block font-display text-sm sm:text-base font-extrabold uppercase tracking-wider text-[#F2EFE9] leading-none">
              OBSIDIAN BARBER
            </span>
            <span className="block font-mono-code text-[10px] tracking-widest uppercase text-[#8A8A93] mt-0.5">
              SLOTS 30 MIN · SEÑA $2.000
            </span>
          </div>
        </button>

        {/* Right: Role Navigation + Personita Auth Button (min 44x44px) */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* CLIENT Navigation: Mis Turnos <-> Señar Turno */}
          {user?.role === 'CLIENT' && (
            <>
              <button
                type="button"
                onClick={() =>
                  onChangeView(
                    activeView === 'CLIENT_APPOINTMENTS'
                      ? 'PUBLIC_BOOKING'
                      : 'CLIENT_APPOINTMENTS',
                  )
                }
                className={`min-h-[44px] px-2.5 sm:px-3 rounded-sm border text-xs font-display uppercase font-bold tracking-wider flex items-center gap-1.5 transition-colors ${
                  activeView === 'CLIENT_APPOINTMENTS'
                    ? 'bg-[#D49A2A] text-[#0A0A0B] border-[#D49A2A]'
                    : 'bg-[#121214] text-[#F2EFE9] border-[#242428] hover:border-[#D49A2A]'
                }`}
              >
                <TicketCheck className="w-3.5 h-3.5 shrink-0" />
                <span>Mis Turnos</span>
                {clientConfirmedCount > 0 && (
                  <span
                    className={`font-mono-code text-[10px] px-1.5 py-0.2 rounded-sm ${
                      activeView === 'CLIENT_APPOINTMENTS'
                        ? 'bg-[#0A0A0B] text-[#D49A2A]'
                        : 'bg-[#D49A2A] text-[#0A0A0B]'
                    }`}
                  >
                    {clientConfirmedCount}
                  </span>
                )}
              </button>

              {activeView === 'CLIENT_APPOINTMENTS' && (
                <button
                  type="button"
                  onClick={() => onChangeView('PUBLIC_BOOKING')}
                  className="hidden sm:flex min-h-[44px] px-3 rounded-sm border border-[#242428] hover:border-[#D49A2A] bg-[#121214] text-[#F2EFE9] text-xs font-display uppercase font-bold tracking-wider items-center gap-1.5 transition-colors"
                >
                  <PlusCircle className="w-3.5 h-3.5 text-[#D49A2A]" />
                  <span>Señar Turno</span>
                </button>
              )}
            </>
          )}

          {/* BARBER Navigation: Panel de Control <-> Vista Pública (/obsidian-studio) */}
          {user?.role === 'BARBER' && (
            <button
              type="button"
              onClick={() =>
                onChangeView(
                  activeView === 'BARBER_PANEL'
                    ? 'PUBLIC_BOOKING'
                    : 'BARBER_PANEL',
                )
              }
              className={`min-h-[44px] px-2.5 sm:px-3 rounded-sm border text-xs font-display uppercase font-bold tracking-wider flex items-center gap-1.5 transition-colors ${
                activeView === 'BARBER_PANEL'
                  ? 'bg-[#121214] text-[#F2EFE9] border-[#D49A2A] hover:bg-[#D49A2A] hover:text-[#0A0A0B]'
                  : 'bg-[#D49A2A] text-[#0A0A0B] border-[#D49A2A] hover:bg-[#C85A32]'
              }`}
            >
              {activeView === 'BARBER_PANEL' ? (
                <>
                  <Eye className="w-3.5 h-3.5 text-[#D49A2A] shrink-0" />
                  <span className="hidden sm:inline">Vista Pública</span>
                  <span className="font-mono-code text-[10px] text-[#8A8A93] hidden md:inline">
                    (/{currentSlug})
                  </span>
                </>
              ) : (
                <>
                  <Calendar className="w-3.5 h-3.5 shrink-0" />
                  <span>Panel Barbero</span>
                </>
              )}
            </button>
          )}

          {/* SUPERADMIN Navigation: Panel SuperAdmin <-> Vista Pública (/obsidian-studio) */}
          {user?.role === 'SUPERADMIN' && (
            <button
              type="button"
              onClick={() =>
                onChangeView(
                  activeView === 'SUPERADMIN_PANEL'
                    ? 'PUBLIC_BOOKING'
                    : 'SUPERADMIN_PANEL',
                )
              }
              className={`min-h-[44px] px-2.5 sm:px-3 rounded-sm border text-xs font-display uppercase font-bold tracking-wider flex items-center gap-1.5 transition-colors ${
                activeView === 'SUPERADMIN_PANEL'
                  ? 'bg-[#121214] text-[#F2EFE9] border-[#D49A2A] hover:bg-[#D49A2A] hover:text-[#0A0A0B]'
                  : 'bg-[#D49A2A] text-[#0A0A0B] border-[#D49A2A] hover:bg-[#C85A32]'
              }`}
            >
              {activeView === 'SUPERADMIN_PANEL' ? (
                <>
                  <Eye className="w-3.5 h-3.5 text-[#D49A2A] shrink-0" />
                  <span className="hidden sm:inline">Vista Pública</span>
                  <span className="font-mono-code text-[10px] text-[#8A8A93] hidden md:inline">
                    (/{currentSlug})
                  </span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>Panel SuperAdmin</span>
                </>
              )}
            </button>
          )}

          {/* Personita Session Button (min 44x44px) */}
          <button
            type="button"
            onClick={onOpenAuthSheet}
            aria-label={
              user ? `Sesión activa DNI ${user.dni}` : 'Iniciar sesión con DNI'
            }
            className={`min-w-[44px] min-h-[44px] px-2.5 sm:px-3 rounded-sm border flex items-center justify-center gap-2 transition-colors ${
              user
                ? 'bg-[#121214] border-[#D49A2A] text-[#F2EFE9]'
                : 'bg-[#121214] border-[#242428] text-[#F2EFE9] hover:border-[#D49A2A]'
            }`}
          >
            <div className="relative flex items-center justify-center">
              <UserIcon className="w-4 h-4 text-[#D49A2A] shrink-0" />
              {user && (
                <span className="w-2 h-2 rounded-full bg-[#D49A2A] absolute -top-0.5 -right-0.5" />
              )}
            </div>
            {user ? (
              <div className="hidden sm:flex flex-col items-start leading-none">
                <span className="font-display text-[9px] uppercase font-bold tracking-wider text-[#D49A2A]">
                  {user.role}
                </span>
                <span className="font-mono-code text-xs text-[#F2EFE9] mt-0.5">
                  {user.dni}
                </span>
              </div>
            ) : (
              <span className="font-mono-code text-xs text-[#8A8A93] hidden sm:inline">
                DNI
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
