import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { JwtPayloadUser } from '../auth/decorators/current-user.decorator';
import { MailService } from '../mail/mail.service';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { LockSlotDto } from './dto/lock-slot.dto';
import { ManageBarberSlotsDto } from './dto/manage-slots.dto';
export declare const SLOT_DURATION_MS: number;
export declare const LOCK_DURATION_MS: number;
export declare class AppointmentsService {
    private readonly prisma;
    private readonly paymentsService;
    private readonly mailService;
    private readonly jwtService;
    private readonly logger;
    constructor(prisma: PrismaService, paymentsService: PaymentsService, mailService: MailService, jwtService: JwtService);
    manageBarberSlots(userId: string, dto: ManageBarberSlotsDto): Promise<{
        action: string;
        slot: {
            id: string;
            created_at: Date;
            updated_at: Date;
            status: import(".prisma/client").$Enums.SlotStatus;
            barber_id: string;
            client_id: string | null;
            start_time: Date;
            end_time: Date;
            locked_until: Date | null;
            deposit_amount: number;
            mp_payment_id: string | null;
            mp_preference_id: string | null;
        };
        days_processed?: undefined;
        generated_count?: undefined;
        total_blocks_in_range?: undefined;
        slots?: undefined;
    } | {
        action: string;
        days_processed: number;
        generated_count: number;
        total_blocks_in_range: number;
        slots: {
            id: string;
            created_at: Date;
            updated_at: Date;
            status: import(".prisma/client").$Enums.SlotStatus;
            barber_id: string;
            client_id: string | null;
            start_time: Date;
            end_time: Date;
            locked_until: Date | null;
            deposit_amount: number;
            mp_payment_id: string | null;
            mp_preference_id: string | null;
        }[];
        slot?: undefined;
    }>;
    getBarberSlots(userId: string): Promise<{
        barber: {
            id: string;
            slug: string;
            shop_name: string;
            address: string | null;
            reminder_addon_active: boolean;
        };
        weekly_goal: import("./weekly-bonus.util").WeeklyGoalMetrics;
        slots: ({
            client: {
                dni: string;
                name: string;
                phone: string;
                email: string | null;
                id: string;
            } | null;
        } & {
            id: string;
            created_at: Date;
            updated_at: Date;
            status: import(".prisma/client").$Enums.SlotStatus;
            barber_id: string;
            client_id: string | null;
            start_time: Date;
            end_time: Date;
            locked_until: Date | null;
            deposit_amount: number;
            mp_payment_id: string | null;
            mp_preference_id: string | null;
        })[];
    }>;
    getClientSlots(userId: string): Promise<{
        slots: ({
            reminders: {
                id: string;
                status: import(".prisma/client").$Enums.ReminderStatus;
                scheduled_for: Date;
                generated_message: string | null;
            }[];
            barber: {
                user: {
                    name: string;
                    phone: string;
                };
                shop_name: string;
                slug: string;
                address: string | null;
                id: string;
                reminder_addon_active: boolean;
            };
        } & {
            id: string;
            created_at: Date;
            updated_at: Date;
            status: import(".prisma/client").$Enums.SlotStatus;
            barber_id: string;
            client_id: string | null;
            start_time: Date;
            end_time: Date;
            locked_until: Date | null;
            deposit_amount: number;
            mp_payment_id: string | null;
            mp_preference_id: string | null;
        })[];
    }>;
    generateSlotIcsFile(slotId: string): Promise<{
        filename: string;
        icsContent: string;
    }>;
    cancelAppointmentNoRefund(slotId: string, user: JwtPayloadUser): Promise<{
        cancelled: boolean;
        slot_id: string;
        status: import(".prisma/client").$Enums.SlotStatus;
        refund_executed: boolean;
        deposit_retained: boolean;
        deposit_amount_retained_ars: number;
        policy: string;
    }>;
    releaseSingleLock(slotId: string): Promise<{
        released: boolean;
        slot_id: string;
    }>;
    getPublicAvailableSlotsBySlug(slug: string): Promise<{
        barber: {
            id: string;
            slug: string;
            shop_name: string;
            address: string | null;
            barber_name: string;
            barber_phone: string;
        };
        deposit_amount_ars: number;
        slot_duration_minutes: number;
        dates: Record<string, {
            id: string;
            status: import(".prisma/client").$Enums.SlotStatus;
            start_time: Date;
            end_time: Date;
            deposit_amount: number;
        }[]>;
    }>;
    lockSlot(slotId: string, authenticatedUserId?: string, dto?: LockSlotDto): Promise<{
        access_token?: string | undefined;
        user?: {
            id: string;
            dni: string;
            name: string;
            phone: string;
            role: Role;
        } | undefined;
        slot: {
            id: string;
            barber_id: string;
            client_id: string | null;
            start_time: Date;
            end_time: Date;
            status: import(".prisma/client").$Enums.SlotStatus;
            locked_until: Date | null;
            deposit_amount: number;
            mp_preference_id: string | null;
        };
        payment: import("../payments/payments.service").PreferenceResult;
    }>;
    releaseExpiredLocks(): Promise<number>;
    private resolveClientForLock;
    private resolveTargetDates;
    private parseDateTime;
    private assertAlignedTo30Min;
}
