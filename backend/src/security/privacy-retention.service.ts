import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { SlotStatus } from '@prisma/client';
import { instantToNominal } from '../notifications/slot-time.util';
import { PrismaService } from '../prisma/prisma.service';

export const DEFAULT_PII_RETENTION_DAYS = 30;

/**
 * Servicio Automatizado de Retención, Minimización de PII y Disponibilidad de Agenda
 * Controles asociados:
 * - ISO/IEC 27701:2019 (Cláusula 7.4.7 Retención temporal, 7.4.8 Disposición/Anonimización de PII)
 * - ISO/IEC 27001:2022 (Anexo A.8.10 Eliminación de información, A.8.11 Enmascaramiento de datos)
 * - SOC 2 (A1.2 Disponibilidad de recursos bloqueados, P4.2 Retención y eliminación de datos personales)
 */
@Injectable()
export class PrivacyRetentionService {
  private readonly logger = new Logger(PrivacyRetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Libera automáticamente cada 2 minutos cualquier bloqueo temporal de turno (PENDING_PAYMENT)
   * cuyo TTL de 10 minutos haya expirado, garantizando disponibilidad continua (SOC 2 A1.2).
   */
  @Cron('*/2 * * * *')
  async releaseExpiredLocksScheduled(): Promise<number> {
    try {
      const now = new Date();
      const result = await this.prisma.appointmentSlot.updateMany({
        where: {
          status: SlotStatus.PENDING_PAYMENT,
          locked_until: {
            lte: now,
          },
        },
        data: {
          status: SlotStatus.AVAILABLE,
          client_id: null,
          locked_until: null,
          mp_preference_id: null,
          lock_token_hash: null,
        },
      });

      if (result.count > 0) {
        this.logger.log(
          `[SECURITY_AUDIT] event=EXPIRED_LOCKS_RELEASED count=${result.count}`,
        );
      }
      return result.count;
    } catch (err) {
      this.logger.warn(
        `No se pudo ejecutar liberación programada de bloqueos vencidos: ${(err as Error).message}`,
      );
      return 0;
    }
  }

  /**
   * Ejecuta diariamente (04:00 UTC / 01:00 ART) la política de retención y minimización de PII (ISO 27701 7.4.7):
   * - Elimina suscripciones Web Push (identificador de dispositivo) de turnos ya pasados o cancelados:
   *   ya no hay recordatorios que enviarles.
   * - Limpia identificadores de preferencia transitoria en turnos CANCELLED antiguos.
   */
  @Cron('0 4 * * *')
  async enforcePiiRetentionPolicy(): Promise<{
    purgedPushSubscriptions: number;
    scrubbedCancelledSlots: number;
    retentionDays: number;
  }> {
    const rawDays = Number(
      this.configService.get<string>('PII_RETENTION_DAYS') ||
        DEFAULT_PII_RETENTION_DAYS,
    );
    const retentionDays =
      Number.isFinite(rawDays) && rawDays >= 7
        ? rawDays
        : DEFAULT_PII_RETENTION_DAYS;

    const cutoffDate = new Date(
      Date.now() - retentionDays * 24 * 60 * 60 * 1000,
    );

    try {
      const pastNominal = new Date(instantToNominal(new Date()).getTime() - 24 * 60 * 60 * 1000);
      const pushPurge = await this.prisma.pushSubscription.deleteMany({
        where: {
          OR: [
            { slot: { start_time: { lt: pastNominal } } },
            { slot: { status: { not: SlotStatus.CONFIRMED } }, created_at: { lt: pastNominal } },
          ],
        },
      });

      const cancelledSlotsScrub = await this.prisma.appointmentSlot.updateMany({
        where: {
          status: SlotStatus.CANCELLED,
          updated_at: {
            lt: cutoffDate,
          },
          OR: [{ client_id: { not: null } }, { mp_preference_id: { not: null } }],
        },
        data: {
          client_id: null,
          mp_preference_id: null,
          locked_until: null,
          lock_token_hash: null,
        },
      });

      if (pushPurge.count > 0 || cancelledSlotsScrub.count > 0) {
        this.logger.log(
          `[SECURITY_AUDIT] event=ISO27701_PII_RETENTION_ENFORCED retentionDays=${retentionDays} purgedPushSubscriptions=${pushPurge.count} scrubbedCancelledSlots=${cancelledSlotsScrub.count}`,
        );
      }

      return {
        purgedPushSubscriptions: pushPurge.count,
        scrubbedCancelledSlots: cancelledSlotsScrub.count,
        retentionDays,
      };
    } catch (err) {
      this.logger.warn(
        `No se pudo aplicar tarea programada de retención ISO 27701: ${(err as Error).message}`,
      );
      return {
        purgedPushSubscriptions: 0,
        scrubbedCancelledSlots: 0,
        retentionDays,
      };
    }
  }
}
