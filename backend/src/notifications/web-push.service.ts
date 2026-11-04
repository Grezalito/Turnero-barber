import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

export interface PushPayload {
  title: string;
  body: string;
  /** Ruta a abrir al tocar la notificación. */
  url?: string;
  /** Agrupa notificaciones del mismo turno: una nueva reemplaza a la anterior. */
  tag?: string;
}

/**
 * Envío Web Push (VAPID). Si no hay claves VAPID configuradas, el canal queda deshabilitado
 * sin romper el resto del flujo (los recordatorios siguen saliendo por email).
 */
@Injectable()
export class WebPushService {
  private readonly logger = new Logger(WebPushService.name);
  private readonly publicKey: string | null = null;
  readonly enabled: boolean = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const publicKey = this.configService.get<string>('VAPID_PUBLIC_KEY')?.trim();
    const privateKey = this.configService.get<string>('VAPID_PRIVATE_KEY')?.trim();
    const subject =
      this.configService.get<string>('VAPID_SUBJECT')?.trim() || 'mailto:soporte@turnazo.app';

    if (publicKey && privateKey) {
      try {
        webpush.setVapidDetails(subject, publicKey, privateKey);
        this.publicKey = publicKey;
        this.enabled = true;
      } catch (err) {
        this.logger.error(`Claves VAPID inválidas, Web Push deshabilitado: ${(err as Error).message}`);
      }
    } else {
      this.logger.warn('VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY no configuradas: Web Push deshabilitado.');
    }
  }

  getPublicKey(): string | null {
    return this.publicKey;
  }

  /**
   * Envía la notificación a todos los dispositivos suscriptos al turno.
   * Las suscripciones expiradas (404/410) se eliminan. Devuelve cuántas entregas fueron aceptadas.
   */
  async sendToSlot(slotId: string, payload: PushPayload): Promise<number> {
    if (!this.enabled) return 0;

    const subscriptions = await this.prisma.pushSubscription.findMany({ where: { slot_id: slotId } });
    let delivered = 0;

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60, urgency: 'high' },
        );
        delivered++;
        await this.prisma.pushSubscription.update({
          where: { id: sub.id },
          data: { last_sent_at: new Date() },
        });
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await this.prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
          this.logger.log(`Suscripción push expirada eliminada (slot=${slotId})`);
        } else {
          this.logger.warn(`Fallo Web Push (slot=${slotId}, status=${statusCode ?? 'n/a'}): ${(err as Error).message}`);
        }
      }
    }

    return delivered;
  }
}
