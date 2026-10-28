import {
  AdminBarberItem,
  AppointmentSlot,
  ClientAppointmentSlot,
  LockSlotResponse,
  PublicBarberScheduleResponse,
  User,
  WebhookSimulationResponse,
  WeeklyGoalMetrics,
  WeeklySettlementItem,
} from '../types/api';
import { buildLocalIcsContent } from '../utils/postBookingAndGamification';

export const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:3000';

const TOKEN_STORAGE_KEY = 'turnero_barber_jwt';
const USER_STORAGE_KEY = 'turnero_barber_user';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function getStoredUser(): User | null {
  const raw = localStorage.getItem(USER_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function getSlugFromAuthContext(): string | null {
  const storedUser = getStoredUser();
  if (storedUser?.barber_profile?.slug) {
    return storedUser.barber_profile.slug;
  }
  const token = getStoredToken();
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(atob(parts[1])) as { slug?: string };
      if (payload.slug) return payload.slug;
    }
  } catch {
    // ignore invalid jwt format
  }
  return null;
}

export function saveSession(token: string, user: User) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let errorMessage = `Error HTTP ${res.status}`;
    try {
      const errBody = await res.json();
      errorMessage = Array.isArray(errBody.message)
        ? errBody.message.join(', ')
        : errBody.message || errorMessage;
    } catch {
      // ignore json parse error
    }
    throw new Error(errorMessage);
  }

  return res.json() as Promise<T>;
}

export const api = {
  async login(dni: string, password: string) {
    const data = await request<{ access_token: string; user: User }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ dni, password }),
      },
    );
    saveSession(data.access_token, data.user);
    return data;
  },

  async registerClient(payload: {
    dni: string;
    password: string;
    name: string;
    phone: string;
    email?: string;
  }) {
    const data = await request<{ access_token: string; user: User }>(
      '/auth/register',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
    saveSession(data.access_token, data.user);
    return data;
  },

  async getPublicSchedule(slug: string): Promise<PublicBarberScheduleResponse> {
    return request<PublicBarberScheduleResponse>(
      `/appointments/public/${encodeURIComponent(slug)}`,
    );
  },

  getIcsDownloadUrl(slotId: string): string {
    return `${API_BASE_URL}/appointments/${encodeURIComponent(slotId)}/ics`;
  },

  async downloadSlotIcs(params: {
    slotId: string;
    shopName: string;
    address?: string | null;
    barberName?: string;
    startTimeIso: string;
    endTimeIso: string;
    mpPaymentId: string;
  }) {
    let icsText: string;
    try {
      const res = await fetch(
        `${API_BASE_URL}/appointments/${encodeURIComponent(params.slotId)}/ics`,
      );
      if (!res.ok) throw new Error('Fallback local ICS');
      icsText = await res.text();
    } catch {
      icsText = buildLocalIcsContent(params);
    }

    const blob = new Blob([icsText], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `turno-${params.slotId.slice(0, 8)}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  async cancelAppointmentNoRefund(slotId: string) {
    return request<{
      cancelled: boolean;
      slot_id: string;
      status: string;
      refund_executed: false;
      deposit_retained: true;
      deposit_amount_retained_ars: number;
      policy: string;
    }>(`/appointments/${encodeURIComponent(slotId)}/cancel`, {
      method: 'POST',
    });
  },

  async lockSlot(
    slotId: string,
    inlineCredentials?: {
      dni: string;
      password: string;
      name?: string;
      phone?: string;
    },
  ): Promise<LockSlotResponse> {
    const res = await request<LockSlotResponse>(
      `/appointments/${encodeURIComponent(slotId)}/lock`,
      {
        method: 'POST',
        body: JSON.stringify(inlineCredentials || {}),
      },
    );
    if (res.access_token && res.user) {
      saveSession(res.access_token, res.user);
    }
    return res;
  },

  async createPaymentPreference(payload: {
    slotId: string;
    clientDni: string;
    clientName: string;
    clientPhone: string;
  }): Promise<{
    init_point: string;
    sandbox_init_point?: string;
    preference_id?: string;
    slot_id?: string;
  }> {
    return request<{
      init_point: string;
      sandbox_init_point?: string;
      preference_id?: string;
      slot_id?: string;
    }>('/payments/create-preference', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getBarberMe(): Promise<{
    user: User | null;
    barber: {
      id: string;
      slug: string;
      shop_name: string;
      address?: string | null;
      reminder_addon_active: boolean;
    } | null;
    slug: string | null;
  }> {
    return request('/barbers/me');
  },

  async simulateMercadoPagoWebhook(
    slotId: string,
    status: 'approved' | 'rejected' = 'approved',
  ): Promise<WebhookSimulationResponse> {
    const uniqueSuffix = Math.random().toString(36).slice(2, 7).toUpperCase();
    const mockPaymentId = `mp_pay_${Date.now()}_${uniqueSuffix}`;
    return request<WebhookSimulationResponse>('/payments/webhook', {
      method: 'POST',
      body: JSON.stringify({
        type: 'payment',
        payment_id: mockPaymentId,
        external_reference: slotId,
        status,
      }),
    });
  },

  async releaseSlotLock(slotId: string) {
    return request<{ released: boolean; slot_id: string }>(
      `/appointments/${encodeURIComponent(slotId)}/release-lock`,
      {
        method: 'POST',
      },
    );
  },

  async getClientSlots(): Promise<{ slots: ClientAppointmentSlot[] }> {
    return request<{ slots: ClientAppointmentSlot[] }>(
      '/appointments/client/my-slots',
    );
  },

  async getBarberSlots() {
    return request<{
      barber: {
        id: string;
        slug: string;
        shop_name: string;
        address?: string | null;
        reminder_addon_active: boolean;
      };
      weekly_goal?: WeeklyGoalMetrics;
      slots: AppointmentSlot[];
    }>('/appointments/barber/slots');
  },

  async manageBarberSlots(payload: {
    date?: string;
    end_date?: string;
    start_time?: string;
    end_time?: string;
    break_start_time?: string;
    break_end_time?: string;
    slot_start_time?: string;
  }) {
    return request<{
      action: string;
      days_processed?: number;
      generated_count?: number;
      total_blocks_in_range?: number;
      slots?: AppointmentSlot[];
    }>('/appointments/barber/slots', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async listAdminBarbers(): Promise<AdminBarberItem[]> {
    return request<AdminBarberItem[]>('/admin/barbers');
  },

  async createAdminBarber(payload: {
    dni: string;
    password: string;
    name: string;
    phone: string;
    slug: string;
    shop_name: string;
    address?: string;
  }) {
    return request('/admin/barbers', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async toggleBarberReminder(barberId: string, active: boolean) {
    return request(`/admin/barbers/${encodeURIComponent(barberId)}/toggle-reminder`, {
      method: 'PATCH',
      body: JSON.stringify({ active }),
    });
  },

  async listWeeklySettlements(): Promise<{
    current_week_start: string;
    current_week_end: string;
    settlements: WeeklySettlementItem[];
  }> {
    return request<{
      current_week_start: string;
      current_week_end: string;
      settlements: WeeklySettlementItem[];
    }>('/admin/settlements');
  },

  async markSettlementTransferred(
    barberId: string,
    weekStartIso: string,
    transferred = true,
  ) {
    return request<{
      settlement_id: string;
      barber_id: string;
      week_start: string;
      transferred: boolean;
      transferred_at: string | null;
    }>(`/admin/settlements/${encodeURIComponent(barberId)}/transfer`, {
      method: 'PATCH',
      body: JSON.stringify({
        week_start: weekStartIso,
        transferred,
      }),
    });
  },
};
