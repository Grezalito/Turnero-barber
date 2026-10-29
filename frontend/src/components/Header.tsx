import React from 'react';
import {
  Scissors,
  ShieldCheck,
  Calendar,
  Eye,
  KeyRound,
  LogOut,
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
  onLogout?: () => void;
  currentSlug?: string;
  shopName?: string;
  availableCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  activeView,
  onChangeView,
  onOpenAuthSheet,
  onLogout,
  shopName = 'Obsidian Barber Studio',
  availableCount = 12,
}) => {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-12 max-h-[48px] bg-[#0A0A0B]/95 backdrop-blur-md border-b border-[#242428]">
      <div className="max-w-3xl mx-auto h-full px-3 sm:px-4 flex items-center justify-between gap-2 overflow-hidden">
        {/* Left: Avatar chico de la barbería + Nombre */}
        <button
          type="button"
          onClick={() => onChangeView('PUBLIC_BOOKING')}
          className="h-9 flex items-center gap-2.5 text-left focus:outline-none min-w-0 cursor-pointer"
        >
          <div className="w-8 h-8 rounded-sm bg-[#121214] border border-[#242428] flex items-center justify-center shrink-0">
            <Scissors className="w-4 h-4 text-[#D49A2A]" />
          </div>
          <span className="font-display text-sm font-bold uppercase tracking-wide text-[#F2EFE9] truncate">
            {shopName}
          </span>
        </button>

        {/* Right: Estado de Turnos Disponibles + Acceso Barberos / Controles Staff */}
        <div className="flex items-center gap-2 shrink-0">
          {activeView === 'PUBLIC_BOOKING' && (
            <span className="hidden xs:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-[#121214] border border-[#242428] font-mono-code text-[11px] font-medium text-[#F2EFE9]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D49A2A]" />
              <span>
                {availableCount > 0 ? 'Turnos disponibles' : 'Sin cupos hoy'}
              </span>
            </span>
          )}

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
              className="h-8 px-2.5 rounded-sm border border-[#242428] hover:border-[#D49A2A] bg-[#121214] text-[#F2EFE9] font-display text-[11px] uppercase font-bold tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {activeView === 'BARBER_PANEL' ? (
                <>
                  <Eye className="w-3.5 h-3.5 text-[#D49A2A]" />
                  <span>Vista pública</span>
                </>
              ) : (
                <>
                  <Calendar className="w-3.5 h-3.5 text-[#D49A2A]" />
                  <span>Agenda barbero</span>
                </>
              )}
            </button>
          )}

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
              className="h-8 px-2.5 rounded-sm border border-[#242428] hover:border-[#D49A2A] bg-[#121214] text-[#F2EFE9] font-display text-[11px] uppercase font-bold tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {activeView === 'SUPERADMIN_PANEL' ? (
                <>
                  <Eye className="w-3.5 h-3.5 text-[#D49A2A]" />
                  <span>Vista pública</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-[#D49A2A]" />
                  <span>Panel Admin</span>
                </>
              )}
            </button>
          )}

          {user ? (
            <button
              type="button"
              onClick={onLogout}
              title="Cerrar Sesión"
              aria-label="Cerrar Sesión"
              className="h-8 px-2.5 rounded-sm bg-[#121214] border border-[#C85A32] hover:bg-[#C85A32]/15 text-[#F2EFE9] font-display text-[11px] uppercase font-bold tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 text-[#C85A32]" />
              <span className="hidden sm:inline">Cerrar Sesión</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenAuthSheet}
              aria-label="Acceso Barberos"
              className="h-8 px-2.5 rounded-sm bg-[#121214] border border-[#242428] hover:border-[#D49A2A] text-[#8A8A93] hover:text-[#F2EFE9] font-mono-code text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5 text-[#D49A2A]" />
              <span>Acceso Barberos</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
