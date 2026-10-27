import { AdminService } from './admin.service';
import { CreateBarberDto } from './dto/create-barber.dto';
import { ToggleReminderDto } from './dto/toggle-reminder.dto';
export declare class AdminController {
    private readonly adminService;
    constructor(adminService: AdminService);
    createBarber(dto: CreateBarberDto): Promise<{
        id: string;
        slug: string;
        shop_name: string;
        address: string | null;
        reminder_addon_active: boolean;
        user: {
            id: string;
            dni: string;
            name: string;
            phone: string;
            email: string | null;
            role: import(".prisma/client").$Enums.Role;
        };
    }>;
    toggleReminder(barberId: string, dto?: ToggleReminderDto): Promise<{
        id: string;
        slug: string;
        shop_name: string;
        reminder_addon_active: boolean;
        reminder_config: import("@prisma/client/runtime/library").JsonValue;
        user: {
            dni: string;
            name: string;
            phone: string;
            id: string;
        };
    }>;
    listBarbers(): Promise<{
        id: string;
        slug: string;
        shop_name: string;
        address: string | null;
        reminder_addon_active: boolean;
        reminder_config: import("@prisma/client/runtime/library").JsonValue;
        confirmed_appointments_count: number;
        estimated_platform_revenue_ars: number;
        user: {
            dni: string;
            name: string;
            phone: string;
            id: string;
            created_at: Date;
        };
        created_at: Date;
    }[]>;
    listWeeklySettlements(): Promise<{
        current_week_start: string;
        current_week_end: string;
        settlements: {
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
            bonus_tier: string;
            bonus_tier_label: string;
            amount_to_transfer_ars: number;
            reminder_ia_bonified: boolean;
            transferred: boolean;
            transferred_at: string | null;
        }[];
    }>;
    markWeeklySettlementTransferred(barberId: string, body?: {
        week_start?: string;
        transferred?: boolean;
    }): Promise<{
        settlement_id: string;
        barber_id: string;
        week_start: string;
        week_end: string;
        confirmed_slots_count: number;
        bonus_tier: string;
        amount_to_transfer_ars: number;
        reminder_ia_bonified: boolean;
        transferred: boolean;
        transferred_at: string | null;
    }>;
}
