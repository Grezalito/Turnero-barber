import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  maskPhone,
  sanitizeControlChars,
} from '../security/pii-sanitizer.util';
import {
  IReminderProvider,
  ReminderEnqueueResult,
  ReminderSchedulePayload,
} from './reminder.interface';

@Injectable()
export class MockDeepSeekReminderService implements IReminderProvider {
  private readonly logger = new Logger(MockDeepSeekReminderService.name);

  constructor(private readonly prisma: PrismaService) {}

  async scheduleForConfirmedSlot(
    payload: ReminderSchedulePayload,
  ): Promise<ReminderEnqueueResult | null> {
    if (!payload.reminderAddonActive) {
      return null;
    }

    const scheduledFor = new Date(
      payload.startTime.getTime() - 2 * 60 * 60 * 1000,
    );
    const hh = String(payload.startTime.getUTCHours()).padStart(2, '0');
    const mm = String(payload.startTime.getUTCMinutes()).padStart(2, '0');
    const dateStr = payload.startTime.toISOString().slice(0, 10);
    const safeClientName = sanitizeControlChars(payload.clientName);
    const safeShopName = sanitizeControlChars(payload.shopName);
    const mockMessage = `[MOCK DeepSeek IA] Hola ${safeClientName}, te recordamos tu turno de 30 min en ${safeShopName} el ${dateStr} a las ${hh}:${mm} hs. Seña de $2.000 ARS acreditada.`;

    const createdReminder = await this.prisma.reminderQueue.create({
      data: {
        slot_id: payload.slotId,
        barber_id: payload.barberId,
        client_phone: sanitizeControlChars(payload.clientPhone) || '+5491100000000',
        scheduled_for: scheduledFor,
        generated_message: mockMessage,
      },
    });

    this.logger.log(
      `[DeepSeek Stub] Turno CONFIRMED (${payload.slotId}) -> Recordatorio encolado para ${maskPhone(createdReminder.client_phone)} (barber_id=${payload.barberId})`,
    );

    return createdReminder;
  }
}
