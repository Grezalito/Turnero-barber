import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SlotStatus } from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { computeReminderWindows, ReminderWindow } from './reminder-windows.util';
import { formatSlotTimeAr } from './slot-time.util';
import { BookingLinkService } from './booking-link.service';
import { WebPushService } from './web-push.service';

export interface ReminderRunStats {
  candidates: number;
  sent: number;
  skippedAlreadyClaimed: number;
  failed: number;
}

/**
 * Motor de recordatorios 24 hs / 2 hs.
 *
 * Garantías:
 *  - Solo turnos CONFIRMED (nunca cancelados, pendientes ni disponibles).
 *  - Aplica a TODOS los turnos confirmados (MVP: sin depender del add-on `reminder_addon_active`).
 *  - Idempotencia: cada recordatorio se RECLAMA con un update condicional
 *    (`WHERE id = ? AND status = CONFIRMED AND reminder_X_sent_at IS NULL`) ANTES de enviarse.
 *    Dos instancias o un reinicio nunca envían el mismo recordatorio dos veces.
 *  - Si TODOS los canales fallan, el reclamo se revierte para reintentar en la próxima corrida
 *    (la ventana dura 30-60 min y el cron corre cada 10 min).
 */
@Injectable()
export class ReminderSchedulerService {
  private readonly logger = new Logger(ReminderSchedulerService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly webPush: WebPushService,
    private readonly bookingLinks: BookingLinkService,
  ) {}

  @Cron('*/10 * * * *', { name: 'appointment-reminders', timeZone: 'UTC' })
  async handleCron(): Promise<void> {
    if (this.running) return; // evita solapamiento si una corrida tarda más de 10 min
    this.running = true;
    try {
      const stats = await this.runOnce(new Date());
      if (stats.candidates > 0) {
        this.logger.log(
          `Recordatorios: candidatos=${stats.candidates} enviados=${stats.sent} ya-reclamados=${stats.skippedAlreadyClaimed} fallidos=${stats.failed}`,
        );
      }
    } catch (err) {
      this.logger.error(`Corrida de recordatorios abortada: ${(err as Error).message}`, (err as Error).stack);
    } finally {
      this.running = false;
    }
  }

  async runOnce(now: Date): Promise<ReminderRunStats> {
    const stats: ReminderRunStats = { candidates: 0, sent: 0, skippedAlreadyClaimed: 0, failed: 0 };
    for (const window of computeReminderWindows(now)) {
      await this.processWindow(window, now, stats);
    }
    return stats;
  }

  private async processWindow(window: ReminderWindow, now: Date, stats: ReminderRunStats) {
    const candidates = await this.prisma.appointmentSlot.findMany({
      where: {
        status: SlotStatus.CONFIRMED,
        start_time: { gte: window.fromNominal, lte: window.toNominal },
        [window.sentAtField]: null,
      },
      include: { client: true, barber: { include: { user: true } } },
      orderBy: { start_time: 'asc' },
      take: 500,
    });

    for (const slot of candidates) {
      stats.candidates++;

      const claim = await this.prisma.appointmentSlot.updateMany({
        where: { id: slot.id, status: SlotStatus.CONFIRMED, [window.sentAtField]: null },
        data: { [window.sentAtField]: now },
      });
      if (claim.count === 0) {
        stats.skippedAlreadyClaimed++;
        continue;
      }

      const delivered = await this.deliver(window, slot).catch((err) => {
        this.logger.warn(`Fallo enviando recordatorio ${window.kind} slot=${slot.id}: ${(err as Error).message}`);
        return 0;
      });

      if (delivered > 0) {
        stats.sent++;
      } else {
        stats.failed++;
        // Ningún canal entregó: liberar el reclamo para reintentar dentro de la ventana.
        await this.prisma.appointmentSlot.updateMany({
          where: { id: slot.id, [window.sentAtField]: now },
          data: { [window.sentAtField]: null },
        });
      }
    }
  }

  /** Devuelve la cantidad de canales que aceptaron el envío. */
  private async deliver(window: ReminderWindow, slot: any): Promise<number> {
    const time = formatSlotTimeAr(slot.start_time);
    const shop = slot.barber.shop_name;
    const title = window.kind === '24h' ? `Mañana tenés turno en ${shop}` : `Tu turno en ${shop} es en 2 horas`;
    const body =
      window.kind === '24h'
        ? `Te esperamos mañana a las ${time} hs con ${slot.barber.user.name}.`
        : `Hoy a las ${time} hs con ${slot.barber.user.name}. ¡Te esperamos!`;

    let channels = 0;

    const pushDelivered = await this.webPush.sendToSlot(slot.id, {
      title,
      body,
      url: this.bookingLinks.path(slot),
      tag: `turno-${slot.id}`,
    });
    if (pushDelivered > 0) channels++;

    if (slot.client?.email) {
      const mail = await this.mailService.sendAppointmentReminderEmail({
        to: slot.client.email,
        clientName: slot.client.name,
        shopName: shop,
        barberName: slot.barber.user.name,
        address: slot.barber.address,
        startTime: slot.start_time,
        endTime: slot.end_time,
        kind: window.kind,
        bookingUrl: this.bookingLinks.url(slot),
      });
      if (mail.sent) channels++;
    }

    return channels;
  }
}
