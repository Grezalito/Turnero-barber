import React, { useCallback, useEffect, useState } from 'react';
import { BarberDashboardView } from './components/BarberDashboardView';
import { ActiveView, Header } from './components/Header';
import { LoginModal } from './components/LoginModal';
import {
  InlineBookingClientData,
  PublicBookingView,
} from './components/PublicBookingView';
import { SuperAdminView } from './components/SuperAdminView';
import { AuthProvider, useAuth } from './context/AuthContext';
import { api } from './services/api';
import {
  AdminBarberItem,
  AppointmentSlot,
  LockSlotResponse,
  PublicBarberScheduleResponse,
  WeeklyGoalMetrics,
  WeeklySettlementItem,
} from './types/api';
import {
  calculateWeeklyGoalMetrics,
  getWeekBoundsUtc,
} from './utils/postBookingAndGamification';

function buildInitialDemoSettlements(): WeeklySettlementItem[] {
  const current = getWeekBoundsUtc();
  const prev1 = getWeekBoundsUtc(
    new Date(current.weekStart.getTime() - 7 * 24 * 60 * 60 * 1000),
  );
  const prev2 = getWeekBoundsUtc(
    new Date(current.weekStart.getTime() - 14 * 24 * 60 * 60 * 1000),
  );

  return [
    {
      id: 'st_curr_1',
      barber_id: 'barber_demo_1',
      shop_name: 'OBSIDIAN & RAW BRASS STUDIO',
      slug: 'obsidian-studio',
      barber_name: 'Facundo Quiroga',
      barber_dni: '34888999',
      barber_phone: '+5491155667788',
      week_start: current.weekStart.toISOString(),
      week_end: current.weekEnd.toISOString(),
      week_label: 'Semana Actual (Lunes a Domingo)',
      is_current_week: true,
      confirmed_slots_count: 22,
      platform_gross_revenue_ars: 44000,
      reached_bonus: true,
      bonus_tier: 'TIER_15',
      bonus_tier_label: 'Nivel 1 (15+ turnos) · $10.000 ARS',
      amount_to_transfer_ars: 10000,
      reminder_ia_bonified: false,
      transferred: false,
      transferred_at: null,
    },
    {
      id: 'st_prev1_1',
      barber_id: 'barber_demo_1',
      shop_name: 'OBSIDIAN & RAW BRASS STUDIO',
      slug: 'obsidian-studio',
      barber_name: 'Facundo Quiroga',
      barber_dni: '34888999',
      barber_phone: '+5491155667788',
      week_start: prev1.weekStart.toISOString(),
      week_end: prev1.weekEnd.toISOString(),
      week_label: 'Semana Anterior (-1 sem)',
      is_current_week: false,
      confirmed_slots_count: 52,
      platform_gross_revenue_ars: 104000,
      reached_bonus: true,
      bonus_tier: 'TIER_50',
      bonus_tier_label:
        'Nivel 3 (50+ turnos) · $40.000 ARS + Reminder IA Bonificado',
      amount_to_transfer_ars: 40000,
      reminder_ia_bonified: true,
      transferred: true,
      transferred_at: new Date(
        prev1.weekEnd.getTime() + 12 * 60 * 60 * 1000,
      ).toISOString(),
    },
    {
      id: 'st_prev2_1',
      barber_id: 'barber_demo_1',
      shop_name: 'OBSIDIAN & RAW BRASS STUDIO',
      slug: 'obsidian-studio',
      barber_name: 'Facundo Quiroga',
      barber_dni: '34888999',
      barber_phone: '+5491155667788',
      week_start: prev2.weekStart.toISOString(),
      week_end: prev2.weekEnd.toISOString(),
      week_label: 'Hace 2 Semanas (-2 sem)',
      is_current_week: false,
      confirmed_slots_count: 37,
      platform_gross_revenue_ars: 74000,
      reached_bonus: true,
      bonus_tier: 'TIER_35',
      bonus_tier_label: 'Nivel 2 (35+ turnos) · $25.000 ARS',
      amount_to_transfer_ars: 25000,
      reminder_ia_bonified: false,
      transferred: true,
      transferred_at: new Date(
        prev2.weekEnd.getTime() + 12 * 60 * 60 * 1000,
      ).toISOString(),
    },
  ];
}

