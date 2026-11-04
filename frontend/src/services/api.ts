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
const LOCK_TOKEN_PREFIX = 'turnero_lock_token:';

/**
 * El lockToken prueba que este navegador es el titular del bloqueo de un turno.
 * Se guarda por slotId en localStorage para sobrevivir el redirect a Mercado Pago y volver.
 */
export function saveLockToken(slotId: string, token?: string | null): void {
  if (!slotId || !token) return;
  try {
    localStorage.setItem(LOCK_TOKEN_PREFIX + slotId, token);
  } catch {
    // storage no disponible (modo privado): el bloqueo vencerá solo
  }
}

export function getLockToken(slotId?: string | null): string | undefined {
  if (!slotId) return undefined;
  try {
    return localStorage.getItem(LOCK_TOKEN_PREFIX + slotId) || undefined;
  } catch {
    return undefined;
  }
}

export function clearLockToken(slotId?: string | null): void {
  if (!slotId) return;
  try {
    localStorage.removeItem(LOCK_TOKEN_PREFIX + slotId);
  } catch {
    // ignore
  }
}
const USER_STORAGE_KEY = 'turnero_barber_user';

export function getStoredToken(): string | null {
  const raw =
    localStorage.getItem(TOKEN_STORAGE_KEY) ||
    sessionStorage.getItem(TOKEN_STORAGE_KEY);
  if (!raw) return null;
  const parts = raw.split('.');
  if (raw.startsWith('demo_jwt_') || parts.length !== 3) {
    clearSession();
    return null;
  }
  try {
    const payload = JSON.parse(atob(parts[1])) as { exp?: number };
    if (typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()) {
      clearSession();
      return null;
    }
  } catch {
    clearSession();
    return null;
  }
  return raw;
}

export function getStoredUser(): User | null {
  const token = getStoredToken();
  if (!token) return null;
  const raw =
    localStorage.getItem(USER_STORAGE_KEY) ||
    sessionStorage.getItem(USER_STORAGE_KEY);
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
  sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  sessionStorage.removeItem(USER_STORAGE_KEY);
}

