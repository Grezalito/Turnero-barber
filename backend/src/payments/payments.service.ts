import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role, SlotStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  IReminderProvider,
  REMINDER_PROVIDER,
} from '../reminders/reminder.interface';
import { CreatePreferenceDto } from './dto/create-preference.dto';
import { MercadoPagoWebhookDto } from './dto/mp-webhook.dto';

export const PLATFORM_DEPOSIT_ARS = 2000;
export const LOCK_DURATION_MS = 10 * 60 * 1000;
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
   * Bloquea el turno por 10 minutos para el cliente (DNI, Nombre, WhatsApp)
   * y genera una preferencia real en Mercado Pago retornando { init_point }.
   */
  async createPreferenceForSlot(dto: CreatePreferenceDto): Promise<{
    init_point: string;
    sandbox_init_point: string;
    preference_id: string;
    slot_id: string;
    deposit_amount: number;
  }> {
    const cleanDni = dto.clientDni.replace(/\D/g, '');
    const now = new Date();
    const lockedUntil = new Date(now.getTime() + LOCK_DURATION_MS);

    // 1. Resolver o crear cliente por DNI
    let clientUser = await this.prisma.user.findUnique({
      where: { dni: cleanDni },
    });

    if (clientUser) {
      clientUser = await this.prisma.user.update({
        where: { id: clientUser.id },
        data: {
          name: dto.clientName.trim() || clientUser.name,
          phone: dto.clientPhone.trim() || clientUser.phone,
        },
      });
    } else {
      const defaultPasswordHash = await bcrypt.hash(
        cleanDni.padStart(6, '0'),
        10,
      );
      clientUser = await this.prisma.user.create({
        data: {
          dni: cleanDni,
          password: defaultPasswordHash,
          name: dto.clientName.trim(),
          phone: dto.clientPhone.trim(),
          role: Role.CLIENT,
        },
      });
    }

    // 2. Verificar y bloquear el turno en la base de datos si existe
    const existingSlot = await this.prisma.appointmentSlot.findUnique({
      where: { id: dto.slotId },
      include: { barber: true },
    });

    if (existingSlot) {
      const lockedSlot = await this.prisma.$transaction(async (tx) => {
        const updateResult = await tx.appointmentSlot.updateMany({
          where: {
            id: dto.slotId,
            OR: [
              { status: SlotStatus.AVAILABLE },
              {
                status: SlotStatus.PENDING_PAYMENT,
                locked_until: { lt: now },
              },
              {
                status: SlotStatus.PENDING_PAYMENT,
                client_id: clientUser.id,
              },
            ],
          },
          data: {
            status: SlotStatus.PENDING_PAYMENT,
            client_id: clientUser.id,
            locked_until: lockedUntil,
            deposit_amount: PLATFORM_DEPOSIT_ARS,
          },
        });

        if (updateResult.count === 0) {
          throw new ConflictException(
            'Este horario acaba de ser reservado por otra persona. Por favor elegí otro turno disponible.',
          );
        }

        return tx.appointmentSlot.findUniqueOrThrow({
          where: { id: dto.slotId },
          include: { barber: true },
        });
      });

      const preference = await this.createDepositPreference({
        slotId: lockedSlot.id,
        shopName: lockedSlot.barber.shop_name,
        startTime: lockedSlot.start_time,
        clientDni: cleanDni,
        clientName: dto.clientName.trim(),
      });

      await this.prisma.appointmentSlot.update({
        where: { id: lockedSlot.id },
        data: { mp_preference_id: preference.preference_id },
      });

      return {
        init_point: preference.init_point,
        sandbox_init_point: preference.sandbox_init_point,
        preference_id: preference.preference_id,
        slot_id: lockedSlot.id,
        deposit_amount: PLATFORM_DEPOSIT_ARS,
      };
    }

    // Si es un slot de vista previa pero se solicita preferencia real de MP
    if (dto.slotId.startsWith('slot_')) {
      const preference = await this.createDepositPreference({
        slotId: dto.slotId,
        shopName: 'Barbería',
        startTime: now,
        clientDni: cleanDni,
        clientName: dto.clientName.trim(),
      });

      return {
        init_point: preference.init_point,
        sandbox_init_point: preference.sandbox_init_point,
        preference_id: preference.preference_id,
        slot_id: dto.slotId,
        deposit_amount: PLATFORM_DEPOSIT_ARS,
      };
    }

    throw new NotFoundException('El turno seleccionado no existe.');
  }

  /**
   * Crea la preferencia de pago real por $2.000 ARS (100% cuenta central de la plataforma)
   * usando MP_ACCESS_TOKEN contra https://api.mercadopago.com/checkout/preferences.
   */
  async createDepositPreference(params: {
    slotId: string;
    shopName: string;
    startTime: Date;
    clientDni: string;
    clientName?: string;
  }): Promise<PreferenceResult> {
    const mpAccessToken = (
      this.configService.get<string>('MP_ACCESS_TOKEN') || ''
    ).trim();
    const appPublicUrl = (
      this.configService.get<string>('FRONTEND_URL') ||
      this.configService.get<string>('PUBLIC_APP_URL') ||
      'http://localhost:5173'
    ).trim();
    const webhookUrl = (
      this.configService.get<string>('MP_WEBHOOK_URL') || ''
    ).trim();

    const isHttpsFrontend = appPublicUrl.startsWith('https://');
    const isHttpsWebhook =
      webhookUrl.startsWith('https://') && !webhookUrl.includes('localhost');

    const preferencePayload: Record<string, unknown> = {
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
      payer: {
        name: params.clientName || `Cliente DNI ${params.clientDni}`,
        identification: {
          type: 'DNI',
          number: params.clientDni,
        },
      },
      external_reference: params.slotId,
      back_urls: {
        success: `${appPublicUrl}?payment=success&slot=${params.slotId}`,
        failure: `${appPublicUrl}?payment=failure&slot=${params.slotId}`,
        pending: `${appPublicUrl}?payment=pending&slot=${params.slotId}`,
      },
      ...(isHttpsFrontend ? { auto_return: 'approved' } : {}),
      ...(isHttpsWebhook ? { notification_url: webhookUrl } : {}),
      statement_descriptor: 'TURNERO BARBER',
    };

    const isPlaceholderToken =
      !mpAccessToken ||
      mpAccessToken.includes('CENTRAL-PLATFORM-TOKEN') ||
      mpAccessToken === 'TEST-000000';

    if (isPlaceholderToken) {
      throw new BadGatewayException(
        'No se configuró un MP_ACCESS_TOKEN válido de Mercado Pago en el servidor.',
      );
    }

    let response: Response;
    try {
      response = await fetch(
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
    } catch (err) {
      this.logger.error(
        `Error de red conectando con Mercado Pago: ${(err as Error).message}`,
      );
      throw new BadGatewayException(
        'No se pudo conectar con Mercado Pago. Intentá nuevamente en unos segundos.',
      );
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      this.logger.error(
        `Mercado Pago rechazó la creación de preferencia (${response.status}): ${errorText}`,
      );
      throw new BadGatewayException(
        'Mercado Pago no pudo generar el link de pago en este momento.',
      );
    }

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

    const emailResult =
      await this.mailService.sendAppointmentConfirmationEmails({
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
