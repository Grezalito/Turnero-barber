import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from '@nestjs/common';
import { SlotStatus } from '@prisma/client';
import { hashLockToken, isWellFormedLockToken } from '../appointments/lock-token.util';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { PushSubscribeDto } from './dto/push-subscribe.dto';
import { isAllowedPushEndpoint } from './push-endpoint.util';
import { WebPushService } from './web-push.service';

const MAX_DEVICES_PER_SLOT = 5;

@Controller('notifications')
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webPush: WebPushService,
  ) {}

  /** Clave pública VAPID para `pushManager.subscribe` (null si el canal está deshabilitado). */
  @Public()
  @Get('vapid-public-key')
  getVapidPublicKey() {
    return { enabled: this.webPush.enabled, public_key: this.webPush.getPublicKey() };
  }

  /**
   * Persiste la suscripción Web Push de este dispositivo para los recordatorios del turno.
   * Autorización: el lockToken del titular del turno (los clientes invitados no tienen JWT).
   */
  @Public()
  @Post('subscribe')
  @HttpCode(HttpStatus.CREATED)
  async subscribe(@Body() dto: PushSubscribeDto, @Headers('user-agent') userAgent?: string) {
    if (!this.webPush.enabled) {
      throw new BadRequestException('Las notificaciones push no están habilitadas en este servidor');
    }
    if (!isAllowedPushEndpoint(dto.subscription.endpoint)) {
      this.logger.warn('[SECURITY_AUDIT] event=PUSH_ENDPOINT_REJECTED reason=HOST_NOT_ALLOWED');
      throw new BadRequestException('Endpoint de push no reconocido');
    }
    if (!isWellFormedLockToken(dto.lock_token)) {
      throw new ForbiddenException('Token del turno inválido');
    }

    const slot = await this.prisma.appointmentSlot.findFirst({
      where: {
        id: dto.slot_id,
        lock_token_hash: hashLockToken(dto.lock_token),
        status: { in: [SlotStatus.CONFIRMED, SlotStatus.PENDING_PAYMENT] },
      },
      select: { id: true, client_id: true, _count: { select: { push_subscriptions: true } } },
    });
    if (!slot) {
      this.logger.warn(`[SECURITY_AUDIT] event=PUSH_SUBSCRIBE_DENIED slotId=${dto.slot_id}`);
      throw new ForbiddenException('Token del turno inválido');
    }

    const existing = await this.prisma.pushSubscription.findUnique({
      where: { slot_id_endpoint: { slot_id: slot.id, endpoint: dto.subscription.endpoint } },
      select: { id: true },
    });
    if (!existing && slot._count.push_subscriptions >= MAX_DEVICES_PER_SLOT) {
      throw new BadRequestException('Se alcanzó el máximo de dispositivos para este turno');
    }

    await this.prisma.pushSubscription.upsert({
      where: { slot_id_endpoint: { slot_id: slot.id, endpoint: dto.subscription.endpoint } },
      create: {
        slot_id: slot.id,
        client_id: slot.client_id,
        endpoint: dto.subscription.endpoint,
        p256dh: dto.subscription.keys.p256dh,
        auth: dto.subscription.keys.auth,
        user_agent: userAgent?.slice(0, 256) ?? null,
      },
      update: {
        p256dh: dto.subscription.keys.p256dh,
        auth: dto.subscription.keys.auth,
      },
    });

    return { subscribed: true, slot_id: slot.id };
  }
}
