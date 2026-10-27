export declare const REMINDER_PROVIDER = "REMINDER_PROVIDER";
export interface ReminderSchedulePayload {
    slotId: string;
    barberId: string;
    clientPhone: string;
    clientName: string;
    shopName: string;
    startTime: Date;
    reminderAddonActive: boolean;
}
export interface ReminderEnqueueResult {
    id: string;
    slot_id: string;
    barber_id: string;
    client_phone: string;
    scheduled_for: Date;
    status: string;
    generated_message: string | null;
}
export interface IReminderProvider {
    scheduleForConfirmedSlot(payload: ReminderSchedulePayload): Promise<ReminderEnqueueResult | null>;
}
