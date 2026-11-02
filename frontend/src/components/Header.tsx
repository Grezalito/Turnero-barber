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
    <header className="fixed top-0 left-0 right-0 z-40 h-14 bg-[#090D16]/95 backdrop-blur-md border-b border-[#1E293B]">
      <div className="max-w-3xl mx-auto h-full px-3 sm:px-4 flex items-center justify-between gap-2 overflow-hidden">
        {/* Left: Avatar de la barbería + Nombre */}
        <button
          type="button"
          onClick={() => onChangeView('PUBLIC_BOOKING')}
          className="min-h-[40px] flex items-center gap-2.5 text-left focus:outline-none min-w-0 cursor-pointer"
        >
          <div className="w-8 h-8 rounded-lg bg-[#0F172A] border border-[#1E293B] flex items-center justify-center shrink-0">
            <Scissors className="w-4 h-4 text-[#3B82F6]" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-[#F8FAFC] truncate">
            {shopName}
          </span>
        </button>

        {/* Right: Estado de Turnos Disponibles + Acceso Barberos / Controles Staff */}
        <div className="flex items-center gap-2 shrink-0">
          {activeView === 'PUBLIC_BOOKING' && (
            <span className="hidden xs:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#0F172A] border border-[#1E293B] text-[11px] font-medium text-[#F8FAFC]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6]" />
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
              className="min-h-[38px] px-3 rounded-lg border border-[#1E293B] hover:border-[#3B82F6] bg-[#0F172A] text-[#F8FAFC] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {activeView === 'BARBER_PANEL' ? (
                <>
                  <Eye className="w-3.5 h-3.5 text-[#3B82F6]" />
                  <span>Vista pública</span>
                </>
              ) : (
                <>
                  <Calendar className="w-3.5 h-3.5 text-[#3B82F6]" />
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
              className="min-h-[38px] px-3 rounded-lg border border-[#1E293B] hover:border-[#3B82F6] bg-[#0F172A] text-[#F8FAFC] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {activeView === 'SUPERADMIN_PANEL' ? (
                <>
                  <Eye className="w-3.5 h-3.5 text-[#3B82F6]" />
                  <span>Vista pública</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-[#3B82F6]" />
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
              className="min-h-[38px] px-3 rounded-lg bg-[#0F172A] border border-[#1E293B] hover:border-[#334155] text-[#94A3B8] hover:text-[#F8FAFC] text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 text-[#3B82F6]" />
              <span className="hidden sm:inline">Cerrar Sesión</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenAuthSheet}
              aria-label="Acceso Barberos"
              className="min-h-[38px] px-3 rounded-lg bg-[#0F172A] border border-[#1E293B] hover:border-[#3B82F6] text-[#94A3B8] hover:text-[#F8FAFC] text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5 text-[#3B82F6]" />
              <span>Acceso Barberos</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
