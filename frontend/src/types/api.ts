export type Role = 'SUPERADMIN' | 'BARBER' | 'CLIENT';

export type SlotStatus =
  | 'AVAILABLE'
  | 'PENDING_PAYMENT'
  | 'CONFIRMED'
  | 'CANCELLED';

export interface BarberProfile {
  id: string;
  user_id?: string;
  slug: string;
  shop_name: string;
  address?: string | null;
  reminder_addon_active: boolean;
  reminder_config?: Record<string, unknown> | null;
}

export interface User {
  id: string;
  dni: string;
  name: string;
  phone: string;
  email?: string | null;
  role: Role;
  barber_profile?: BarberProfile | null;
}

export interface AppointmentSlot {
  id: string;
  barber_id?: string;
  client_id?: string | null;
  start_time: string;
  end_time: string;
  status: SlotStatus;
  locked_until?: string | null;
  deposit_amount: number;
  mp_payment_id?: string | null;
  mp_preference_id?: string | null;
  /** Link wa.me al cliente con la confirmación prearmada (lo genera el backend para el barbero). */
  whatsapp_confirmation_url?: string | null;
  client?: {
    id: string;
    dni: string;
    name: string;
    phone: string;
    email?: string | null;
  } | null;
}

export interface PublicBarberScheduleResponse {
  barber: {
    id: string;
    slug: string;
    shop_name: string;
    address?: string | null;
    barber_name: string;
    barber_phone?: string;
  };
  deposit_amount_ars: number;
  slot_duration_minutes: number;
  dates: Record<string, AppointmentSlot[]>;
}

export interface LockSlotResponse {
  slot: AppointmentSlot;
  payment: {
    preference_id: string;
    init_point: string;
    sandbox_init_point: string;
    deposit_amount: number;
    external_reference: string;
    is_sandbox_local?: boolean;
  };
  /** Prueba de titularidad del bloqueo: necesaria para liberarlo. */
  lock_token: string;
  access_token?: string;
  user?: User;
}

export interface WebhookSimulationResponse {
  processed: boolean;
  slot_id: string;
  status: string;
  mp_payment_id: string;
  deposit_amount?: number;
  start_time?: string;
  end_time?: string;
  barber_phone?: string;
  shop_name?: string;
  /** Página pública de la reserva (/reserva/:id?ref=...). */
  booking_url?: string | null;
  email_notified?: boolean;
  email_mode?: 'SMTP' | 'CONSOLE_FALLBACK';
  reason?: string;
  /** Link wa.me al barbero con el detalle del turno (cliente, teléfono, servicio, seña). */
  whatsapp_barber_notify_url?: string | null;
}

export interface WeeklyGoalMetrics {
  week_start: string;
  week_end: string;
  confirmed_count: number;
  current_target: number;
  display_counter: string;
  progress_percentage: number;
  overall_progress_percentage: number;
  tier: 'NONE' | 'TIER_15' | 'TIER_35' | 'TIER_50';
  tier_label: string;
  earned_bonus_ars: number;
  next_bonus_ars: number;
  remaining_for_next_tier: number;
  reminder_ia_bonified: boolean;
}

export interface WeeklySettlementItem {
  id: string;
  barber_id: string;
  shop_name: string;
  slug: string;
  barber_name: string;
  barber_dni: string;
  barber_phone: string;
  week_start: string;
  week_end: string;
  week_label: string;
  is_current_week: boolean;
  confirmed_slots_count: number;
  platform_gross_revenue_ars: number;
  reached_bonus: boolean;
  bonus_tier: 'NONE' | 'TIER_15' | 'TIER_35' | 'TIER_50' | string;
  bonus_tier_label: string;
  amount_to_transfer_ars: number;
  reminder_ia_bonified: boolean;
  transferred: boolean;
  transferred_at: string | null;
}

export interface ClientAppointmentSlot extends AppointmentSlot {
  barber?: {
    id: string;
    slug: string;
    shop_name: string;
    address?: string | null;
    reminder_addon_active: boolean;
    user?: {
      name: string;
      phone: string;
    };
  };
  /** Ruta relativa a la página pública de la reserva. */
  booking_url?: string;
}

export interface AdminBarberItem {
  id: string;
  slug: string;
  shop_name: string;
  address?: string | null;
  reminder_addon_active: boolean;
  reminder_config?: Record<string, unknown> | null;
  confirmed_appointments_count: number;
  estimated_platform_revenue_ars: number;
  user: {
    id: string;
    dni: string;
    name: string;
    phone: string;
    created_at: string;
  };
  created_at: string;
}

/** GET /appointments/:id/summary — página pública de la reserva. */
export interface BookingSummary {
  id: string;
  status: SlotStatus;
  is_past: boolean;
  start_time: string;
  end_time: string;
  date_label: string;
  time_label: string;
  end_time_label: string;
  duration_minutes: number;
  timezone: string;
  deposit_amount: number;
  client_first_name: string;
  shop_name: string;
  barber_name: string;
  barber_slug: string;
  address?: string | null;
  mp_payment_reference: string | null;
  ics_path: string;
  whatsapp_cancel_url: string | null;
  whatsapp_reschedule_url: string | null;
}
