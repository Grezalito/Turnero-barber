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
  Copy,
  Check,
  LogOut,
  ExternalLink,
} from 'lucide-react';
import { AdminBarberItem, WeeklySettlementItem } from '../types/api';

export function generateSlugFromShopName(rawText: string): string {
  return rawText
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface SuperAdminViewProps {
  barbers: AdminBarberItem[];
  settlements: WeeklySettlementItem[];
  onCreateBarber: (payload: {
    dni: string;
    password: string;
    name: string;
    phone: string;
    shopName: string;
    shop_name: string;
    slug?: string;
    address?: string;
  }) => Promise<AdminBarberItem | void>;
  onToggleReminder: (barberId: string, active: boolean) => Promise<void>;
  onMarkSettlementTransferred: (
    barberId: string,
    weekStartIso: string,
    transferred: boolean,
  ) => Promise<void>;
  onLogout?: () => void;
  onOpenBarberPublicSlug?: (slug: string) => void;
}

export const SuperAdminView: React.FC<SuperAdminViewProps> = ({
  barbers,
  settlements,
  onCreateBarber,
  onToggleReminder,
  onMarkSettlementTransferred,
  onLogout,
  onOpenBarberPublicSlug,
}) => {
  const [activeTab, setActiveTab] = useState<'LIQUIDACIONES' | 'BARBERIAS'>(
    'BARBERIAS',
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
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [address, setAddress] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [createdBarberSlug, setCreatedBarberSlug] = useState<string | null>(
    null,
  );
  const [copiedSlug, setCopiedSlug] = useState(false);

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
    setSuccessMsg(null);
    setCreatedBarberSlug(null);
    const cleanDni = dni.replace(/\D/g, '');
    const cleanShopName = shopName.trim();
    if (!cleanShopName) {
      setError('El nombre de la barbería es obligatorio.');
      return;
    }

    const dynamicSlug = slug.trim()
      ? generateSlugFromShopName(slug)
      : generateSlugFromShopName(cleanShopName);

    setCreating(true);
    try {
      const created = await onCreateBarber({
        dni: cleanDni,
        password,
        name: name.trim(),
        phone: phone.trim(),
        shopName: cleanShopName,
        shop_name: cleanShopName,
        slug: dynamicSlug || undefined,
        address: address.trim() || undefined,
      });
      const finalSlug = created?.slug || dynamicSlug;
      setCreatedBarberSlug(finalSlug);
      setSuccessMsg(
        `Barbería "${created?.shop_name || cleanShopName}" creada exitosamente con link público /${finalSlug}`,
      );
      setDni('');
      setPassword('');
      setName('');
      setPhone('');
      setShopName('');
      setSlug('');
      setSlugManuallyEdited(false);
      setAddress('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="pb-16 space-y-5">
      <div className="flex items-center justify-between gap-3 p-4 rounded-xl bg-[#0F172A] border border-[#1E293B]">
        <div>
          <span className="text-[11px] font-medium text-[#3B82F6] block">
            Control central de la plataforma
          </span>
          <h1 className="text-base sm:text-lg font-semibold text-[#F8FAFC]">
            Panel SuperAdmin
          </h1>
        </div>
        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            className="min-h-[40px] px-3.5 rounded-lg bg-[#090D16] border border-[#1E293B] hover:border-[#334155] text-[#94A3B8] hover:text-[#F8FAFC] text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4 text-[#3B82F6]" />
            <span>Cerrar Sesión</span>
          </button>
        )}
      </div>

      {/* Monetization KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-xl bg-[#0F172A] border border-[#1E293B]">
          <span className="block text-[11px] font-medium text-[#94A3B8]">
            Recaudación Señas (100% Plataforma)
          </span>
          <span className="text-2xl font-bold text-[#3B82F6] mt-1 block">
            ${totalDepositRevenueArs.toLocaleString('es-AR')} ARS
          </span>
          <span className="text-[11px] text-[#94A3B8]">
            {totalConfirmedSlots} turnos confirmados × $2.000
          </span>
        </div>

        <div className="p-4 rounded-xl bg-[#0F172A] border border-[#1E293B]">
          <span className="block text-[11px] font-medium text-[#94A3B8]">
            Add-on Reminder IA (3 USD/mes)
          </span>
          <span className="text-2xl font-bold text-[#F8FAFC] mt-1 block">
            {activeReminderAddonsCount} activos
          </span>
          <span className="text-[11px] text-[#3B82F6]">
            USD ${activeReminderAddonsCount * 3}/mes recurrentes
          </span>
        </div>

        <div className="p-4 rounded-xl bg-[#0F172A] border border-[#1E293B]">
          <span className="block text-[11px] font-medium text-[#94A3B8]">
            Bonos pendientes de transferir
          </span>
          <span className="text-2xl font-bold text-[#3B82F6] mt-1 block">
            ${totalPendingBonusesArs.toLocaleString('es-AR')} ARS
          </span>
          <span className="text-[11px] text-[#94A3B8]">
            Escala semanal Lunes a Domingo
          </span>
        </div>
      </section>

      {/* Navigation Tabs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-1.5 rounded-xl bg-[#0F172A] border border-[#1E293B]">
        <button
          type="button"
          onClick={() => setActiveTab('LIQUIDACIONES')}
          className={`min-h-[44px] px-4 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
            activeTab === 'LIQUIDACIONES'
              ? 'bg-[#2563EB] text-[#F8FAFC]'
              : 'bg-[#090D16] text-[#94A3B8] hover:text-[#F8FAFC]'
          }`}
        >
          <Trophy className="w-4 h-4" />
          <span>Liquidaciones Semanales (Bonos)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('BARBERIAS')}
          className={`min-h-[44px] px-4 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
            activeTab === 'BARBERIAS'
              ? 'bg-[#2563EB] text-[#F8FAFC]'
              : 'bg-[#090D16] text-[#94A3B8] hover:text-[#F8FAFC]'
          }`}
        >
          <Scissors className="w-4 h-4" />
          <span>Gestión de Barberos y Add-on 3 USD</span>
        </button>
      </div>

      {/* TAB 1: LIQUIDACIONES SEMANALES */}
      {activeTab === 'LIQUIDACIONES' && (
        <section className="p-5 rounded-xl bg-[#0F172A] border border-[#1E293B] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1E293B] pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-[#3B82F6]" />
                <h2 className="text-base font-semibold text-[#F8FAFC]">
                  Liquidaciones Semanales (Lunes a Domingo)
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
                className={`px-3 py-1.5 rounded-lg text-xs border transition-colors cursor-pointer ${
                  weekFilter === 'ALL'
                    ? 'bg-[#2563EB] border-[#2563EB] text-[#F8FAFC] font-semibold'
                    : 'bg-[#090D16] border-[#1E293B] text-[#94A3B8] hover:text-[#F8FAFC]'
                }`}
              >
                Todas
              </button>
              <button
                type="button"
                onClick={() => setWeekFilter('CURRENT')}
                className={`px-3 py-1.5 rounded-lg text-xs border transition-colors cursor-pointer ${
                  weekFilter === 'CURRENT'
                    ? 'bg-[#2563EB] border-[#2563EB] text-[#F8FAFC] font-semibold'
                    : 'bg-[#090D16] border-[#1E293B] text-[#94A3B8] hover:text-[#F8FAFC]'
                }`}
              >
                Semana Actual
              </button>
              <button
                type="button"
                onClick={() => setWeekFilter('PREVIOUS')}
                className={`px-3 py-1.5 rounded-lg text-xs border transition-colors cursor-pointer ${
                  weekFilter === 'PREVIOUS'
                    ? 'bg-[#2563EB] border-[#2563EB] text-[#F8FAFC] font-semibold'
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
                <tr className="border-b border-[#1E293B] text-[11px] font-medium text-[#94A3B8]">
                  <th className="py-3 px-3">Barbero / Barbería</th>
                  <th className="py-3 px-3">Semana (Lun–Dom)</th>
                  <th className="py-3 px-3 text-center">Turnos</th>
                  <th className="py-3 px-3">¿Alcanzó Bono?</th>
                  <th className="py-3 px-3 text-right">Monto a Transferir</th>
                  <th className="py-3 px-3 text-right">Acción / Estado</th>
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
                        <div className="font-semibold text-[#F8FAFC]">
                          {row.shop_name}
                        </div>
                        <div className="text-[11px] text-[#94A3B8]">
                          {row.barber_name} · DNI {row.barber_dni}
                        </div>
                      </td>

                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-1.5 text-xs text-[#F8FAFC]">
                          <CalendarRange className="w-3.5 h-3.5 text-[#3B82F6] shrink-0" />
                          <span>
                            {row.week_start.slice(0, 10)} →{' '}
                            {row.week_end.slice(0, 10)}
                          </span>
                        </div>
                        <span
                          className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full border ${
                            row.is_current_week
                              ? 'bg-[#2563EB]/15 border-[#2563EB]/40 text-[#3B82F6]'
                              : 'bg-[#090D16] border-[#1E293B] text-[#94A3B8]'
                          }`}
                        >
                          {row.week_label}
                        </span>
                      </td>

                      <td className="py-3.5 px-3 text-center">
                        <span className="text-base font-bold text-[#F8FAFC]">
                          {row.confirmed_slots_count}
                        </span>
                        <span className="block text-[10px] text-[#94A3B8]">
                          (${row.platform_gross_revenue_ars.toLocaleString('es-AR')}{' '}
                          señas)
                        </span>
                      </td>

                      <td className="py-3.5 px-3">
                        {row.reached_bonus ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#2563EB]/15 border border-[#2563EB]/40 text-[#3B82F6]">
                              <CheckCircle2 className="w-3 h-3" />
                              Sí · {row.bonus_tier}
                            </span>
                            <div className="text-[11px] text-[#F8FAFC]">
                              {row.bonus_tier_label}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-[#94A3B8]">
                            No ({row.confirmed_slots_count}/15 min)
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-3 text-right">
                        <span
                          className={`text-base font-bold ${
                            row.amount_to_transfer_ars > 0
                              ? 'text-[#3B82F6]'
                              : 'text-[#94A3B8]'
                          }`}
                        >
                          ${row.amount_to_transfer_ars.toLocaleString('es-AR')}{' '}
                          ARS
                        </span>
                        {row.reminder_ia_bonified && (
                          <span className="block text-[10px] text-[#3B82F6]">
                            + Reminder IA 3 USD Bonificado
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-3 text-right">
                        {row.transferred ? (
                          <div className="inline-flex flex-col items-end gap-1">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#2563EB]/15 border border-[#2563EB]/40 text-[11px] font-semibold text-[#3B82F6]">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Transferido
                            </span>
                            {row.transferred_at && (
                              <span className="text-[10px] text-[#94A3B8]">
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
                            className="min-h-[38px] px-3 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-[#1E293B] disabled:text-[#94A3B8] text-[#F8FAFC] text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                            <span>
                              {isBusy
                                ? 'Registrando...'
                                : 'Marcar como transferido'}
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
          <section className="p-5 rounded-xl bg-[#0F172A] border border-[#1E293B] space-y-4">
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-[#3B82F6]" />
              <h2 className="text-sm font-semibold text-[#F8FAFC]">
                Alta de Barbero
              </h2>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-[#090D16] border border-[#334155] text-xs text-[#F8FAFC]">
                {error}
              </div>
            )}

            {successMsg && (
              <div className="p-3.5 rounded-lg bg-[#090D16] border border-[#2563EB] space-y-2.5">
                <p className="text-xs text-[#3B82F6] font-semibold">
                  {successMsg}
                </p>
                {createdBarberSlug && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                    <span className="text-xs text-[#F8FAFC] bg-[#0F172A] px-3 py-1.5 rounded-lg border border-[#1E293B] select-all truncate">
                      {typeof window !== 'undefined'
                        ? `${window.location.origin}/${createdBarberSlug}`
                        : `/${createdBarberSlug}`}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={async () => {
                          const fullUrl =
                            typeof window !== 'undefined'
                              ? `${window.location.origin}/${createdBarberSlug}`
                              : `/${createdBarberSlug}`;
                          await navigator.clipboard
                            .writeText(fullUrl)
                            .catch(() => {});
                          setCopiedSlug(true);
                          setTimeout(() => setCopiedSlug(false), 2000);
                        }}
                        className="min-h-[36px] px-3 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-[#F8FAFC] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        {copiedSlug ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>¡Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copiar Link</span>
                          </>
                        )}
                      </button>

                      {onOpenBarberPublicSlug && (
                        <button
                          type="button"
                          onClick={() =>
                            onOpenBarberPublicSlug(createdBarberSlug)
                          }
                          className="min-h-[36px] px-3 rounded-lg bg-[#0F172A] border border-[#1E293B] hover:border-[#334155] text-[#F8FAFC] text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-[#3B82F6]" />
                          <span>Abrir Link</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <form
              onSubmit={handleCreate}
              className="grid grid-cols-1 sm:grid-cols-3 gap-3"
            >
              <div>
                <label className="block text-xs font-medium text-[#94A3B8] mb-1">
                  DNI Barbero *
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  placeholder="35111222"
                  value={dni}
                  onChange={(e) => setDni(e.target.value.replace(/\D/g, ''))}
                  className="w-full min-h-[42px] px-3 rounded-lg bg-[#090D16] border border-[#1E293B] focus:border-[#2563EB] focus:outline-none text-xs text-[#F8FAFC]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#94A3B8] mb-1">
                  Contraseña Inicial *
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-lg bg-[#090D16] border border-[#1E293B] focus:border-[#2563EB] focus:outline-none text-xs text-[#F8FAFC]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#94A3B8] mb-1">
                  Nombre del Barbero *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Mateo Rossi"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-lg bg-[#090D16] border border-[#1E293B] focus:border-[#2563EB] focus:outline-none text-xs text-[#F8FAFC]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#94A3B8] mb-1">
                  WhatsApp *
                </label>
                <input
                  type="tel"
                  required
                  placeholder="+5491144556677"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-lg bg-[#090D16] border border-[#1E293B] focus:border-[#2563EB] focus:outline-none text-xs text-[#F8FAFC]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#94A3B8] mb-1">
                  Nombre de la Barbería *
                </label>
                <input
                  type="text"
                  name="shopName"
                  required
                  placeholder="Ej: Mi Barbería"
                  value={shopName}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setShopName(nextVal);
                    if (!slugManuallyEdited) {
                      setSlug(generateSlugFromShopName(nextVal));
                    }
                  }}
                  className="w-full min-h-[42px] px-3 rounded-lg bg-[#090D16] border border-[#1E293B] focus:border-[#2563EB] focus:outline-none text-xs text-[#F8FAFC]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#94A3B8] mb-1">
                  Slug Público (URL)
                </label>
                <input
                  type="text"
                  placeholder="mi-barberia"
                  value={slug}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSlugManuallyEdited(val.trim().length > 0);
                    setSlug(generateSlugFromShopName(val));
                  }}
                  className="w-full min-h-[42px] px-3 rounded-lg bg-[#090D16] border border-[#1E293B] focus:border-[#2563EB] focus:outline-none text-xs text-[#3B82F6]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-[#94A3B8] mb-1">
                  Dirección (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Av. Santa Fe 3200, Palermo"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-lg bg-[#090D16] border border-[#1E293B] focus:border-[#2563EB] focus:outline-none text-xs text-[#F8FAFC]"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={creating}
                  className="w-full min-h-[42px] px-4 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-[#F8FAFC] text-xs font-semibold transition-colors cursor-pointer"
                >
                  {creating ? 'Creando...' : 'Crear Barbero'}
                </button>
              </div>
            </form>
          </section>

          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase text-[#94A3B8]">
              Control de Barberías y Add-on Reminder IA (3 USD)
            </h2>

            <div className="space-y-2.5">
              {barbers.map((barber) => (
                <div
                  key={barber.id}
                  className="p-4 rounded-xl bg-[#0F172A] border border-[#1E293B] flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Scissors className="w-3.5 h-3.5 text-[#3B82F6]" />
                      <h3 className="text-base font-semibold text-[#F8FAFC]">
                        {barber.shop_name}
                      </h3>
                      <span className="text-xs text-[#3B82F6]">
                        /{barber.slug}
                      </span>
                    </div>
                    <p className="text-xs text-[#94A3B8]">
                      Barbero: {barber.user.name} · DNI:{' '}
                      <span className="text-[#F8FAFC]">{barber.user.dni}</span> ·
                      Tel: {barber.user.phone}
                    </p>
                    <div className="flex items-center gap-4 pt-1 text-xs">
                      <span className="flex items-center gap-1 text-[#F8FAFC]">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#3B82F6]" />
                        {barber.confirmed_appointments_count} turnos confirmados
                      </span>
                      <span className="flex items-center gap-1 text-[#3B82F6] font-medium">
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
                      <span className="block text-[10px] font-medium text-[#94A3B8]">
                        Reminder IA (3 USD)
                      </span>
                      <span
                        className={`text-xs font-semibold ${
                          barber.reminder_addon_active
                            ? 'text-[#3B82F6]'
                            : 'text-[#94A3B8]'
                        }`}
                      >
                        {barber.reminder_addon_active ? 'Activo' : 'Desactivado'}
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
                      className={`min-h-[42px] px-4 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                        barber.reminder_addon_active
                          ? 'bg-[#2563EB] border-[#2563EB] text-[#F8FAFC]'
                          : 'bg-[#090D16] border-[#1E293B] text-[#F8FAFC] hover:border-[#3B82F6]'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>
                        {barber.reminder_addon_active ? 'Apagar' : 'Activar 3 USD'}
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