async function request<T>(
  path: string,
  options: RequestInit & { skipAuth?: boolean; tokenOverride?: string | null } = {},
): Promise<T> {
  const { skipAuth, tokenOverride, ...fetchOptions } = options;
  const token = skipAuth ? null : tokenOverride || getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string>),
  };

  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...fetchOptions,
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
        skipAuth: true,
        body: JSON.stringify({ dni, password }),
      },
    );
    saveSession(data.access_token, data.user);
    return data;
  },

  async getAuthMe(tokenOverride?: string | null): Promise<User> {
    return request<User>('/auth/me', {
      method: 'GET',
      tokenOverride,
    });
  },

  async getPublicSchedule(slug: string): Promise<PublicBarberScheduleResponse> {
    return request<PublicBarberScheduleResponse>(
      `/appointments/public/${encodeURIComponent(slug)}`,
      {
        skipAuth: true,
      },
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
        skipAuth: true,
        body: JSON.stringify(inlineCredentials || {}),
      },
    );
    saveLockToken(res.slot?.id || slotId, res.lock_token);
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
    lock_token?: string;
  }> {
    const res = await request<{
      init_point: string;
      sandbox_init_point?: string;
      preference_id?: string;
      slot_id?: string;
      lock_token?: string;
    }>('/payments/create-preference', {
      method: 'POST',
      skipAuth: true,
      body: JSON.stringify(payload),
    });
    saveLockToken(res.slot_id || payload.slotId, res.lock_token);
    return res;
  },

  async getBarberMe(tokenOverride?: string | null): Promise<{
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
    return request('/barbers/me', { tokenOverride });
  },

  async simulateMercadoPagoWebhook(
    slotId: string,
    status: 'approved' | 'rejected' = 'approved',
  ): Promise<WebhookSimulationResponse> {
    const uniqueSuffix = Math.random().toString(36).slice(2, 7).toUpperCase();
    const mockPaymentId = `mp_pay_${Date.now()}_${uniqueSuffix}`;
    return request<WebhookSimulationResponse>('/payments/simulate-webhook', {
      method: 'POST',
      skipAuth: true,
      body: JSON.stringify({
        type: 'payment',
        payment_id: mockPaymentId,
        external_reference: slotId,
        status,
      }),
    });
  },

  async confirmPaymentReturn(payload: {
    slotId?: string;
    external_reference?: string;
    paymentId?: string;
    payment_id?: string;
    collection_id?: string;
    status?: string;
    collection_status?: string;
    preference_id?: string;
  }): Promise<WebhookSimulationResponse & { released?: boolean; barber_slug?: string }> {
    const slotId = payload.slotId || payload.external_reference;
    const lockToken = getLockToken(slotId);
    const res = await request<WebhookSimulationResponse & { released?: boolean; barber_slug?: string }>(
      '/payments/confirm-return',
      {
        method: 'POST',
        skipAuth: true,
        body: JSON.stringify({ ...payload, ...(lockToken ? { lock_token: lockToken } : {}) }),
      },
    );
    // Tras confirmar se conserva el token: es la credencial del turno para activar recordatorios push.
    if (res.released) {
      clearLockToken(slotId);
    }
    return res;
  },

  async releaseSlotLock(slotId: string) {
    const lockToken = getLockToken(slotId);
    if (!lockToken) {
      // Sin token no se puede liberar: el bloqueo vence solo a los 10 minutos.
      return { released: false, slot_id: slotId };
    }
    const res = await request<{ released: boolean; slot_id: string }>(
      `/appointments/${encodeURIComponent(slotId)}/release-lock`,
      {
        method: 'POST',
        skipAuth: true,
        body: JSON.stringify({ lock_token: lockToken }),
      },
    );
    clearLockToken(slotId);
    return res;
  },

  async getVapidPublicKey(): Promise<{ enabled: boolean; public_key: string | null }> {
    return request<{ enabled: boolean; public_key: string | null }>(
      '/notifications/vapid-public-key',
      { skipAuth: true },
    );
  },

  async subscribePush(payload: {
    slotId: string;
    lockToken: string;
    subscription: PushSubscriptionJSON;
  }): Promise<{ subscribed: boolean; slot_id: string }> {
    const { endpoint, keys, expirationTime } = payload.subscription;
    return request<{ subscribed: boolean; slot_id: string }>('/notifications/subscribe', {
      method: 'POST',
      skipAuth: true,
      body: JSON.stringify({
        slot_id: payload.slotId,
        lock_token: payload.lockToken,
        subscription: { endpoint, expirationTime: expirationTime ?? null, keys },
      }),
    });
  },

  async getClientSlots(): Promise<{ slots: ClientAppointmentSlot[] }> {
    return request<{ slots: ClientAppointmentSlot[] }>(
      '/appointments/client/my-slots',
    );
  },

  async getBarberSlots(tokenOverride?: string | null) {
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
    }>('/appointments/barber/slots', { tokenOverride });
  },

  async manageBarberSlots(
    payload: {
      date?: string;
      end_date?: string;
      start_time?: string;
      end_time?: string;
      break_start_time?: string;
      break_end_time?: string;
      slot_start_time?: string;
    },
    tokenOverride?: string | null,
  ) {
    return request<{
      action: string;
      days_processed?: number;
      generated_count?: number;
      total_blocks_in_range?: number;
      slots?: AppointmentSlot[];
    }>('/appointments/barber/slots', {
      method: 'POST',
      tokenOverride,
      body: JSON.stringify(payload),
    });
  },

  async listAdminBarbers(tokenOverride?: string | null): Promise<AdminBarberItem[]> {
    const token = tokenOverride || getStoredToken();
    return request<AdminBarberItem[]>('/admin/barbers', {
      tokenOverride: token,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },

  async createAdminBarber(
    payload: {
      dni: string;
      password: string;
      name: string;
      phone: string;
      shopName: string;
      shop_name?: string;
      slug?: string;
      address?: string;
    },
    tokenOverride?: string | null,
  ) {
    const token = tokenOverride || getStoredToken();
    return request<AdminBarberItem>('/admin/barbers', {
      method: 'POST',
      tokenOverride: token,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: JSON.stringify({
        name: payload.name,
        dni: payload.dni,
        phone: payload.phone,
        password: payload.password,
        shopName: payload.shopName,
        shop_name: payload.shop_name || payload.shopName,
        ...(payload.slug ? { slug: payload.slug } : {}),
        ...(payload.address ? { address: payload.address } : {}),
      }),
    });
  },

  async toggleBarberReminder(
    barberId: string,
    active: boolean,
    tokenOverride?: string | null,
  ) {
    const token = tokenOverride || getStoredToken();
    return request(
      `/admin/barbers/${encodeURIComponent(barberId)}/toggle-reminder`,
      {
        method: 'PATCH',
        tokenOverride: token,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: JSON.stringify({ active }),
      },
    );
  },

  async listWeeklySettlements(tokenOverride?: string | null): Promise<{
    current_week_start: string;
    current_week_end: string;
    settlements: WeeklySettlementItem[];
  }> {
    const token = tokenOverride || getStoredToken();
    return request<{
      current_week_start: string;
      current_week_end: string;
      settlements: WeeklySettlementItem[];
    }>('/admin/settlements', {
      tokenOverride: token,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },

  async markSettlementTransferred(
    barberId: string,
    weekStartIso: string,
    transferred = true,
    tokenOverride?: string | null,
  ) {
    const token = tokenOverride || getStoredToken();
    return request<{
      settlement_id: string;
      barber_id: string;
      week_start: string;
      transferred: boolean;
      transferred_at: string | null;
    }>(`/admin/settlements/${encodeURIComponent(barberId)}/transfer`, {
      method: 'PATCH',
      tokenOverride: token,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: JSON.stringify({
        week_start: weekStartIso,
        transferred,
      }),
    });
  },
};
