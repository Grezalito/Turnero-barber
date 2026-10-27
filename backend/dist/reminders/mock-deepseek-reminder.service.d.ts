import { PrismaService } from '../prisma/prisma.service';
import { IReminderProvider, ReminderEnqueueResult, ReminderSchedulePayload } from './reminder.interface';
export declare class MockDeepSeekReminderService implements IReminderProvider {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    scheduleForConfirmedSlot(payload: ReminderSchedulePayload): Promise<ReminderEnqueueResult | null>;
}
