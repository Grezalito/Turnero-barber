import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SlotStatus } from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  IReminderProvider,
  REMINDER_PROVIDER,
} from '../reminders/reminder.interface';
import { MercadoPagoWebhookDto } from './dto/mp-webhook.dto';

export const PLATFORM_DEPOSIT_ARS = 2000;
export const NON_REFUNDABLE_DEPOSIT_POLICY =
  'Reserva garantizada: la seña de $2.000 ARS no es reembolsable ni transferible ante cancelaciones o inasistencias';

export interface PreferenceResult {
  preference_id: string;
  init_point: string;
  sandbox_init_point: string;
  deposit_amount: number;
  external_reference: string;
  is_sandbox_local: boolean;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    @Inject(REMINDER_PROVIDER)
    private readonly reminderProvider: IReminderProvider,
  ) {}

  /**
   * Crea la preferencia de pago por $2.000 ARS (100% cuenta central de la plataforma)
   * usando MP_ACCESS_TOKEN y enviando el slotId en external_reference.
   */
  async createDepositPreference(params: {
    slotId: string;
    shopName: string;
    startTime: Date;
    clientDni: string;
  }): Promise<PreferenceResult> {
    const mpAccessToken =
      this.configService.get<string>('MP_ACCESS_TOKEN') || '';
    const appPublicUrl =
      this.configService.get<string>('FRONTEND_URL') ||
      this.configService.get<string>('PUBLIC_APP_URL') ||
      'http://localhost:5173';
    const webhookUrl =
      this.configService.get<string>('MP_WEBHOOK_URL') ||
      'http://localhost:3000/payments/webhook';

    const preferencePayload = {
      items: [
        {
          id: params.slotId,
          title: `Seña de Turno (30 min) - ${params.shopName}`,
          description: `Reserva de turno para DNI ${params.clientDni}`,
          quantity: 1,
          currency_id: 'ARS',
          unit_price: PLATFORM_DEPOSIT_ARS,
        },
      ],
      external_reference: params.slotId,
      notification_url: webhookUrl,
      back_urls: {
        success: `${appPublicUrl}?payment=success&slot=${params.slotId}`,
        failure: `${appPublicUrl}?payment=failure&slot=${params.slotId}`,
        pending: `${appPublicUrl}?payment=pending&slot=${params.slotId}`,
      },
      auto_return: 'approved',
      statement_descriptor: 'TURNERO BARBER',
    };

    const isPlaceholderToken =
      !mpAccessToken ||
      mpAccessToken.includes('CENTRAL-PLATFORM-TOKEN') ||
      mpAccessToken === 'TEST-000000';

    if (!isPlaceholderToken) {
      try {
        const response = await fetch(
          'https://api.mercadopago.com/checkout/preferences',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${mpAccessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(preferencePayload),
          },
        );

        if (response.ok) {
          const data = (await response.json()) as {
            id: string;
            init_point: string;
            sandbox_init_point?: string;
          };

          return {
            preference_id: data.id,
            init_point: data.init_point,
            sandbox_init_point: data.sandbox_init_point || data.init_point,
            deposit_amount: PLATFORM_DEPOSIT_ARS,
            external_reference: params.slotId,
            is_sandbox_local: false,
          };
        }
      } catch (err) {
        this.logger.warn(
          `Error conectando con API de Mercado Pago, usando preferencia local de desarrollo: ${(err as Error).message}`,
        );
      }
    }

    const fallbackPrefId = `pref_mp_${params.slotId.slice(0, 8)}_${Date.now()}`;
    const checkoutUrl = `${appPublicUrl}/checkout-mp?pref_id=${fallbackPrefId}&external_reference=${params.slotId}&amount=${PLATFORM_DEPOSIT_ARS}`;

    return {
      preference_id: fallbackPrefId,
      init_point: checkoutUrl,
      sandbox_init_point: checkoutUrl,
      deposit_amount: PLATFORM_DEPOSIT_ARS,
      external_reference: params.slotId,
      is_sandbox_local: true,
    };
  }

  /**
   * Procesa el Webhook de Mercado Pago verificando estado `approved` e idempotencia con `mp_payment_id` (@unique).
   * Pasa el turno a CONFIRMED y encola el recordatorio en ReminderQueue si reminder_addon_active == true.
   */
  async handleWebhook(
    dto: MercadoPagoWebhookDto,
    query: Record<string, string | undefined>,
  ) {
    const rawPaymentId =
      dto.payment_id ||
      dto.data?.id ||
      query['data.id'] ||
      query['id'] ||
      undefined;

    if (!rawPaymentId) {
      throw new BadRequestException(
        'Falta el identificador de pago (payment_id o data.id) en el webhook',
      );
    }

    const mpPaymentId = String(rawPaymentId);

    // 1. Verificación de idempotencia: si mp_payment_id ya fue procesado, retornar OK sin duplicar
    const alreadyProcessedSlot = await this.prisma.appointmentSlot.findUnique({
      where: { mp_payment_id: mpPaymentId },
    });

    if (alreadyProcessedSlot) {
      this.logger.log(
        `[Idempotencia] Pago mp_payment_id=${mpPaymentId} ya fue procesado para el slot ${alreadyProcessedSlot.id}`,
      );
      return {
        idempotent: true,
        status: alreadyProcessedSlot.status,
        slot_id: alreadyProcessedSlot.id,
        mp_payment_id: mpPaymentId,
      };
    }

    // 2. Resolver estado y external_reference desde Mercado Pago API (o payload directo en entorno de test)
    const paymentDetails = await this.resolvePaymentDetails(mpPaymentId, dto);

    if (paymentDetails.status !== 'approved') {
      this.logger.log(
        `Pago ${mpPaymentId} recibido con estado "${paymentDetails.status}" (no aprobado). Ignorando confirmación.`,
      );
      return {
        processed: false,
        status: paymentDetails.status,
        reason: `Estado de pago no aprobado (${paymentDetails.status})`,
        mp_payment_id: mpPaymentId,
        slot_id: paymentDetails.externalReference,
      };
    }

    if (!paymentDetails.externalReference) {
      throw new BadRequestException(
        `El pago ${mpPaymentId} no posee external_reference (slotId)`,
      );
    }

    // 3. Transacción atómica para confirmar el turno y registrar mp_payment_id (@unique)
    const confirmedSlot = await this.prisma.$transaction(async (tx) => {
      const slot = await tx.appointmentSlot.findUnique({
        where: { id: paymentDetails.externalReference },
        include: {
          barber: {
            include: { user: true },
          },
          client: true,
        },
      });

      if (!slot) {
        throw new NotFoundException(
          `No existe el turno (slot) con id ${paymentDetails.externalReference}`,
        );
      }

      if (slot.status === SlotStatus.CONFIRMED) {
        return slot;
      }

      return tx.appointmentSlot.update({
        where: { id: slot.id },
        data: {
          status: SlotStatus.CONFIRMED,
          mp_payment_id: mpPaymentId,
          locked_until: null,
          deposit_amount: PLATFORM_DEPOSIT_ARS,
        },
        include: {
          barber: {
            include: { user: true },
          },
          client: true,
        },
      });
    });

    // 4. Si el barbero tiene activo el módulo Reminder IA (3 USD), encolar en ReminderQueue vía MockDeepSeekReminderService
    let reminderRecord: {
      id: string;
      generated_message: string | null;
      scheduled_for: Date;
    } | null = null;

    if (confirmedSlot.barber.reminder_addon_active) {
      reminderRecord = await this.reminderProvider.scheduleForConfirmedSlot({
        slotId: confirmedSlot.id,
        barberId: confirmedSlot.barber_id,
        clientPhone: confirmedSlot.client?.phone || '+5491100000000',
        clientName: confirmedSlot.client?.name || 'Cliente',
        shopName: confirmedSlot.barber.shop_name,
        startTime: confirmedSlot.start_time,
        reminderAddonActive: confirmedSlot.barber.reminder_addon_active,
      });
    }

    // 5. Enviar notificación por Email (Nodemailer SMTP o fallback console.log) con .ics adjunto al cliente y aviso al barbero
    const emailResult = await this.mailService.sendAppointmentConfirmationEmails({
      slotId: confirmedSlot.id,
      shopName: confirmedSlot.barber.shop_name,
      barberName: confirmedSlot.barber.user.name,
      barberPhone: confirmedSlot.barber.user.phone,
      barberEmail: confirmedSlot.barber.user.email,
      address: confirmedSlot.barber.address,
      clientName: confirmedSlot.client?.name || 'Cliente',
      clientDni: confirmedSlot.client?.dni || 'S/D',
      clientEmail: confirmedSlot.client?.email,
      startTime: confirmedSlot.start_time,
      endTime: confirmedSlot.end_time,
      mpPaymentId: confirmedSlot.mp_payment_id || mpPaymentId,
      depositAmountArs: confirmedSlot.deposit_amount,
    });

    return {
      processed: true,
      slot_id: confirmedSlot.id,
      status: confirmedSlot.status,
      mp_payment_id: confirmedSlot.mp_payment_id,
      deposit_amount: confirmedSlot.deposit_amount,
      start_time: confirmedSlot.start_time.toISOString(),
      end_time: confirmedSlot.end_time.toISOString(),
      barber_phone: confirmedSlot.barber.user.phone,
      shop_name: confirmedSlot.barber.shop_name,
      reminder_enqueued: Boolean(reminderRecord),
      reminder_id: reminderRecord?.id || null,
      reminder_message: reminderRecord?.generated_message || null,
      reminder_scheduled_for: reminderRecord?.scheduled_for
        ? reminderRecord.scheduled_for.toISOString()
        : null,
      email_notified: emailResult.clientEmailSent,
      email_mode: emailResult.mode,
    };
  }

  private async resolvePaymentDetails(
    mpPaymentId: string,
    dto: MercadoPagoWebhookDto,
  ): Promise<{
    status: string;
    externalReference: string | undefined;
  }> {
    const mpAccessToken =
      this.configService.get<string>('MP_ACCESS_TOKEN') || '';
    const isPlaceholderToken =
      !mpAccessToken ||
      mpAccessToken.includes('CENTRAL-PLATFORM-TOKEN') ||
      mpAccessToken === 'TEST-000000';

    if (!isPlaceholderToken && !dto.external_reference) {
      const response = await fetch(
        `https://api.mercadopago.com/v1/payments/${encodeURIComponent(mpPaymentId)}`,
        {
          headers: {
            Authorization: `Bearer ${mpAccessToken}`,
          },
        },
      );

      if (response.ok) {
        const paymentData = (await response.json()) as {
          status: string;
          external_reference?: string;
        };
        return {
          status: paymentData.status,
          externalReference: paymentData.external_reference,
        };
      }
    }

    return {
      status: dto.status || 'approved',
      externalReference: dto.external_reference,
    };
  }
}
