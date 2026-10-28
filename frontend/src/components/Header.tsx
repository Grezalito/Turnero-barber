import React from 'react';
import {
  Scissors,
  ShieldCheck,
  Calendar,
  Eye,
  TicketCheck,
  SlidersHorizontal,
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
  shopName?: string;
  availableCount?: number;
  clientConfirmedCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  activeView,
  onChangeView,
  onOpenAuthSheet,
  shopName = 'Obsidian Barber Studio',
  availableCount = 12,
  clientConfirmedCount = 0,
}) => {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-12 max-h-[48px] bg-[#090D16]/95 backdrop-blur-md border-b border-[#1E293B]">
      <div className="max-w-3xl mx-auto h-full px-3 sm:px-4 flex items-center justify-between gap-2 overflow-hidden">
        {/* Left: Avatar chico de la barbería + Nombre */}
        <button
          type="button"
          onClick={() => onChangeView('PUBLIC_BOOKING')}
          className="h-9 flex items-center gap-2.5 text-left focus:outline-none min-w-0"
        >
          <div className="w-8 h-8 rounded-md bg-[#0F172A] border border-[#1E293B] flex items-center justify-center shrink-0">
            <Scissors className="w-4 h-4 text-[#2563EB]" />
          </div>
          <span className="text-sm font-semibold text-[#F8FAFC] truncate">
            {shopName}
          </span>
        </button>

        {/* Right: Estado de Turnos Disponibles + Navegación de Rol si aplica (sin botones/textos de login/registro visibles) */}
        <div className="flex items-center gap-2 shrink-0">
          {activeView === 'PUBLIC_BOOKING' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#2563EB]/12 border border-[#2563EB]/30 text-[11px] font-medium text-[#F8FAFC]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB]" />
              <span>
                {availableCount > 0 ? 'Turnos disponibles' : 'Sin cupos hoy'}
              </span>
            </span>
          )}

          {user?.role === 'CLIENT' && clientConfirmedCount > 0 && (
            <button
              type="button"
              onClick={() =>
                onChangeView(
                  activeView === 'CLIENT_APPOINTMENTS'
                    ? 'PUBLIC_BOOKING'
                    : 'CLIENT_APPOINTMENTS',
                )
              }
              className={`h-8 px-2.5 rounded-md border text-xs font-medium flex items-center gap-1.5 transition-colors ${
                activeView === 'CLIENT_APPOINTMENTS'
                  ? 'bg-[#2563EB] text-[#F8FAFC] border-[#2563EB]'
                  : 'bg-[#0F172A] text-[#F8FAFC] border-[#1E293B] hover:border-[#334155]'
              }`}
            >
              <TicketCheck className="w-3.5 h-3.5 shrink-0" />
              <span>Mis turnos ({clientConfirmedCount})</span>
            </button>
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
              className="h-8 px-2.5 rounded-md border border-[#1E293B] hover:border-[#334155] bg-[#0F172A] text-[#F8FAFC] text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              {activeView === 'BARBER_PANEL' ? (
                <>
                  <Eye className="w-3.5 h-3.5 text-[#2563EB]" />
                  <span>Vista pública</span>
                </>
              ) : (
                <>
                  <Calendar className="w-3.5 h-3.5 text-[#2563EB]" />
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
              className="h-8 px-2.5 rounded-md border border-[#1E293B] hover:border-[#334155] bg-[#0F172A] text-[#F8FAFC] text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              {activeView === 'SUPERADMIN_PANEL' ? (
                <>
                  <Eye className="w-3.5 h-3.5 text-[#2563EB]" />
                  <span>Vista pública</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-[#2563EB]" />
                  <span>Admin</span>
                </>
              )}
            </button>
          )}

          {/* Acceso discreto solo por ícono para cambio de vista barbero/admin en pruebas */}
          <button
            type="button"
            onClick={onOpenAuthSheet}
            aria-label="Opciones de barbería"
            className="w-8 h-8 rounded-md bg-[#0F172A] border border-[#1E293B] hover:border-[#334155] flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] transition-colors"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
};