function buildInitialDemoSchedule(slug: string): PublicBarberScheduleResponse {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const dayAfter = new Date(Date.now() + 48 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const buildDaySlots = (dateStr: string, hours: string[]): AppointmentSlot[] =>
    hours.map((hhmm, idx) => {
      const start = new Date(`${dateStr}T${hhmm}:00.000Z`);
      const end = new Date(start.getTime() + 30 * 60 * 1000);
      return {
        id: `slot_${dateStr}_${idx}`,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        status: 'AVAILABLE',
        deposit_amount: 2000,
      };
    });

  return {
    barber: {
      id: 'barber_demo_1',
      slug,
      shop_name: 'OBSIDIAN & RAW BRASS STUDIO',
      address: 'Thames 1840, Palermo Soho',
      barber_name: 'Facundo Quiroga',
      barber_phone: '+5491155667788',
    },
    deposit_amount_ars: 2000,
    slot_duration_minutes: 30,
    dates: {
      [today]: buildDaySlots(today, [
        '11:00',
        '11:30',
        '12:00',
        '16:30',
        '17:00',
        '18:00',
      ]),
      [tomorrow]: buildDaySlots(tomorrow, [
        '10:00',
        '10:30',
        '11:00',
        '11:30',
        '12:00',
        '12:30',
        '16:00',
        '16:30',
        '17:00',
        '17:30',
        '18:00',
        '18:30',
      ]),
      [dayAfter]: buildDaySlots(dayAfter, [
        '09:00',
        '09:30',
        '10:00',
        '10:30',
        '15:00',
        '15:30',
        '16:00',
        '16:30',
      ]),
    },
  };
}

function buildInitialDemoBarberSlots(
  publicDates: Record<string, AppointmentSlot[]>,
): AppointmentSlot[] {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const makeBooked = (
    dateStr: string,
    hhmm: string,
    status: 'CONFIRMED' | 'PENDING_PAYMENT',
    client: { id: string; dni: string; name: string; phone: string },
  ): AppointmentSlot => {
    const start = new Date(`${dateStr}T${hhmm}:00.000Z`);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    return {
      id: `booked_${dateStr}_${hhmm.replace(':', '')}`,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      status,
      deposit_amount: 2000,
      mp_payment_id:
        status === 'CONFIRMED' ? `mp_pay_${hhmm.replace(':', '')}` : null,
      client,
    };
  };

  const demoBooked: AppointmentSlot[] = [
    makeBooked(today, '10:00', 'CONFIRMED', {
      id: 'c_1',
      dni: '38451209',
      name: 'Martín Echeverría',
      phone: '+54 9 11 4455-8899',
    }),
    makeBooked(today, '10:30', 'CONFIRMED', {
      id: 'c_2',
      dni: '41209384',
      name: 'Lucas Benítez',
      phone: '+54 9 11 6789-1234',
    }),
    makeBooked(today, '15:00', 'CONFIRMED', {
      id: 'c_3',
      dni: '36998112',
      name: 'Santiago Villalba',
      phone: '+54 9 11 3344-7766',
    }),
    makeBooked(today, '16:00', 'PENDING_PAYMENT', {
      id: 'c_4',
      dni: '42887103',
      name: 'Nicolás Roldán',
      phone: '+54 9 11 5522-9911',
    }),
    makeBooked(tomorrow, '09:30', 'CONFIRMED', {
      id: 'c_5',
      dni: '39112445',
      name: 'Agustín Pereyra',
      phone: '+54 9 11 2233-4455',
    }),
  ];

  const availableFlat = Object.values(publicDates).flat();
  return [...demoBooked, ...availableFlat];
}

function resolveSlugFromPathname(pathname: string): string | null {
  const bMatch = pathname.match(/^\/b\/([a-z0-9-]+)\/?$/i);
  if (bMatch) return bMatch[1].toLowerCase();

  const directMatch = pathname.match(/^\/([a-z0-9-]+)\/?$/i);
  if (directMatch) {
    const candidate = directMatch[1].toLowerCase();
    const reserved = new Set(['admin', 'panel', 'login', 'auth']);
    if (!reserved.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

const AppContent: React.FC = () => {
  const { user, token, login, logout } = useAuth();
  const [slug, setSlug] = useState<string>(() => {
    const pathSlug = resolveSlugFromPathname(window.location.pathname);
    if (pathSlug) return pathSlug;
    return 'obsidian-studio';
  });
  // Sin auto-ingreso forzado al abrir la app: inicia siempre en vista pública (Guest Checkout)
  const [activeView, setActiveView] = useState<ActiveView>('PUBLIC_BOOKING');
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  const [schedule, setSchedule] = useState<PublicBarberScheduleResponse>(() =>
    buildInitialDemoSchedule(
      resolveSlugFromPathname(window.location.pathname) || 'obsidian-studio',
    ),
  );
  const [selectedSlot, setSelectedSlot] = useState<AppointmentSlot | null>(
    null,
  );
  const [activeLock, setActiveLock] = useState<LockSlotResponse | null>(null);
  const [isSandboxCheckoutOpen, setIsSandboxCheckoutOpen] = useState(false);

  const [confirmedSlotInfo, setConfirmedSlotInfo] = useState<{
    slotId: string;
    mpPaymentId: string;
    startTimeIso?: string;
    endTimeIso?: string;
    barberPhone?: string;
    reminderEnqueued: boolean;
    reminderMessage?: string | null;
    emailMode?: string;
  } | null>(null);
  const [isLocking, setIsLocking] = useState(false);

  // Barber panel state
  const [barberSlots, setBarberSlots] = useState<AppointmentSlot[]>(() =>
    buildInitialDemoBarberSlots(
      buildInitialDemoSchedule('obsidian-studio').dates,
    ),
  );
  const [barberWeeklyGoal, setBarberWeeklyGoal] =
    useState<WeeklyGoalMetrics | null>(() => calculateWeeklyGoalMetrics(12));
  const [barberInfo, setBarberInfo] = useState<{
    id: string;
    slug: string;
    shop_name: string;
    address?: string | null;
    reminder_addon_active: boolean;
  }>(() => {
    if (user?.barber_profile) {
      return {
        id: user.barber_profile.id,
        slug: user.barber_profile.slug,
        shop_name: user.barber_profile.shop_name,
        address: user.barber_profile.address,
        reminder_addon_active: user.barber_profile.reminder_addon_active,
      };
    }
    return {
      id: 'barber_demo_1',
      slug: 'obsidian-studio',
      shop_name: 'OBSIDIAN & RAW BRASS STUDIO',
      address: 'Thames 1840, Palermo Soho',
      reminder_addon_active: true,
    };
  });

  // SuperAdmin state
  const [adminBarbers, setAdminBarbers] = useState<AdminBarberItem[]>([
    {
      id: 'barber_demo_1',
      slug: 'obsidian-studio',
      shop_name: 'OBSIDIAN & RAW BRASS STUDIO',
      address: 'Thames 1840, Palermo Soho',
      reminder_addon_active: true,
      confirmed_appointments_count: 22,
      estimated_platform_revenue_ars: 44000,
      user: {
        id: 'u_barber_1',
        dni: '34888999',
        name: 'Facundo Quiroga',
        phone: '+5491155667788',
        created_at: new Date().toISOString(),
      },
      created_at: new Date().toISOString(),
    },
  ]);
  const [adminSettlements, setAdminSettlements] = useState<
    WeeklySettlementItem[]
  >(() => buildInitialDemoSettlements());

  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadPublicSchedule = useCallback(async (targetSlug: string) => {
    try {
      const data = await api.getPublicSchedule(targetSlug);
      setSchedule(data);
    } catch {
      setSchedule((prev) =>
        prev.barber.slug === targetSlug
          ? prev
          : buildInitialDemoSchedule(targetSlug),
      );
    }
  }, []);

  const loadBarberDashboard = useCallback(async () => {
    try {
      const data = await api.getBarberSlots(token);
      setBarberInfo(data.barber);
      setBarberSlots(data.slots);
      if (data.weekly_goal) {
        setBarberWeeklyGoal(data.weekly_goal);
      }
    } catch {
      setBarberSlots((prev) =>
        prev.length > 0 ? prev : buildInitialDemoBarberSlots(schedule.dates),
      );
    }
  }, [schedule.dates, token]);

  const loadAdminBarbers = useCallback(async () => {
    try {
      const [list, settlementsRes] = await Promise.all([
        api.listAdminBarbers(token),
        api.listWeeklySettlements(token).catch(() => null),
      ]);
      setAdminBarbers(list);
      if (settlementsRes?.settlements) {
        setAdminSettlements(settlementsRes.settlements);
      }
    } catch {
      // Conservar lista actual en modo preview
    }
  }, [token]);

  useEffect(() => {
    const handlePopState = () => {
      const pathSlug = resolveSlugFromPathname(window.location.pathname);
      if (pathSlug) {
        setSlug(pathSlug);
        setActiveView('PUBLIC_BOOKING');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    loadPublicSchedule(slug);
  }, [slug, loadPublicSchedule]);

  useEffect(() => {
    if (!user && (activeView === 'BARBER_PANEL' || activeView === 'SUPERADMIN_PANEL')) {
      setActiveView('PUBLIC_BOOKING');
    }
  }, [user, activeView]);

  useEffect(() => {
    if (activeView === 'BARBER_PANEL') {
      loadBarberDashboard();
    } else if (activeView === 'SUPERADMIN_PANEL') {
      loadAdminBarbers();
    }
  }, [activeView, loadBarberDashboard, loadAdminBarbers]);

  const executeLockForSlot = async (
    slot: AppointmentSlot,
    credentials?: {
      dni: string;
      password: string;
      name?: string;
      phone?: string;
    },
  ) => {
    setIsLocking(true);
    setConfirmedSlotInfo(null);
    setStatusMessage(null);
    try {
      const lockRes = await api.lockSlot(slot.id, credentials);
      setActiveLock(lockRes);
      setSelectedSlot(null);
      const paymentUrl =
        lockRes.payment.init_point || lockRes.payment.sandbox_init_point;
      if (
        lockRes.payment.is_sandbox_local === false &&
        paymentUrl &&
        paymentUrl.startsWith('http')
      ) {
        window.location.href = paymentUrl;
        return;
      }
      setIsSandboxCheckoutOpen(true);
      await loadPublicSchedule(slug);
    } catch (err) {
      const msg = (err as Error).message || '';
      if (msg.includes('409') || msg.includes('reservado')) {
        setStatusMessage(msg);
        await loadPublicSchedule(slug);
        return;
      }

      const lockedUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const fallbackLock: LockSlotResponse = {
        slot: {
          ...slot,
          status: 'PENDING_PAYMENT',
          locked_until: lockedUntil,
        },
        payment: {
          preference_id: `pref_mp_${slot.id.slice(0, 8)}`,
          init_point: `http://localhost:5173/checkout-mp?pref_id=${slot.id}`,
          sandbox_init_point: `http://localhost:5173/checkout-mp?pref_id=${slot.id}`,
          deposit_amount: 2000,
          external_reference: slot.id,
          is_sandbox_local: true,
        },
      };
      setActiveLock(fallbackLock);
      setIsSandboxCheckoutOpen(true);
      setSchedule((prev) => {
        const nextDates: Record<string, AppointmentSlot[]> = {};
        for (const [dKey, list] of Object.entries(prev.dates)) {
          nextDates[dKey] = list.filter((s) => s.id !== slot.id);
        }
        return { ...prev, dates: nextDates };
      });
      setSelectedSlot(null);
    } finally {
      setIsLocking(false);
    }
  };

  const handleInitiateLock = async (
    slot: AppointmentSlot,
    clientData?: InlineBookingClientData,
  ) => {
    if (clientData) {
      await executeLockForSlot(slot, {
        dni: clientData.dni,
        password: clientData.password || clientData.dni.padStart(6, '0'),
        name: clientData.name,
        phone: clientData.phone,
      });
      return;
    }
    await executeLockForSlot(slot);
  };

  const handleLogin = async (dni: string, password: string) => {
    const res = await login(dni, password);
    if (res.user.barber_profile) {
      setBarberInfo({
        id: res.user.barber_profile.id,
        slug: res.user.barber_profile.slug,
        shop_name: res.user.barber_profile.shop_name,
        address: res.user.barber_profile.address,
        reminder_addon_active: res.user.barber_profile.reminder_addon_active,
      });
      setSlug(res.user.barber_profile.slug);
      setBarberSlots([]);
    }
    if (res.user.role === 'SUPERADMIN') {
      setActiveView('SUPERADMIN_PANEL');
    } else if (res.user.role === 'BARBER') {
      setActiveView('BARBER_PANEL');
    }
  };

  const handleLogout = useCallback(() => {
    logout();
    setActiveView('PUBLIC_BOOKING');
    setIsLoginModalOpen(false);
    if (window.location.pathname !== '/') {
      window.history.pushState({}, '', '/');
    }
  }, [logout]);

  const handleSimulateWebhook = async (slotId: string) => {
    const lockedStart = activeLock?.slot.start_time;
    const lockedEnd = activeLock?.slot.end_time;
    try {
      const res = await api.simulateMercadoPagoWebhook(slotId, 'approved');
      setActiveLock(null);
      setIsSandboxCheckoutOpen(false);
      setConfirmedSlotInfo({
        slotId: res.slot_id,
        mpPaymentId: res.mp_payment_id,
        startTimeIso: res.start_time || lockedStart,
        endTimeIso: res.end_time || lockedEnd,
        barberPhone: res.barber_phone || schedule.barber.barber_phone,
        reminderEnqueued: Boolean(res.reminder_enqueued),
        reminderMessage: res.reminder_message || null,
        emailMode: res.email_mode,
      });
      await loadPublicSchedule(slug);
    } catch {
      const mockPaymentId = `mp_pay_${Date.now()}`;
      const mockMsg = barberInfo.reminder_addon_active
        ? `[MOCK DeepSeek IA] Hola Cliente, te recordamos tu turno de 30 min en ${schedule.barber.shop_name}. Seña de $2.000 ARS acreditada.`
        : null;
      const fallbackStart =
        lockedStart || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const fallbackEnd =
        lockedEnd ||
        new Date(new Date(fallbackStart).getTime() + 30 * 60 * 1000).toISOString();

      setBarberWeeklyGoal((prev) =>
        calculateWeeklyGoalMetrics((prev?.confirmed_count ?? 22) + 1),
      );

      setAdminSettlements((prev) =>
        prev.map((st) => {
          if (!st.is_current_week) return st;
          const nextCount = st.confirmed_slots_count + 1;
          const nextMetrics = calculateWeeklyGoalMetrics(nextCount);
          return {
            ...st,
            confirmed_slots_count: nextCount,
            platform_gross_revenue_ars: nextCount * 2000,
            reached_bonus: nextMetrics.earned_bonus_ars > 0,
            bonus_tier: nextMetrics.tier,
            bonus_tier_label: nextMetrics.tier_label,
            amount_to_transfer_ars: nextMetrics.earned_bonus_ars,
            reminder_ia_bonified: nextMetrics.reminder_ia_bonified,
          };
        }),
      );

      setActiveLock(null);
      setIsSandboxCheckoutOpen(false);
      setConfirmedSlotInfo({
        slotId,
        mpPaymentId: mockPaymentId,
        startTimeIso: fallbackStart,
        endTimeIso: fallbackEnd,
        barberPhone: schedule.barber.barber_phone,
        reminderEnqueued: barberInfo.reminder_addon_active,
        reminderMessage: mockMsg,
        emailMode: 'CONSOLE_FALLBACK',
      });
    }
  };

  const handleSimulateRejectedWebhook = async (
    slotId: string,
  ): Promise<{ mpPaymentId: string; reason: string }> => {
    try {
      const res = await api.simulateMercadoPagoWebhook(slotId, 'rejected');
      return {
        mpPaymentId: res.mp_payment_id,
        reason: res.reason || 'Pago rechazado por entidad emisora (rejected)',
      };
    } catch {
      return {
        mpPaymentId: `mp_pay_rej_${Date.now()}`,
        reason: 'Pago rechazado en simulador Sandbox Local (status: rejected)',
      };
    }
  };

  const handleReleaseLock = async (slotId: string) => {
    try {
      await api.releaseSlotLock(slotId);
    } catch {
      // ignore if offline
    } finally {
      setActiveLock(null);
      setIsSandboxCheckoutOpen(false);
      await loadPublicSchedule(slug);
    }
  };

  const totalAvailablePublicSlots = Object.values(schedule.dates).reduce(
    (acc, list) => acc + list.length,
    0,
  );

  return (
    <div className="min-h-[100dvh] w-full overflow-x-hidden bg-[#0A0A0B] text-[#F2EFE9]">
      <Header
        user={user}
        activeView={activeView}
        onChangeView={setActiveView}
        currentSlug={slug}
        shopName={schedule.barber.shop_name}
        availableCount={totalAvailablePublicSlots}
        onOpenAuthSheet={() => setIsLoginModalOpen(true)}
        onLogout={handleLogout}
      />

      <main className="max-w-3xl mx-auto pt-14 px-3.5 sm:px-4">
        {statusMessage && (
          <div className="mb-3 p-3 rounded-sm bg-[#121214] border border-[#D49A2A] text-xs font-medium text-[#F2EFE9]">
            {statusMessage}
          </div>
        )}

        {activeView === 'PUBLIC_BOOKING' && (
          <PublicBookingView
            schedule={schedule}
            slug={slug}
            onChangeSlug={(newSlug) => setSlug(newSlug)}
            onRefresh={() => loadPublicSchedule(slug)}
            selectedSlot={selectedSlot}
            onSelectSlot={setSelectedSlot}
            activeLock={activeLock}
            onInitiateLock={handleInitiateLock}
            onSimulateWebhook={handleSimulateWebhook}
            onSimulateRejectedWebhook={handleSimulateRejectedWebhook}
            onReleaseLock={handleReleaseLock}
            isSandboxCheckoutOpen={isSandboxCheckoutOpen}
            onSetSandboxCheckoutOpen={setIsSandboxCheckoutOpen}
            onOpenBarberAccess={() => setIsLoginModalOpen(true)}
            confirmedSlotInfo={confirmedSlotInfo}
            isLocking={isLocking}
          />
        )}

        {activeView === 'BARBER_PANEL' && (
          <BarberDashboardView
            barberInfo={barberInfo}
            slots={barberSlots}
            weeklyGoal={barberWeeklyGoal}
            onLogout={handleLogout}
            onSwitchToPublicView={() => {
              const targetSlug = barberInfo.slug || slug;
              setSlug(targetSlug);
              window.history.pushState({}, '', `/${targetSlug}`);
              setActiveView('PUBLIC_BOOKING');
            }}
            onGenerateRange={async ({
              date,
              end_date,
              start_time,
              end_time,
              break_start_time,
              break_end_time,
            }) => {
              try {
                const res = await api.manageBarberSlots(
                  {
                    date,
                    end_date,
                    start_time,
                    end_time,
                    break_start_time,
                    break_end_time,
                  },
                  token,
                );
                await loadBarberDashboard();
                await loadPublicSchedule(slug);
                return res;
              } catch {
                // Fallback local range generation (30m strict blocks)
                const startMs = new Date(
                  `${date}T${start_time}:00.000Z`,
                ).getTime();
                const endMs = new Date(`${date}T${end_time}:00.000Z`).getTime();
                const bStartMs = break_start_time
                  ? new Date(`${date}T${break_start_time}:00.000Z`).getTime()
                  : null;
                const bEndMs = break_end_time
                  ? new Date(`${date}T${break_end_time}:00.000Z`).getTime()
                  : null;

                const generated: AppointmentSlot[] = [];
                for (let t = startMs; t < endMs; t += 30 * 60 * 1000) {
                  if (bStartMs && bEndMs && t >= bStartMs && t < bEndMs) {
                    continue;
                  }
                  generated.push({
                    id: `slot_${t}`,
                    start_time: new Date(t).toISOString(),
                    end_time: new Date(t + 30 * 60 * 1000).toISOString(),
                    status: 'AVAILABLE',
                    deposit_amount: 2000,
                  });
                }
                setBarberSlots((prev) => [...prev, ...generated]);
                setSchedule((prev) => ({
                  ...prev,
                  dates: {
                    ...prev.dates,
                    [date]: [...(prev.dates[date] || []), ...generated],
                  },
                }));
                return { generated_count: generated.length, days_processed: 1 };
              }
            }}
            onToggleSingleSlot={async ({ date, slot_start_time }) => {
              try {
                await api.manageBarberSlots(
                  { date, slot_start_time },
                  token,
                );
                await loadBarberDashboard();
                await loadPublicSchedule(slug);
              } catch {
                const targetIso = new Date(
                  `${date}T${slot_start_time}:00.000Z`,
                ).toISOString();
                const exists = barberSlots.find(
                  (s) => s.start_time === targetIso,
                );
                if (exists) {
                  setBarberSlots((prev) =>
                    prev.filter((s) => s.id !== exists.id),
                  );
                } else {
                  const startMs = new Date(targetIso).getTime();
                  const newSlot: AppointmentSlot = {
                    id: `slot_${startMs}`,
                    start_time: targetIso,
                    end_time: new Date(startMs + 30 * 60 * 1000).toISOString(),
                    status: 'AVAILABLE',
                    deposit_amount: 2000,
                  };
                  setBarberSlots((prev) => [...prev, newSlot]);
                }
              }
            }}
          />
        )}

        {activeView === 'SUPERADMIN_PANEL' && (
          <SuperAdminView
            barbers={adminBarbers}
            settlements={adminSettlements}
            onLogout={handleLogout}
            onOpenBarberPublicSlug={(targetSlug) => {
              setSlug(targetSlug);
              window.history.pushState({}, '', `/${targetSlug}`);
              setActiveView('PUBLIC_BOOKING');
            }}
            onCreateBarber={async (payload) => {
              const created = await api.createAdminBarber(payload, token);
              const createdItem: AdminBarberItem = {
                id: created.id,
                slug: created.slug,
                shop_name: created.shop_name,
                address: created.address,
                reminder_addon_active: Boolean(created.reminder_addon_active),
                confirmed_appointments_count:
                  created.confirmed_appointments_count || 0,
                estimated_platform_revenue_ars:
                  created.estimated_platform_revenue_ars || 0,
                user: {
                  id: created.user.id,
                  dni: created.user.dni,
                  name: created.user.name,
                  phone: created.user.phone,
                  created_at:
                    created.user.created_at || new Date().toISOString(),
                },
                created_at: created.created_at || new Date().toISOString(),
              };
              setAdminBarbers((prev) => [
                createdItem,
                ...prev.filter((b) => b.id !== createdItem.id),
              ]);
              await loadAdminBarbers();
              return createdItem;
            }}
            onToggleReminder={async (barberId, active) => {
              try {
                await api.toggleBarberReminder(barberId, active, token);
                await loadAdminBarbers();
              } catch {
                setAdminBarbers((prev) =>
                  prev.map((b) =>
                    b.id === barberId
                      ? { ...b, reminder_addon_active: active }
                      : b,
                  ),
                );
              }
            }}
            onMarkSettlementTransferred={async (
              barberId,
              weekStartIso,
              transferred,
            ) => {
              try {
                await api.markSettlementTransferred(
                  barberId,
                  weekStartIso,
                  transferred,
                  token,
                );
                await loadAdminBarbers();
              } catch {
                setAdminSettlements((prev) =>
                  prev.map((st) =>
                    st.barber_id === barberId && st.week_start === weekStartIso
                      ? {
                          ...st,
                          transferred,
                          transferred_at: transferred
                            ? new Date().toISOString()
                            : null,
                        }
                      : st,
                  ),
                );
              }
            }}
          />
        )}
      </main>

      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        user={user}
        onLoginSuccess={handleLogin}
        onNavigateView={setActiveView}
        onLogout={handleLogout}
      />
    </div>
  );
};

export const App: React.FC = () => (
  <AuthProvider>
    <AppContent />
  </AuthProvider>
);

export default App;
