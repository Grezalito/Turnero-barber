import React, { useCallback, useEffect, useState } from 'react';
import { AuthBottomSheet } from './components/AuthBottomSheet';
import { BarberDashboardView } from './components/BarberDashboardView';
import { ClientAppointmentsView } from './components/ClientAppointmentsView';
import { ActiveView, Header } from './components/Header';
import {
  formatTime30m,
  InlineBookingClientData,
  PublicBookingView,
} from './components/PublicBookingView';
import { SuperAdminView } from './components/SuperAdminView';
import {
  api,
  clearSession,
  getStoredUser,
  saveSession,
} from './services/api';
import {
  AdminBarberItem,
  AppointmentSlot,
  ClientAppointmentSlot,
  LockSlotResponse,
  PublicBarberScheduleResponse,
  User,
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

export const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(() => getStoredUser());
  const [slug, setSlug] = useState<string>(() => {
    return resolveSlugFromPathname(window.location.pathname) || 'obsidian-studio';
  });
  const [activeView, setActiveView] = useState<ActiveView>(() => {
    const pathSlug = resolveSlugFromPathname(window.location.pathname);
    if (pathSlug) return 'PUBLIC_BOOKING';
    const u = getStoredUser();
    if (u?.role === 'BARBER') return 'BARBER_PANEL';
    if (u?.role === 'SUPERADMIN') return 'SUPERADMIN_PANEL';
    return 'PUBLIC_BOOKING';
  });
  const [isAuthSheetOpen, setIsAuthSheetOpen] = useState(false);

  const [schedule, setSchedule] = useState<PublicBarberScheduleResponse>(() =>
    buildInitialDemoSchedule(
      resolveSlugFromPathname(window.location.pathname) || 'obsidian-studio',
    ),
  );
  const [selectedSlot, setSelectedSlot] = useState<AppointmentSlot | null>(
    null,
  );
  const [pendingSlotForAuth, setPendingSlotForAuth] =
    useState<AppointmentSlot | null>(null);
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

  // Client appointments state
  const [clientSlots, setClientSlots] = useState<ClientAppointmentSlot[]>([]);
  const [loadingClientSlots, setLoadingClientSlots] = useState(false);

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
  }>({
    id: 'barber_demo_1',
    slug: 'obsidian-studio',
    shop_name: 'OBSIDIAN & RAW BRASS STUDIO',
    address: 'Thames 1840, Palermo Soho',
    reminder_addon_active: true,
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

  const loadClientAppointments = useCallback(async () => {
    if (!user) return;
    setLoadingClientSlots(true);
    try {
      const data = await api.getClientSlots();
      setClientSlots(data.slots);
    } catch {
      // Conservar lista local en modo offline
    } finally {
      setLoadingClientSlots(false);
    }
  }, [user]);

  const loadBarberDashboard = useCallback(async () => {
    try {
      const data = await api.getBarberSlots();
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
  }, [schedule.dates]);

  const loadAdminBarbers = useCallback(async () => {
    try {
      const [list, settlementsRes] = await Promise.all([
        api.listAdminBarbers(),
        api.listWeeklySettlements().catch(() => null),
      ]);
      setAdminBarbers(list);
      if (settlementsRes?.settlements) {
        setAdminSettlements(settlementsRes.settlements);
      }
    } catch {
      // Conservar lista actual en modo preview
    }
  }, []);

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
    if (user) {
      loadClientAppointments();
    } else {
      setClientSlots([]);
    }
  }, [user, loadClientAppointments]);

  useEffect(() => {
    if (activeView === 'BARBER_PANEL') {
      loadBarberDashboard();
    } else if (activeView === 'SUPERADMIN_PANEL') {
      loadAdminBarbers();
    } else if (activeView === 'CLIENT_APPOINTMENTS') {
      loadClientAppointments();
    }
  }, [
    activeView,
    loadBarberDashboard,
    loadAdminBarbers,
    loadClientAppointments,
  ]);

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
      if (lockRes.user) {
        setUser(lockRes.user);
      }
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
      await loadClientAppointments();
    } catch (err) {
      const msg = (err as Error).message || '';
      if (msg.includes('409') || msg.includes('reservado')) {
        setStatusMessage(msg);
        await loadPublicSchedule(slug);
        return;
      }

      if (credentials) {
        const fallbackUser: User = {
          id: `usr_${credentials.dni}`,
          dni: credentials.dni,
          name: credentials.name || user?.name || `Cliente DNI ${credentials.dni}`,
          phone: credentials.phone || user?.phone || '+5491100000000',
          role: 'CLIENT',
        };
        saveSession(`demo_jwt_${credentials.dni}`, fallbackUser);
        setUser(fallbackUser);
      }

      // Fallback local atómico si el backend está offline durante la prueba visual
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
    if (!user) {
      setPendingSlotForAuth(slot);
      setIsAuthSheetOpen(true);
      return;
    }
    await executeLockForSlot(slot);
  };

  const handleLogin = async (dni: string, password: string) => {
    try {
      const res = await api.login(dni, password);
      setUser(res.user);
      if (pendingSlotForAuth) {
        const slotToLock = pendingSlotForAuth;
        setPendingSlotForAuth(null);
        setActiveView('PUBLIC_BOOKING');
        await executeLockForSlot(slotToLock, { dni, password });
      } else if (res.user.role === 'SUPERADMIN') {
        setActiveView('SUPERADMIN_PANEL');
      } else if (res.user.role === 'BARBER') {
        setActiveView('BARBER_PANEL');
      }
    } catch {
      const role =
        dni === '00000000'
          ? 'SUPERADMIN'
          : dni === '34888999'
            ? 'BARBER'
            : 'CLIENT';
      const fallbackUser: User = {
        id: `usr_${dni}`,
        dni,
        name:
          role === 'SUPERADMIN'
            ? 'SuperAdmin Plataforma'
            : role === 'BARBER'
              ? 'Facundo Quiroga'
              : `Cliente DNI ${dni}`,
        phone: '+5491100000000',
        role,
      };
      saveSession(`demo_jwt_${dni}`, fallbackUser);
      setUser(fallbackUser);

      if (pendingSlotForAuth) {
        const slotToLock = pendingSlotForAuth;
        setPendingSlotForAuth(null);
        setActiveView('PUBLIC_BOOKING');
        await executeLockForSlot(slotToLock, { dni, password });
      } else if (role === 'SUPERADMIN') {
        setActiveView('SUPERADMIN_PANEL');
      } else if (role === 'BARBER') {
        setActiveView('BARBER_PANEL');
      }
    }
  };

  const handleRegister = async (payload: {
    dni: string;
    password: string;
    name: string;
    phone: string;
    email?: string;
  }) => {
    try {
      const res = await api.registerClient(payload);
      setUser(res.user);
      if (pendingSlotForAuth) {
        const slotToLock = pendingSlotForAuth;
        setPendingSlotForAuth(null);
        setActiveView('PUBLIC_BOOKING');
        await executeLockForSlot(slotToLock, {
          dni: payload.dni,
          password: payload.password,
        });
      }
    } catch {
      const fallbackUser: User = {
        id: `usr_${payload.dni}`,
        dni: payload.dni,
        name: payload.name,
        phone: payload.phone,
        email: payload.email || null,
        role: 'CLIENT',
      };
      saveSession(`demo_jwt_${payload.dni}`, fallbackUser);
      setUser(fallbackUser);
      if (pendingSlotForAuth) {
        const slotToLock = pendingSlotForAuth;
        setPendingSlotForAuth(null);
        setActiveView('PUBLIC_BOOKING');
        await executeLockForSlot(slotToLock);
      }
    }
  };

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
      await loadClientAppointments();
    } catch {
      const mockPaymentId = `mp_pay_${Date.now()}`;
      const mockMsg = barberInfo.reminder_addon_active
        ? `[MOCK DeepSeek IA] Hola ${user?.name || 'Cliente'}, te recordamos tu turno de 30 min en ${schedule.barber.shop_name}. Seña de $2.000 ARS acreditada.`
        : null;
      const fallbackStart =
        lockedStart || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const fallbackEnd =
        lockedEnd ||
        new Date(new Date(fallbackStart).getTime() + 30 * 60 * 1000).toISOString();

      setClientSlots((prev) => [
        {
          id: slotId,
          start_time: fallbackStart,
          end_time: fallbackEnd,
          status: 'CONFIRMED',
          deposit_amount: 2000,
          mp_payment_id: mockPaymentId,
          barber: {
            id: schedule.barber.id,
            slug: schedule.barber.slug,
            shop_name: schedule.barber.shop_name,
            address: schedule.barber.address,
            reminder_addon_active: barberInfo.reminder_addon_active,
            user: {
              name: schedule.barber.barber_name,
              phone: schedule.barber.barber_phone || '+5491155667788',
            },
          },
          reminders: mockMsg
            ? [
                {
                  id: `rem_${Date.now()}`,
                  status: 'PENDING',
                  scheduled_for: new Date(
                    new Date(fallbackStart).getTime() - 2 * 60 * 60 * 1000,
                  ).toISOString(),
                  generated_message: mockMsg,
                },
              ]
            : [],
        },
        ...prev.filter((s) => s.id !== slotId),
      ]);

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
      await loadClientAppointments();
    }
  };

  const confirmedClientCount = clientSlots.filter(
    (s) => s.status === 'CONFIRMED',
  ).length;
  const totalAvailablePublicSlots = Object.values(schedule.dates).reduce(
    (acc, list) => acc + list.length,
    0,
  );

  return (
    <div className="min-h-[100dvh] w-full overflow-x-hidden bg-[#090D16] text-[#F8FAFC]">
      <Header
        user={user}
        activeView={activeView}
        onChangeView={setActiveView}
        currentSlug={slug}
        shopName={schedule.barber.shop_name}
        availableCount={totalAvailablePublicSlots}
        clientConfirmedCount={confirmedClientCount}
        onOpenAuthSheet={() => {
          setPendingSlotForAuth(null);
          setIsAuthSheetOpen(true);
        }}
      />

      <main className="max-w-3xl mx-auto pt-14 px-3.5 sm:px-4">
        {statusMessage && (
          <div className="mb-3 p-3 rounded-lg bg-[#0F172A] border border-[#2563EB] text-xs font-medium text-[#F8FAFC]">
            {statusMessage}
          </div>
        )}

        {activeView === 'PUBLIC_BOOKING' && (
          <PublicBookingView
            schedule={schedule}
            slug={slug}
            onChangeSlug={(newSlug) => setSlug(newSlug)}
            onRefresh={() => loadPublicSchedule(slug)}
            user={user}
            selectedSlot={selectedSlot}
            onSelectSlot={setSelectedSlot}
            activeLock={activeLock}
            onInitiateLock={handleInitiateLock}
            onSimulateWebhook={handleSimulateWebhook}
            onSimulateRejectedWebhook={handleSimulateRejectedWebhook}
            onReleaseLock={handleReleaseLock}
            isSandboxCheckoutOpen={isSandboxCheckoutOpen}
            onSetSandboxCheckoutOpen={setIsSandboxCheckoutOpen}
            onGoToClientAppointments={
              user ? () => setActiveView('CLIENT_APPOINTMENTS') : undefined
            }
            confirmedSlotInfo={confirmedSlotInfo}
            isLocking={isLocking}
          />
        )}

        {activeView === 'CLIENT_APPOINTMENTS' && user && (
          <ClientAppointmentsView
            user={user}
            slots={clientSlots}
            loading={loadingClientSlots}
            onRefresh={loadClientAppointments}
            onGoToBookNew={(targetSlug) => {
              if (targetSlug) setSlug(targetSlug);
              setActiveView('PUBLIC_BOOKING');
            }}
            activeLock={activeLock}
            onOpenSandboxCheckout={() => {
              setActiveView('PUBLIC_BOOKING');
              setIsSandboxCheckoutOpen(true);
            }}
            onCancelAppointment={async (slotId) => {
              try {
                await api.cancelAppointmentNoRefund(slotId);
                setStatusMessage(
                  'Turno cancelado. Reserva garantizada: la seña de $2.000 ARS fue retenida (no reembolsable ni transferible).',
                );
                await loadClientAppointments();
              } catch {
                setClientSlots((prev) => prev.filter((s) => s.id !== slotId));
                setStatusMessage(
                  'Turno cancelado. Reserva garantizada: la seña de $2.000 ARS fue retenida (no reembolsable ni transferible).',
                );
              }
            }}
          />
        )}

        {activeView === 'BARBER_PANEL' && (
          <BarberDashboardView
            barberInfo={barberInfo}
            slots={barberSlots}
            weeklyGoal={barberWeeklyGoal}
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
                const res = await api.manageBarberSlots({
                  date,
                  end_date,
                  start_time,
                  end_time,
                  break_start_time,
                  break_end_time,
                });
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
                await api.manageBarberSlots({ date, slot_start_time });
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
            onCreateBarber={async (payload) => {
              try {
                await api.createAdminBarber(payload);
                await loadAdminBarbers();
              } catch {
                const newItem: AdminBarberItem = {
                  id: `barber_${Date.now()}`,
                  slug: payload.slug,
                  shop_name: payload.shop_name,
                  address: payload.address,
                  reminder_addon_active: false,
                  confirmed_appointments_count: 0,
                  estimated_platform_revenue_ars: 0,
                  user: {
                    id: `u_${Date.now()}`,
                    dni: payload.dni,
                    name: payload.name,
                    phone: payload.phone,
                    created_at: new Date().toISOString(),
                  },
                  created_at: new Date().toISOString(),
                };
                setAdminBarbers((prev) => [newItem, ...prev]);
              }
            }}
            onToggleReminder={async (barberId, active) => {
              try {
                await api.toggleBarberReminder(barberId, active);
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

      <AuthBottomSheet
        isOpen={isAuthSheetOpen}
        onClose={() => {
          setIsAuthSheetOpen(false);
          setPendingSlotForAuth(null);
        }}
        user={user}
        pendingSlotLabel={
          pendingSlotForAuth
            ? `${formatTime30m(pendingSlotForAuth.start_time)} – ${formatTime30m(pendingSlotForAuth.end_time)}`
            : null
        }
        onLoginSuccess={handleLogin}
        onRegisterSuccess={handleRegister}
        onNavigateView={setActiveView}
        onLogout={() => {
          clearSession();
          setUser(null);
          setClientSlots([]);
          setActiveView('PUBLIC_BOOKING');
        }}
      />
    </div>
  );
};

export default App;
