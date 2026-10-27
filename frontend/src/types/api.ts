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
  reminder_enqueued?: boolean;
  reminder_id?: string | null;
  reminder_message?: string | null;
  reminder_scheduled_for?: string | null;
  email_notified?: boolean;
  email_mode?: 'SMTP' | 'CONSOLE_FALLBACK';
  reason?: string;
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
  reminders?: Array<{
    id: string;
    status: string;
    scheduled_for: string;
    generated_message?: string | null;
  }>;
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
