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
import { OrphanPaymentStatus, Prisma, Role, SlotStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  IReminderProvider,
  REMINDER_PROVIDER,
} from '../reminders/reminder.interface';
import {
  maskDni,
  sanitizeControlChars,
} from '../security/pii-sanitizer.util';
import { ConfirmReturnDto } from './dto/confirm-return.dto';
import { CreatePreferenceDto } from './dto/create-preference.dto';
import {
  generateLockToken,
  hashLockToken,
  isWellFormedLockToken,
} from '../appointments/lock-token.util';
import { MercadoPagoService } from './mercadopago.service';

export const PLATFORM_DEPOSIT_ARS = 2000;
const MAX_CONFIRMATION_ATTEMPTS = 5;

type OrphanReason =
  | 'SLOT_NOT_FOUND'
  | 'SLOT_CANCELLED'
  | 'DUPLICATE_PAYMENT'
  | 'SLOT_TAKEN_BY_OTHER_CLIENT'
  | 'MISSING_CLIENT_BINDING';

type ResolvedPayment = {
  status: string;
  externalReference: string | undefined;
  /** Cliente titular del bloqueo según la metadata de la preferencia de MP. */
  clientId: string | undefined;
  amount: number | undefined;
  simulated: boolean;
};

type ConfirmationOutcome =
  | { kind: 'ALREADY_PROCESSED'; slot: any }
  | { kind: 'TRANSITIONED'; slot: any }
  | { kind: 'ORPHAN'; reason: OrphanReason }
  | { kind: 'ALREADY_RECORDED_ORPHAN'; reason: string };

