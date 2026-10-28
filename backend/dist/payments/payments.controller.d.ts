import { CreatePreferenceDto } from './dto/create-preference.dto';
import { MercadoPagoWebhookDto } from './dto/mp-webhook.dto';
import { PaymentsService } from './payments.service';
export declare class PaymentsController {
    private readonly paymentsService;
    constructor(paymentsService: PaymentsService);
    createPreference(dto: CreatePreferenceDto): Promise<{
        init_point: string;
        sandbox_init_point: string;
        preference_id: string;
        slot_id: string;
        deposit_amount: number;
    }>;
    handleMercadoPagoWebhook(dto: MercadoPagoWebhookDto, query: Record<string, string | undefined>): Promise<{
        idempotent: boolean;
        status: import(".prisma/client").$Enums.SlotStatus;
        slot_id: string;
        mp_payment_id: string;
        processed?: undefined;
        reason?: undefined;
        deposit_amount?: undefined;
        start_time?: undefined;
        end_time?: undefined;
        barber_phone?: undefined;
        shop_name?: undefined;
        reminder_enqueued?: undefined;
        reminder_id?: undefined;
        reminder_message?: undefined;
        reminder_scheduled_for?: undefined;
        email_notified?: undefined;
        email_mode?: undefined;
    } | {
        processed: boolean;
        status: string;
        reason: string;
        mp_payment_id: string;
        slot_id: string | undefined;
        idempotent?: undefined;
        deposit_amount?: undefined;
        start_time?: undefined;
        end_time?: undefined;
        barber_phone?: undefined;
        shop_name?: undefined;
        reminder_enqueued?: undefined;
        reminder_id?: undefined;
        reminder_message?: undefined;
        reminder_scheduled_for?: undefined;
        email_notified?: undefined;
        email_mode?: undefined;
    } | {
        processed: boolean;
        slot_id: string;
        status: import(".prisma/client").$Enums.SlotStatus;
        mp_payment_id: string | null;
        deposit_amount: number;
        start_time: string;
        end_time: string;
        barber_phone: string;
        shop_name: string;
        reminder_enqueued: boolean;
        reminder_id: string | null;
        reminder_message: string | null;
        reminder_scheduled_for: string | null;
        email_notified: boolean;
        email_mode: "SMTP" | "CONSOLE_FALLBACK";
        idempotent?: undefined;
        reason?: undefined;
    }>;
}
