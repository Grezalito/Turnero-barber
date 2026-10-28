import React, { useMemo, useState } from 'react';
import {
  UserPlus,
  Sparkles,
  CheckCircle2,
  DollarSign,
  Scissors,
  Trophy,
  ArrowRightLeft,
  CalendarRange,
} from 'lucide-react';
import { AdminBarberItem, WeeklySettlementItem } from '../types/api';

export interface SuperAdminViewProps {
  barbers: AdminBarberItem[];
  settlements: WeeklySettlementItem[];
  onCreateBarber: (payload: {
    dni: string;
    password: string;
    name: string;
    phone: string;
    slug: string;
    shop_name: string;
    address?: string;
  }) => Promise<void>;
  onToggleReminder: (barberId: string, active: boolean) => Promise<void>;
  onMarkSettlementTransferred: (
    barberId: string,
    weekStartIso: string,
    transferred: boolean,
  ) => Promise<void>;
}

export const SuperAdminView: React.FC<SuperAdminViewProps> = ({
  barbers,
  settlements,
  onCreateBarber,
  onToggleReminder,
  onMarkSettlementTransferred,
}) => {
  const [activeTab, setActiveTab] = useState<'LIQUIDACIONES' | 'BARBERIAS'>(
    'LIQUIDACIONES',
  );
  const [weekFilter, setWeekFilter] = useState<'ALL' | 'CURRENT' | 'PREVIOUS'>(
    'ALL',
  );
  const [transferringId, setTransferringId] = useState<string | null>(null);

  const [dni, setDni] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [shopName, setShopName] = useState('');
  const [slug, setSlug] = useState('');
  const [address, setAddress] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalConfirmedSlots = barbers.reduce(
    (acc, b) => acc + b.confirmed_appointments_count,
    0,
  );
  const totalDepositRevenueArs = totalConfirmedSlots * 2000;
  const activeReminderAddonsCount = barbers.filter(
    (b) => b.reminder_addon_active,
  ).length;

  const filteredSettlements = useMemo(() => {
    if (weekFilter === 'CURRENT') {
      return settlements.filter((s) => s.is_current_week);
    }
    if (weekFilter === 'PREVIOUS') {
      return settlements.filter((s) => !s.is_current_week);
    }
    return settlements;
  }, [settlements, weekFilter]);

  const totalPendingBonusesArs = useMemo(
    () =>
      filteredSettlements
        .filter((s) => s.reached_bonus && !s.transferred)
        .reduce((acc, s) => acc + s.amount_to_transfer_ars, 0),
    [filteredSettlements],
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      await onCreateBarber({
        dni: dni.replace(/\D/g, ''),
        password,
        name,
        phone,
        slug: slug.toLowerCase().trim(),
        shop_name: shopName.trim(),
        address: address.trim() || undefined,
      });
      setDni('');
      setPassword('');
      setName('');
      setPhone('');
      setShopName('');
      setSlug('');
      setAddress('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="pb-16 space-y-6">
      {/* Monetization KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-sm bg-[#0F172A] border border-[#1E293B]">
          <span className="block font-display text-[10px] uppercase tracking-widest text-[#94A3B8]">
            RECAUDACIÓN SEÑAS (100% PLATAFORMA)
          </span>
          <span className="font-mono-code text-2xl font-bold text-[#2563EB] mt-1 block">
            ${totalDepositRevenueArs.toLocaleString('es-AR')} ARS
          </span>
          <span className="font-mono-code text-[11px] text-[#94A3B8]">
            {totalConfirmedSlots} turnos confirmados × $2.000
          </span>
        </div>

        <div className="p-4 rounded-sm bg-[#0F172A] border border-[#1E293B]">
          <span className="block font-display text-[10px] uppercase tracking-widest text-[#94A3B8]">
            ADD-ON REMINDER IA (3 USD/MES)
          </span>
          <span className="font-mono-code text-2xl font-bold text-[#F8FAFC] mt-1 block">
            {activeReminderAddonsCount} ACTIVOS
          </span>
          <span className="font-mono-code text-[11px] text-[#2563EB]">
            USD ${activeReminderAddonsCount * 3}/mes recurrentes
          </span>
        </div>

        <div className="p-4 rounded-sm bg-[#0F172A] border border-[#1E293B]">
          <span className="block font-display text-[10px] uppercase tracking-widest text-[#94A3B8]">
            BONOS PENDIENTES DE TRANSFERIR
          </span>
          <span className="font-mono-code text-2xl font-bold text-[#2563EB] mt-1 block">
            ${totalPendingBonusesArs.toLocaleString('es-AR')} ARS
          </span>
          <span className="font-mono-code text-[11px] text-[#94A3B8]">
            Escala semanal Lunes a Domingo
          </span>
        </div>
      </section>

      {/* Navigation Tabs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-1.5 rounded-sm bg-[#0F172A] border border-[#1E293B]">
        <button
          type="button"
          onClick={() => setActiveTab('LIQUIDACIONES')}
          className={`min-h-[44px] px-4 rounded-sm font-display text-xs uppercase font-extrabold tracking-wider flex items-center justify-center gap-2 transition-colors ${
            activeTab === 'LIQUIDACIONES'
              ? 'bg-[#2563EB] text-[#090D16]'
              : 'bg-[#090D16] text-[#94A3B8] hover:text-[#F8FAFC]'
          }`}
        >
          <Trophy className="w-4 h-4" />
          <span>LIQUIDACIONES SEMANALES (BONOS)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('BARBERIAS')}
          className={`min-h-[44px] px-4 rounded-sm font-display text-xs uppercase font-extrabold tracking-wider flex items-center justify-center gap-2 transition-colors ${
            activeTab === 'BARBERIAS'
              ? 'bg-[#2563EB] text-[#090D16]'
              : 'bg-[#090D16] text-[#94A3B8] hover:text-[#F8FAFC]'
          }`}
        >
          <Scissors className="w-4 h-4" />
          <span>GESTIÓN DE BARBEROS Y ADD-ON 3 USD</span>
        </button>
      </div>

      {/* TAB 1: LIQUIDACIONES SEMANALES */}
      {activeTab === 'LIQUIDACIONES' && (
        <section className="p-5 rounded-sm bg-[#0F172A] border border-[#1E293B] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1E293B] pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-[#2563EB]" />
                <h2 className="font-display text-base font-extrabold uppercase tracking-wider text-[#F8FAFC]">
                  LIQUIDACIONES SEMANALES (LUNES A DOMINGO)
                </h2>
              </div>
              <p className="text-xs text-[#94A3B8] mt-1">
                Escala: 15 turnos → $10.000 ARS · 35 turnos → $25.000 ARS · 50
                turnos → $40.000 ARS + Reminder IA bonificado
              </p>
            </div>

            <div className="flex items-center gap-1.5 self-start sm:self-center">
              <button
                type="button"
                onClick={() => setWeekFilter('ALL')}
                className={`px-3 py-1.5 rounded-sm font-mono-code text-xs border transition-colors ${
                  weekFilter === 'ALL'
                    ? 'bg-[#2563EB] border-[#2563EB] text-[#090D16] font-bold'
                    : 'bg-[#090D16] border-[#1E293B] text-[#94A3B8] hover:text-[#F8FAFC]'
                }`}
              >
                Todas
              </button>
              <button
                type="button"
                onClick={() => setWeekFilter('CURRENT')}
                className={`px-3 py-1.5 rounded-sm font-mono-code text-xs border transition-colors ${
                  weekFilter === 'CURRENT'
                    ? 'bg-[#2563EB] border-[#2563EB] text-[#090D16] font-bold'
                    : 'bg-[#090D16] border-[#1E293B] text-[#94A3B8] hover:text-[#F8FAFC]'
                }`}
              >
                Semana Actual
              </button>
              <button
                type="button"
                onClick={() => setWeekFilter('PREVIOUS')}
                className={`px-3 py-1.5 rounded-sm font-mono-code text-xs border transition-colors ${
                  weekFilter === 'PREVIOUS'
                    ? 'bg-[#2563EB] border-[#2563EB] text-[#090D16] font-bold'
                    : 'bg-[#090D16] border-[#1E293B] text-[#94A3B8] hover:text-[#F8FAFC]'
                }`}
              >
                Anteriores
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1E293B] font-display text-[10px] uppercase tracking-wider text-[#94A3B8]">
                  <th className="py-3 px-3">BARBERO / BARBERÍA</th>
                  <th className="py-3 px-3">SEMANA (LUN–DOM)</th>
                  <th className="py-3 px-3 text-center">TURNOS</th>
                  <th className="py-3 px-3">¿ALCANZÓ BONO?</th>
                  <th className="py-3 px-3 text-right">MONTO A TRANSFERIR</th>
                  <th className="py-3 px-3 text-right">ACCIÓN / ESTADO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E293B] text-xs">
                {filteredSettlements.map((row) => {
                  const isBusy = transferringId === row.id;
                  return (
                    <tr
                      key={row.id}
                      className="hover:bg-[#090D16]/60 transition-colors"
                    >
                      <td className="py-3.5 px-3">
                        <div className="font-display font-bold uppercase text-[#F8FAFC]">
                          {row.shop_name}
                        </div>
                        <div className="font-mono-code text-[11px] text-[#94A3B8]">
                          {row.barber_name} · DNI {row.barber_dni}
                        </div>
                      </td>

                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-1.5 font-mono-code text-xs text-[#F8FAFC]">
                          <CalendarRange className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />
                          <span>
                            {row.week_start.slice(0, 10)} →{' '}
                            {row.week_end.slice(0, 10)}
                          </span>
                        </div>
                        <span
                          className={`inline-block mt-1 font-mono-code text-[10px] px-1.5 py-0.5 rounded-sm border ${
                            row.is_current_week
                              ? 'bg-[#090D16] border-[#2563EB] text-[#2563EB]'
                              : 'bg-[#090D16] border-[#1E293B] text-[#94A3B8]'
                          }`}
                        >
                          {row.week_label}
                        </span>
                      </td>

                      <td className="py-3.5 px-3 text-center">
                        <span className="font-mono-code text-base font-bold text-[#F8FAFC]">
                          {row.confirmed_slots_count}
                        </span>
                        <span className="block font-mono-code text-[10px] text-[#94A3B8]">
                          (${row.platform_gross_revenue_ars.toLocaleString('es-AR')}{' '}
                          señas)
                        </span>
                      </td>

                      <td className="py-3.5 px-3">
                        {row.reached_bonus ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 font-mono-code text-[10px] uppercase font-bold px-2 py-0.5 rounded-sm bg-[#2563EB]/15 border border-[#2563EB] text-[#2563EB]">
                              <CheckCircle2 className="w-3 h-3" />
                              SÍ · {row.bonus_tier}
                            </span>
                            <div className="font-mono-code text-[11px] text-[#F8FAFC]">
                              {row.bonus_tier_label}
                            </div>
                          </div>
                        ) : (
                          <span className="font-mono-code text-xs text-[#94A3B8]">
                            No ({row.confirmed_slots_count}/15 min)
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-3 text-right">
                        <span
                          className={`font-mono-code text-base font-bold ${
                            row.amount_to_transfer_ars > 0
                              ? 'text-[#2563EB]'
                              : 'text-[#94A3B8]'
                          }`}
                        >
                          ${row.amount_to_transfer_ars.toLocaleString('es-AR')}{' '}
                          ARS
                        </span>
                        {row.reminder_ia_bonified && (
                          <span className="block font-mono-code text-[10px] text-[#2563EB]">
                            + Reminder IA 3 USD Bonificado
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-3 text-right">
                        {row.transferred ? (
                          <div className="inline-flex flex-col items-end gap-1">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-sm bg-[#090D16] border border-[#2563EB] font-mono-code text-[11px] font-bold text-[#2563EB]">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              TRANSFERIDO
                            </span>
                            {row.transferred_at && (
                              <span className="font-mono-code text-[10px] text-[#94A3B8]">
                                {row.transferred_at.slice(0, 10)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={!row.reached_bonus || isBusy}
                            onClick={async () => {
                              setTransferringId(row.id);
                              try {
                                await onMarkSettlementTransferred(
                                  row.barber_id,
                                  row.week_start,
                                  true,
                                );
                              } finally {
                                setTransferringId(null);
                              }
                            }}
                            className="min-h-[38px] px-3 rounded-sm bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-[#1E293B] disabled:text-[#94A3B8] text-[#090D16] font-display text-[11px] uppercase font-extrabold tracking-wider inline-flex items-center gap-1.5 transition-colors"
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                            <span>
                              {isBusy
                                ? 'REGISTRANDO...'
                                : 'MARCAR COMO TRANSFERIDO'}
                            </span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 2: ALTA Y GESTIÓN DE BARBEROS + ADD-ON 3 USD */}
      {activeTab === 'BARBERIAS' && (
        <>
          <section className="p-5 rounded-sm bg-[#0F172A] border border-[#1E293B] space-y-4">
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-[#2563EB]" />
              <h2 className="font-display text-sm font-extrabold uppercase tracking-wider text-[#F8FAFC]">
                ALTA DE BARBERO (POST /admin/barbers)
              </h2>
            </div>

            {error && (
              <div className="p-3 rounded-sm bg-[#090D16] border border-[#1D4ED8] font-mono-code text-xs text-[#1D4ED8]">
                {error}
              </div>
            )}

            <form
              onSubmit={handleCreate}
              className="grid grid-cols-1 sm:grid-cols-3 gap-3"
            >
              <div>
                <label className="block text-[10px] font-display uppercase tracking-wider text-[#94A3B8] mb-1">
                  DNI BARBERO
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  placeholder="35111222"
                  value={dni}
                  onChange={(e) => setDni(e.target.value.replace(/\D/g, ''))}
                  className="w-full min-h-[42px] px-3 rounded-sm bg-[#090D16] border border-[#1E293B] font-mono-code text-xs text-[#F8FAFC]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-display uppercase tracking-wider text-[#94A3B8] mb-1">
                  CONTRASEÑA INICIAL
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-sm bg-[#090D16] border border-[#1E293B] font-mono-code text-xs text-[#F8FAFC]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-display uppercase tracking-wider text-[#94A3B8] mb-1">
                  NOMBRE DEL BARBERO
                </label>
                <input
                  type="text"
                  required
                  placeholder="Mateo Rossi"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-sm bg-[#090D16] border border-[#1E293B] text-xs text-[#F8FAFC]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-display uppercase tracking-wider text-[#94A3B8] mb-1">
                  WHATSAPP
                </label>
                <input
                  type="tel"
                  required
                  placeholder="+5491144556677"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-sm bg-[#090D16] border border-[#1E293B] font-mono-code text-xs text-[#F8FAFC]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-display uppercase tracking-wider text-[#94A3B8] mb-1">
                  NOMBRE DE LA BARBERÍA
                </label>
                <input
                  type="text"
                  required
                  placeholder="Navaja Negra Studio"
                  value={shopName}
                  onChange={(e) => {
                    setShopName(e.target.value);
                    if (!slug) {
                      setSlug(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, '-')
                          .replace(/(^-|-$)/g, ''),
                      );
                    }
                  }}
                  className="w-full min-h-[42px] px-3 rounded-sm bg-[#090D16] border border-[#1E293B] text-xs text-[#F8FAFC]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-display uppercase tracking-wider text-[#94A3B8] mb-1">
                  SLUG PÚBLICO (URL)
                </label>
                <input
                  type="text"
                  required
                  placeholder="navaja-negra"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-sm bg-[#090D16] border border-[#1E293B] font-mono-code text-xs text-[#2563EB]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[10px] font-display uppercase tracking-wider text-[#94A3B8] mb-1">
                  DIRECCIÓN (OPCIONAL)
                </label>
                <input
                  type="text"
                  placeholder="Av. Santa Fe 3200, Palermo"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-sm bg-[#090D16] border border-[#1E293B] text-xs text-[#F8FAFC]"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={creating}
                  className="w-full min-h-[42px] px-4 rounded-sm bg-[#2563EB] hover:bg-[#1D4ED8] text-[#090D16] font-display text-xs uppercase font-extrabold tracking-wider transition-colors"
                >
                  {creating ? 'CREANDO...' : 'CREAR BARBERO'}
                </button>
              </div>
            </form>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xs font-extrabold uppercase tracking-widest text-[#94A3B8]">
              CONTROL DE BARBERÍAS Y ADD-ON REMINDER IA (3 USD)
            </h2>

            <div className="space-y-2.5">
              {barbers.map((barber) => (
                <div
                  key={barber.id}
                  className="p-4 rounded-sm bg-[#0F172A] border border-[#1E293B] flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Scissors className="w-3.5 h-3.5 text-[#2563EB]" />
                      <h3 className="font-display text-base font-extrabold uppercase text-[#F8FAFC]">
                        {barber.shop_name}
                      </h3>
                      <span className="font-mono-code text-xs text-[#2563EB]">
                        /{barber.slug}
                      </span>
                    </div>
                    <p className="font-mono-code text-xs text-[#94A3B8]">
                      Barbero: {barber.user.name} · DNI:{' '}
                      <span className="text-[#F8FAFC]">{barber.user.dni}</span> ·
                      Tel: {barber.user.phone}
                    </p>
                    <div className="flex items-center gap-4 pt-1 font-mono-code text-xs">
                      <span className="flex items-center gap-1 text-[#F8FAFC]">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#2563EB]" />
                        {barber.confirmed_appointments_count} turnos confirmados
                      </span>
                      <span className="flex items-center gap-1 text-[#2563EB]">
                        <DollarSign className="w-3.5 h-3.5" />$
                        {barber.estimated_platform_revenue_ars.toLocaleString(
                          'es-AR',
                        )}{' '}
                        ARS en señas
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#1E293B]">
                    <div className="text-left sm:text-right">
                      <span className="block font-display text-[10px] uppercase tracking-wider text-[#94A3B8]">
                        REMINDER IA (3 USD)
                      </span>
                      <span
                        className={`font-mono-code text-xs font-bold ${
                          barber.reminder_addon_active
                            ? 'text-[#2563EB]'
                            : 'text-[#94A3B8]'
                        }`}
                      >
                        {barber.reminder_addon_active ? 'ACTIVO' : 'DESACTIVADO'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        onToggleReminder(
                          barber.id,
                          !barber.reminder_addon_active,
                        )
                      }
                      className={`min-h-[44px] px-4 rounded-sm border font-display text-xs uppercase font-extrabold tracking-wider flex items-center gap-1.5 transition-colors ${
                        barber.reminder_addon_active
                          ? 'bg-[#2563EB] border-[#2563EB] text-[#090D16]'
                          : 'bg-[#090D16] border-[#1E293B] text-[#F8FAFC] hover:border-[#2563EB]'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>
                        {barber.reminder_addon_active ? 'APAGAR' : 'ACTIVAR 3 USD'}
                      </span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export const AdminDashboardView = SuperAdminView;