class ConcurrentSlotChangeError extends Error {
  constructor() {
    super('El turno cambió durante la confirmación del pago');
  }
}
export const SLOT_DURATION_MS = 30 * 60 * 1000;
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
    private readonly mercadoPagoService: MercadoPagoService,
  ) {}

  isPaymentNotification(
    type?: string | null,
    action?: string | null,
    topic?: string | null,
  ): boolean {
    return this.mercadoPagoService.isPaymentNotification(type, action, topic);
  }

  isProductionEnv(): boolean {
    return (
      (this.configService.get<string>('NODE_ENV') || '').toLowerCase() ===
      'production'
    );
  }

  /**
   * Bloquea el turno por 10 minutos para el cliente (DNI, Nombre, WhatsApp)
   * y genera una preferencia real en Mercado Pago retornando { init_point }.
   * Si la llamada a Mercado Pago falla, revierte el bloqueo inmediatamente a AVAILABLE.
   */
  async createPreferenceForSlot(dto: CreatePreferenceDto): Promise<{
    init_point: string;
    sandbox_init_point: string;
    preference_id: string;
    slot_id: string;
    deposit_amount: number;
    lock_token?: string;
  }> {
    const cleanDni = dto.clientDni.replace(/\D/g, '');
    const now = new Date();
    const lockedUntil = new Date(now.getTime() + LOCK_DURATION_MS);

    // 1. Resolver o crear cliente por DNI (sin sobrescribir cuentas de staff BARBER/SUPERADMIN)
    const sanitizedName = sanitizeControlChars(dto.clientName);
    const sanitizedPhone = sanitizeControlChars(dto.clientPhone);

    let clientUser = await this.prisma.user.findUnique({
      where: { dni: cleanDni },
    });

    if (clientUser) {
      if (clientUser.role === Role.CLIENT) {
        clientUser = await this.prisma.user.update({
          where: { id: clientUser.id },
          data: {
            name: sanitizedName || clientUser.name,
            phone: sanitizedPhone || clientUser.phone,
          },
        });
      }
    } else {
      // Secreto aleatorio CSPRNG de 256 bits para cuentas Guest Checkout (ISO 27001 A.8.5 - Prohibición de contraseñas predecibles basadas en DNI)
      const csprngGuestSecret = crypto.randomBytes(32).toString('hex');
      const randomPasswordHash = await bcrypt.hash(csprngGuestSecret, 10);
      clientUser = await this.prisma.user.create({
        data: {
          dni: cleanDni,
          password: randomPasswordHash,
          name: sanitizedName,
          phone: sanitizedPhone,
          role: Role.CLIENT,
        },
      });
    }

    // 2. Verificar y bloquear el turno atómicamente en la base de datos si existe
    const existingSlot = await this.prisma.appointmentSlot.findUnique({
      where: { id: dto.slotId },
      include: { barber: true },
    });

    if (existingSlot) {
      const durationMs =
        existingSlot.end_time.getTime() - existingSlot.start_time.getTime();
      if (durationMs !== SLOT_DURATION_MS) {
        throw new BadRequestException(
          'El bloque horario no cumple con la duración estricta de 30 minutos',
        );
      }

      const lockToken = generateLockToken();
      const lockedSlot = await this.prisma.$transaction(async (tx) => {
        // Guest checkout identificado solo por DNI: NO se permite re-bloquear un turno ya bloqueado por
        // el mismo DNI (eso permitiría a un tercero que conozca el DNI obtener un lockToken nuevo y
        // liberar el bloqueo ajeno). Solo turnos libres o con bloqueo vencido.
        const updateResult = await tx.appointmentSlot.updateMany({
          where: {
            id: dto.slotId,
            OR: [
              { status: SlotStatus.AVAILABLE },
              {
                status: SlotStatus.PENDING_PAYMENT,
                locked_until: { lt: now },
              },
            ],
          },
          data: {
            status: SlotStatus.PENDING_PAYMENT,
            client_id: clientUser.id,
            locked_until: lockedUntil,
            deposit_amount: PLATFORM_DEPOSIT_ARS,
            lock_token_hash: lockToken.hash,
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

      try {
        const preference = await this.createDepositPreference({
          slotId: lockedSlot.id,
          shopName: lockedSlot.barber.shop_name,
          barberSlug: lockedSlot.barber.slug,
          startTime: lockedSlot.start_time,
          clientDni: cleanDni,
          clientName: dto.clientName.trim(),
          clientId: clientUser.id,
          lockTokenHash: lockToken.hash,
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
          lock_token: lockToken.token,
        };
      } catch (err) {
        // Rollback inmediato del bloqueo si falla la creación de preferencia en Mercado Pago
        await this.prisma.appointmentSlot
          .updateMany({
            where: {
              id: lockedSlot.id,
              status: SlotStatus.PENDING_PAYMENT,
              lock_token_hash: lockToken.hash,
            },
            data: {
              status: SlotStatus.AVAILABLE,
              client_id: null,
              locked_until: null,
              mp_preference_id: null,
              lock_token_hash: null,
            },
          })
          .catch(() => undefined);

        throw err;
      }
    }

    // Si es un slot de vista previa local pero se solicita preferencia de MP (solo en desarrollo)
    if (!this.isProductionEnv() && dto.slotId.startsWith('slot_')) {
      const preference = await this.createDepositPreference({
        slotId: dto.slotId,
        shopName: 'Barbería',
        startTime: now,
        clientDni: cleanDni,
        clientName: dto.clientName.trim(),
        clientId: clientUser.id,
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
    barberSlug?: string;
    startTime: Date;
    clientDni: string;
    clientName?: string;
    /** Cliente titular del bloqueo: viaja en metadata y se valida al confirmar el pago. */
    clientId: string;
    /** Hash del lockToken: identifica unívocamente este bloqueo (clave de idempotencia de MP). */
    lockTokenHash?: string;
  }): Promise<PreferenceResult> {
    const mpAccessToken = (
      this.configService.get<string>('MP_ACCESS_TOKEN') || ''
    ).trim();
    const appPublicUrl = (
      this.configService.get<string>('FRONTEND_URL') ||
      this.configService.get<string>('PUBLIC_APP_URL') ||
      'http://localhost:5173'
    )
      .trim()
      .replace(/\/+$/, '');
    const webhookUrl = (
      this.configService.get<string>('MP_WEBHOOK_URL') || ''
    ).trim();

    const returnBaseUrl = params.barberSlug
      ? `${appPublicUrl}/${encodeURIComponent(params.barberSlug)}`
      : appPublicUrl;

    const isHttpsFrontend = appPublicUrl.startsWith('https://');
    const isHttpsWebhook =
      webhookUrl.startsWith('https://') && !webhookUrl.includes('localhost');

    const preferencePayload: Record<string, unknown> = {
      items: [
        {
          id: params.slotId,
          title: `Seña de Turno (30 min) - ${sanitizeControlChars(params.shopName)}`,
          description: `Reserva de turno para DNI ${maskDni(params.clientDni)}`,
          quantity: 1,
          currency_id: 'ARS',
          unit_price: PLATFORM_DEPOSIT_ARS,
        },
      ],
      payer: {
        name:
          sanitizeControlChars(params.clientName) ||
          `Cliente DNI ${maskDni(params.clientDni)}`,
        identification: {
          type: 'DNI',
          number: params.clientDni,
        },
      },
      external_reference: params.slotId,
      // Vincula el pago con el bloqueo exacto: se valida contra la agenda al confirmar (anti lock-mismatch).
      metadata: {
        slot_id: params.slotId,
        client_id: params.clientId,
      },
      back_urls: {
        success: `${returnBaseUrl}?payment_status=approved&slot=${encodeURIComponent(params.slotId)}`,
        failure: `${returnBaseUrl}?payment_status=rejected&slot=${encodeURIComponent(params.slotId)}`,
        pending: `${returnBaseUrl}?payment_status=pending&slot=${encodeURIComponent(params.slotId)}`,
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

    let preference;
    try {
      preference = await this.mercadoPagoService.createPreference(
        preferencePayload as any,
        {
          // Una clave por bloqueo: reintentos del mismo bloqueo son idempotentes, pero un bloqueo
          // nuevo (otro cliente u otro intento) nunca reutiliza la preferencia de uno anterior.
          idempotencyKey: `pref-${params.slotId}-${(
            params.lockTokenHash || crypto.randomBytes(16).toString('hex')
          ).slice(0, 32)}`,
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

    if (!preference || !preference.id || !preference.init_point) {
      this.logger.error('Mercado Pago no retornó init_point válido');
      throw new BadGatewayException(
        'Mercado Pago no pudo generar el link de pago en este momento.',
      );
    }

    return {
      preference_id: preference.id,
      init_point: preference.init_point,
      sandbox_init_point:
        preference.sandbox_init_point || preference.init_point,
      deposit_amount: PLATFORM_DEPOSIT_ARS,
      external_reference: params.slotId,
      is_sandbox_local: false,
    };
  }

  /**
   * Captura inmediata del retorno de Mercado Pago (back_urls) en POST /payments/confirm-return.
   * Garantiza idempotencia con el webhook y libera el slot inmediatamente si el pago fue rechazado.
   */
  async confirmPaymentReturn(dto: ConfirmReturnDto) {
    const slotId = (dto.slotId || dto.external_reference || '').trim();
    const rawPaymentId = (
      dto.paymentId ||
      dto.payment_id ||
      dto.collection_id ||
      ''
    ).trim();
    const rawStatus = (dto.status || dto.collection_status || '')
      .trim()
      .toLowerCase();

    if (!slotId && !rawPaymentId) {
      throw new BadRequestException(
        'Se requiere slotId o paymentId para verificar el retorno del pago',
      );
    }

    // Si el retorno indica rechazo o cancelación explícita, liberamos el bloqueo temporal
    // SOLO si quien llama presenta el lockToken del bloqueo (update condicional sobre el hash).
    if (
      slotId &&
      (rawStatus === 'rejected' ||
        rawStatus === 'failure' ||
        rawStatus === 'cancelled' ||
        rawStatus === 'null')
    ) {
      const lockToken = (dto.lock_token || '').trim();
      const released = isWellFormedLockToken(lockToken)
        ? await this.prisma.appointmentSlot.updateMany({
            where: {
              id: slotId,
              status: SlotStatus.PENDING_PAYMENT,
              lock_token_hash: hashLockToken(lockToken),
            },
            data: {
              status: SlotStatus.AVAILABLE,
              client_id: null,
              locked_until: null,
              mp_preference_id: null,
              lock_token_hash: null,
            },
          })
        : { count: 0 };

      if (released.count === 0) {
        this.logger.warn(
          `[SECURITY_AUDIT] event=LOCK_RELEASE_DENIED source=confirm-return reason=${lockToken ? 'LOCK_TOKEN_MISMATCH' : 'LOCK_TOKEN_MISSING'} slotId=${sanitizeControlChars(slotId)}`,
        );
        return {
          processed: false,
          released: false,
          slot_id: slotId,
          status: rawStatus,
          reason:
            'El pago no se completó. El horario se liberará automáticamente al vencer el bloqueo.',
        };
      }

      return {
        processed: false,
        released: true,
        slot_id: slotId,
        status: SlotStatus.AVAILABLE,
        reason: 'El pago fue rechazado o cancelado y el horario fue liberado.',
      };
    }

    // Si el turno ya fue confirmado por el Webhook antes de que cargara la página de retorno, devolver de forma idempotente
    if (slotId) {
      const existingSlot = await this.prisma.appointmentSlot.findUnique({
        where: { id: slotId },
        include: {
          barber: { include: { user: true } },
          client: true,
          reminders: { orderBy: { created_at: 'desc' }, take: 1 },
        },
      });

      // Solo es "ya confirmado" para quien trae ESE pago (o no trae ninguno). Un pago distinto sobre
      // un turno confirmado se procesa abajo y termina como OrphanPayment (REQUIRES_REFUND).
      if (
        existingSlot &&
        existingSlot.status === SlotStatus.CONFIRMED &&
        (!rawPaymentId || existingSlot.mp_payment_id === rawPaymentId)
      ) {
        const latestReminder = existingSlot.reminders[0];
        return {
          received: true,
          processed: true,
          idempotent: true,
          slot_id: existingSlot.id,
          status: existingSlot.status,
          mp_payment_id: existingSlot.mp_payment_id || rawPaymentId || 'ACREDITADO',
          deposit_amount: existingSlot.deposit_amount,
          start_time: existingSlot.start_time.toISOString(),
          end_time: existingSlot.end_time.toISOString(),
          barber_phone: existingSlot.barber.user.phone,
          shop_name: existingSlot.barber.shop_name,
          barber_slug: existingSlot.barber.slug,
          reminder_enqueued: Boolean(latestReminder),
          reminder_id: latestReminder?.id || null,
          reminder_message: latestReminder?.generated_message || null,
          reminder_scheduled_for: latestReminder?.scheduled_for
            ? latestReminder.scheduled_for.toISOString()
            : null,
        };
      }
    }

    // Si viene un payment_id real (o simulado en dev), delegar a la lógica transaccional de confirmación
    if (rawPaymentId) {
      return this.handleWebhook(
        {
          type: 'payment',
          payment_id: rawPaymentId,
          ...(slotId ? { external_reference: slotId } : {}),
          ...(rawStatus ? { status: rawStatus } : {}),
        },
        {},
      );
    }

    // Si en desarrollo se retornó con status=approved y slotId sin paymentId explícito
    if (!this.isProductionEnv() && slotId && rawStatus === 'approved') {
      return this.handleWebhook(
        {
          type: 'payment',
          payment_id: `mp_sim_return_${slotId}`,
          external_reference: slotId,
          status: 'approved',
        },
        {},
      );
    }

    return {
      received: true,
      processed: false,
      slot_id: slotId,
      status: rawStatus || 'pending',
      reason: 'Pago pendiente de confirmación por Mercado Pago',
    };
  }

  /**
   * Procesa el Webhook de Mercado Pago verificando estado `approved` e idempotencia con `mp_payment_id` (@unique).
   * Pasa el turno a CONFIRMED y encola el recordatorio en ReminderQueue si reminder_addon_active == true.
   */
  /**
   * Procesa la notificación de pago en segundo plano de manera segura (verify-then-fetch)
   * e idempotente (Prisma transaction con actualización condicional y P2002 handling).
   */
  async processPaymentNotification(paymentId: string) {
    return this.executePaymentConfirmation({ paymentId });
  }

  /**
   * Endpoint de simulación síncrono para entornos fuera de producción.
   */
  async simulateWebhook(body: Record<string, any>) {
    if (this.isProductionEnv()) {
      throw new NotFoundException('Simulación no disponible en producción');
    }

    const rawPaymentId =
      body?.payment_id || body?.data?.id || body?.id || `mp_sim_${Date.now()}`;
    const paymentId = sanitizeControlChars(String(rawPaymentId));

    return this.executePaymentConfirmation({
      paymentId,
      simulatedPayload: body,
    });
  }

  /**
   * Wrapper para compatibilidad hacia atrás con llamadas internas a handleWebhook.
   */
  async handleWebhook(
    body: Record<string, any> = {},
    query: Record<string, any> = {},
    _signatureHeaders?: { xSignature?: string; xRequestId?: string },
  ) {
    const rawPaymentId =
      query?.['data.id'] ??
      query?.id ??
      body?.data?.id ??
      body?.id ??
      body?.payment_id;
    const paymentId =
      rawPaymentId !== undefined && rawPaymentId !== null
        ? sanitizeControlChars(String(rawPaymentId))
        : '';

    if (!paymentId) {
      return { received: true, processed: false, error: 'Missing paymentId' };
    }

    return this.executePaymentConfirmation({
      paymentId,
      simulatedPayload: body,
    });
  }

  /**
   * Lógica transaccional unificada de confirmación de pago e idempotencia en PostgreSQL/Prisma.
   */
  private async executePaymentConfirmation(params: {
    paymentId: string;
    simulatedPayload?: Record<string, any>;
  }) {
    const { paymentId, simulatedPayload } = params;
    const mpPaymentId = paymentId;

    const paymentDetails = await this.resolvePaymentDetails(
      mpPaymentId,
      simulatedPayload,
    );

    if (!paymentDetails) {
      return {
        received: true,
        processed: false,
        error: 'Payment not found or unverified',
      };
    }

    if (paymentDetails.status !== 'approved') {
      this.logger.log(
        `Pago ${mpPaymentId} recibido con estado "${paymentDetails.status}" (no aprobado). Ignorando confirmación.`,
      );
      return {
        received: true,
        processed: false,
        status: paymentDetails.status,
        reason: `Estado de pago no aprobado (${paymentDetails.status})`,
        mp_payment_id: mpPaymentId,
        slot_id: paymentDetails.externalReference,
      };
    }

    if (!paymentDetails.externalReference) {
      this.logger.warn(
        `El pago ${mpPaymentId} está aprobado pero no posee external_reference (slotId). Ignorando.`,
      );
      return {
        received: true,
        processed: false,
        error: 'Missing external_reference',
      };
    }

    const slotId = paymentDetails.externalReference;

    let txResult: ConfirmationOutcome | undefined;
    for (let attempt = 1; attempt <= MAX_CONFIRMATION_ATTEMPTS; attempt++) {
      try {
        txResult = await this.prisma.$transaction((tx) =>
          this.decidePaymentConfirmation(tx, mpPaymentId, slotId, paymentDetails),
        );
        break;
      } catch (err) {
        if (err instanceof ConcurrentSlotChangeError) {
          // Otro proceso cambió el turno entre la lectura y el update condicional: re-evaluar.
          continue;
        }
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          // Colisión unique (mp_payment_id en slot u orphan): otra ejecución concurrente ya lo registró.
          continue;
        }
        throw err;
      }
    }

    if (!txResult) {
      throw new Error(
        `No se pudo resolver la confirmación del pago ${mpPaymentId} tras ${MAX_CONFIRMATION_ATTEMPTS} intentos concurrentes`,
      );
    }

    if (txResult.kind === 'ORPHAN' || txResult.kind === 'ALREADY_RECORDED_ORPHAN') {
      if (txResult.kind === 'ORPHAN') {
        this.logger.error(
          `[SECURITY_AUDIT][PAYMENT_MISMATCH] severity=HIGH event=ORPHAN_PAYMENT_RECORDED status=REQUIRES_REFUND reason=${txResult.reason} mpPaymentId=${sanitizeControlChars(mpPaymentId)} slotId=${sanitizeControlChars(slotId)} amount=${paymentDetails.amount}`,
        );
      }
      return {
        received: true,
        processed: false,
        idempotent: txResult.kind === 'ALREADY_RECORDED_ORPHAN',
        status: OrphanPaymentStatus.REQUIRES_REFUND,
        reason: txResult.reason,
        slot_id: slotId,
        mp_payment_id: mpPaymentId,
      };
    }

    const confirmedSlot = txResult.slot;

    // Si ya fue procesado previamente, devolver idempotentemente sin re-ejecutar efectos secundarios
    if (txResult.kind === 'ALREADY_PROCESSED') {
      this.logger.log(
        `[Idempotencia] Pago ${mpPaymentId} ya fue procesado para el slot ${confirmedSlot.id}.`,
      );
      const latestRem = confirmedSlot.reminders?.[0];
      return {
        received: true,
        processed: true,
        idempotent: true,
        slot_id: confirmedSlot.id,
        status: confirmedSlot.status,
        mp_payment_id: confirmedSlot.mp_payment_id || mpPaymentId,
        deposit_amount: confirmedSlot.deposit_amount,
        start_time: confirmedSlot.start_time.toISOString(),
        end_time: confirmedSlot.end_time.toISOString(),
        barber_phone: confirmedSlot.barber?.user?.phone,
        shop_name: confirmedSlot.barber?.shop_name,
        barber_slug: confirmedSlot.barber?.slug,
        reminder_enqueued: Boolean(latestRem),
        reminder_id: latestRem?.id || null,
        reminder_message: latestRem?.generated_message || null,
      };
    }

    // Efectos secundarios solo si ESTA ejecución realizó la transición
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
      received: true,
      processed: true,
      slot_id: confirmedSlot.id,
      status: confirmedSlot.status,
      mp_payment_id: confirmedSlot.mp_payment_id,
      deposit_amount: confirmedSlot.deposit_amount,
      start_time: confirmedSlot.start_time.toISOString(),
      end_time: confirmedSlot.end_time.toISOString(),
      barber_phone: confirmedSlot.barber.user.phone,
      shop_name: confirmedSlot.barber.shop_name,
      barber_slug: confirmedSlot.barber.slug,
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

  /**
   * Decide, dentro de la transacción, qué hacer con un pago aprobado y verificado contra MP.
   * Nunca pisa un turno de otro cliente: los pagos que no corresponden al bloqueo vigente se
   * registran como OrphanPayment (REQUIRES_REFUND).
   *
   * | Estado del turno                         | Resultado                                   |
   * |------------------------------------------|---------------------------------------------|
   * | ya tiene este mp_payment_id              | ALREADY_PROCESSED (idempotente)             |
   * | inexistente / CANCELLED                  | ORPHAN                                      |
   * | CONFIRMED (otro pago)                    | ORPHAN (DUPLICATE_PAYMENT / SLOT_TAKEN)     |
   * | PENDING_PAYMENT del mismo cliente        | CONFIRMA                                    |
   * | PENDING_PAYMENT de otro cliente, vigente | ORPHAN (SLOT_TAKEN_BY_OTHER_CLIENT)         |
   * | PENDING_PAYMENT de otro cliente, vencido | CONFIRMA reasignando al cliente del pago    |
   * | AVAILABLE (bloqueo expirado y liberado)  | CONFIRMA reasignando al cliente del pago    |
   *
   * Todas las transiciones usan updates condicionales sobre el estado leído; si otro proceso lo
   * modificó en el medio se lanza ConcurrentSlotChangeError y el llamador re-evalúa.
   */
  private async decidePaymentConfirmation(
    tx: Prisma.TransactionClient,
    mpPaymentId: string,
    slotId: string,
    payment: ResolvedPayment,
  ): Promise<ConfirmationOutcome> {
    const slotInclude = {
      barber: { include: { user: true } },
      client: true,
      reminders: { orderBy: { created_at: 'desc' as const }, take: 1 },
    };

    const existingByPayment = await tx.appointmentSlot.findUnique({
      where: { mp_payment_id: mpPaymentId },
      include: slotInclude,
    });
    if (existingByPayment) {
      return { kind: 'ALREADY_PROCESSED', slot: existingByPayment };
    }

    const existingOrphan = await tx.orphanPayment.findUnique({
      where: { mp_payment_id: mpPaymentId },
    });
    if (existingOrphan) {
      return { kind: 'ALREADY_RECORDED_ORPHAN', reason: existingOrphan.reason };
    }

    const slot = await tx.appointmentSlot.findUnique({
      where: { id: slotId },
      include: slotInclude,
    });

    // Cliente al que pertenece el pago. En pagos reales viene de la metadata de la preferencia;
    // solo las simulaciones de desarrollo pueden heredar el titular actual del bloqueo.
    const payerClientId =
      payment.clientId ?? (payment.simulated ? slot?.client_id ?? undefined : undefined);

    const orphan = async (reason: OrphanReason): Promise<ConfirmationOutcome> => {
      await tx.orphanPayment.create({
        data: {
          mp_payment_id: mpPaymentId,
          slot_id: slot ? slot.id : slotId,
          client_id: payerClientId ?? null,
          amount: payment.amount ?? null,
          reason,
        },
      });
      return { kind: 'ORPHAN', reason };
    };

    if (!slot) return orphan('SLOT_NOT_FOUND');
    if (!payerClientId) return orphan('MISSING_CLIENT_BINDING');

    if (slot.status === SlotStatus.CANCELLED) return orphan('SLOT_CANCELLED');

    if (slot.status === SlotStatus.CONFIRMED) {
      return orphan(
        slot.client_id === payerClientId
          ? 'DUPLICATE_PAYMENT'
          : 'SLOT_TAKEN_BY_OTHER_CLIENT',
      );
    }

    const now = new Date();
    if (
      slot.status === SlotStatus.PENDING_PAYMENT &&
      slot.client_id !== payerClientId &&
      slot.locked_until &&
      slot.locked_until > now
    ) {
      // El bloqueo del pagador expiró y otro cliente tiene hoy un bloqueo vigente: no se le pisa el turno.
      return orphan('SLOT_TAKEN_BY_OTHER_CLIENT');
    }

    // Transición condicional sobre exactamente el estado leído (status + titular + vencimiento).
    const updateRes = await tx.appointmentSlot.updateMany({
      where: {
        id: slot.id,
        status: slot.status,
        client_id: slot.client_id,
        locked_until: slot.locked_until,
      },
      data: {
        status: SlotStatus.CONFIRMED,
        client_id: payerClientId,
        mp_payment_id: mpPaymentId,
        locked_until: null,
        lock_token_hash: null,
        deposit_amount: PLATFORM_DEPOSIT_ARS,
      },
    });

    if (updateRes.count === 0) {
      throw new ConcurrentSlotChangeError();
    }

    if (slot.client_id !== payerClientId) {
      this.logger.warn(
        `[SECURITY_AUDIT] event=LATE_PAYMENT_REASSIGNED slotId=${slot.id} mpPaymentId=${sanitizeControlChars(mpPaymentId)} previousStatus=${slot.status}`,
      );
    }

    const updated = await tx.appointmentSlot.findUniqueOrThrow({
      where: { id: slot.id },
      include: slotInclude,
    });
    return { kind: 'TRANSITIONED', slot: updated };
  }

  /**
   * Verifica la autenticidad del pago contra la API de Mercado Pago (verify-then-fetch).
   * En producción (NODE_ENV=production) exige estrictamente consultar https://api.mercadopago.com/v1/payments/:id
   * con MP_ACCESS_TOKEN y nunca confía en el body plano del request.
   * En entornos de desarrollo/sandbox local permite simular webhooks cuando no hay token productivo o el ID es de prueba.
   */
  private async resolvePaymentDetails(
    mpPaymentId: string,
    simulatedPayload?: Record<string, any>,
  ): Promise<ResolvedPayment | null> {
    const isProd = this.isProductionEnv();
    const mpAccessToken = (
      this.configService.get<string>('MP_ACCESS_TOKEN') || ''
    ).trim();
    const isPlaceholderToken =
      !mpAccessToken ||
      mpAccessToken.includes('CENTRAL-PLATFORM-TOKEN') ||
      mpAccessToken === 'TEST-000000';

    const isSimulatedId =
      mpPaymentId.startsWith('mp_pay_') || mpPaymentId.startsWith('mp_sim_');

    // Solo fuera de producción se permite simulación local de payloads directos (vía simulateWebhook)
    if (
      !isProd &&
      simulatedPayload?.external_reference &&
      simulatedPayload?.status &&
      (isPlaceholderToken || isSimulatedId)
    ) {
      return {
        status: String(simulatedPayload.status),
        externalReference: String(simulatedPayload.external_reference),
        clientId: simulatedPayload.client_id
          ? String(simulatedPayload.client_id)
          : undefined,
        amount: PLATFORM_DEPOSIT_ARS,
        simulated: true,
      };
    }

    if (isPlaceholderToken) {
      this.logger.warn(
        `No hay MP_ACCESS_TOKEN válido para consultar el pago ${mpPaymentId} en Mercado Pago.`,
      );
      return null;
    }

    try {
      const paymentData = (await this.mercadoPagoService.getPayment(
        mpPaymentId,
      )) as {
        status?: string;
        external_reference?: string;
        transaction_amount?: number;
        metadata?: Record<string, unknown> | null;
      };

      if (!paymentData || !paymentData.status) {
        this.logger.warn(
          `Respuesta de MP para pago ${mpPaymentId} no contiene status válido.`,
        );
        return null;
      }

      if (
        typeof paymentData.transaction_amount !== 'number' ||
        paymentData.transaction_amount < PLATFORM_DEPOSIT_ARS
      ) {
        this.logger.warn(
          `Pago ${mpPaymentId} rechazado por monto insuficiente o ausente (${paymentData.transaction_amount} < ${PLATFORM_DEPOSIT_ARS}).`,
        );
        return null;
      }

      const metadataClientId = paymentData.metadata?.client_id;

      return {
        status: String(paymentData.status),
        externalReference: paymentData.external_reference
          ? String(paymentData.external_reference)
          : undefined,
        clientId:
          typeof metadataClientId === 'string' && metadataClientId
            ? metadataClientId
            : undefined,
        amount: paymentData.transaction_amount,
        simulated: false,
      };
    } catch (error) {
      this.logger.warn(
        `Error consultando pago ${mpPaymentId} en Mercado Pago: ${(error as Error).message}`,
      );
      return null;
    }
  }

}
