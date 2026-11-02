"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var PaymentsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentsService = exports.NON_REFUNDABLE_DEPOSIT_POLICY = exports.LOCK_DURATION_MS = exports.SLOT_DURATION_MS = exports.PLATFORM_DEPOSIT_ARS = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_1 = require("@prisma/client");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const mail_service_1 = require("../mail/mail.service");
const prisma_service_1 = require("../prisma/prisma.service");
const reminder_interface_1 = require("../reminders/reminder.interface");
const pii_sanitizer_util_1 = require("../security/pii-sanitizer.util");
exports.PLATFORM_DEPOSIT_ARS = 2000;
exports.SLOT_DURATION_MS = 30 * 60 * 1000;
exports.LOCK_DURATION_MS = 10 * 60 * 1000;
exports.NON_REFUNDABLE_DEPOSIT_POLICY = 'Reserva garantizada: la seña de $2.000 ARS no es reembolsable ni transferible ante cancelaciones o inasistencias';
let PaymentsService = PaymentsService_1 = class PaymentsService {
    constructor(prisma, configService, mailService, reminderProvider) {
        this.prisma = prisma;
        this.configService = configService;
        this.mailService = mailService;
        this.reminderProvider = reminderProvider;
        this.logger = new common_1.Logger(PaymentsService_1.name);
    }
    isProductionEnv() {
        return ((this.configService.get('NODE_ENV') || '').toLowerCase() ===
            'production');
    }
    async createPreferenceForSlot(dto) {
        const cleanDni = dto.clientDni.replace(/\D/g, '');
        const now = new Date();
        const lockedUntil = new Date(now.getTime() + exports.LOCK_DURATION_MS);
        const sanitizedName = (0, pii_sanitizer_util_1.sanitizeControlChars)(dto.clientName);
        const sanitizedPhone = (0, pii_sanitizer_util_1.sanitizeControlChars)(dto.clientPhone);
        let clientUser = await this.prisma.user.findUnique({
            where: { dni: cleanDni },
        });
        if (clientUser) {
            if (clientUser.role === client_1.Role.CLIENT) {
                clientUser = await this.prisma.user.update({
                    where: { id: clientUser.id },
                    data: {
                        name: sanitizedName || clientUser.name,
                        phone: sanitizedPhone || clientUser.phone,
                    },
                });
            }
        }
        else {
            const csprngGuestSecret = crypto.randomBytes(32).toString('hex');
            const randomPasswordHash = await bcrypt.hash(csprngGuestSecret, 10);
            clientUser = await this.prisma.user.create({
                data: {
                    dni: cleanDni,
                    password: randomPasswordHash,
                    name: sanitizedName,
                    phone: sanitizedPhone,
                    role: client_1.Role.CLIENT,
                },
            });
        }
        const existingSlot = await this.prisma.appointmentSlot.findUnique({
            where: { id: dto.slotId },
            include: { barber: true },
        });
        if (existingSlot) {
            const durationMs = existingSlot.end_time.getTime() - existingSlot.start_time.getTime();
            if (durationMs !== exports.SLOT_DURATION_MS) {
                throw new common_1.BadRequestException('El bloque horario no cumple con la duración estricta de 30 minutos');
            }
            const lockedSlot = await this.prisma.$transaction(async (tx) => {
                const updateResult = await tx.appointmentSlot.updateMany({
                    where: {
                        id: dto.slotId,
                        OR: [
                            { status: client_1.SlotStatus.AVAILABLE },
                            {
                                status: client_1.SlotStatus.PENDING_PAYMENT,
                                locked_until: { lt: now },
                            },
                            {
                                status: client_1.SlotStatus.PENDING_PAYMENT,
                                client_id: clientUser.id,
                            },
                        ],
                    },
                    data: {
                        status: client_1.SlotStatus.PENDING_PAYMENT,
                        client_id: clientUser.id,
                        locked_until: lockedUntil,
                        deposit_amount: exports.PLATFORM_DEPOSIT_ARS,
                    },
                });
                if (updateResult.count === 0) {
                    throw new common_1.ConflictException('Este horario acaba de ser reservado por otra persona. Por favor elegí otro turno disponible.');
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
                    deposit_amount: exports.PLATFORM_DEPOSIT_ARS,
                };
            }
            catch (err) {
                await this.prisma.appointmentSlot
                    .updateMany({
                    where: {
                        id: lockedSlot.id,
                        status: client_1.SlotStatus.PENDING_PAYMENT,
                        client_id: clientUser.id,
                    },
                    data: {
                        status: client_1.SlotStatus.AVAILABLE,
                        client_id: null,
                        locked_until: null,
                        mp_preference_id: null,
                    },
                })
                    .catch(() => undefined);
                throw err;
            }
        }
        if (!this.isProductionEnv() && dto.slotId.startsWith('slot_')) {
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
                deposit_amount: exports.PLATFORM_DEPOSIT_ARS,
            };
        }
        throw new common_1.NotFoundException('El turno seleccionado no existe.');
    }
    async createDepositPreference(params) {
        const mpAccessToken = (this.configService.get('MP_ACCESS_TOKEN') || '').trim();
        const appPublicUrl = (this.configService.get('FRONTEND_URL') ||
            this.configService.get('PUBLIC_APP_URL') ||
            'http://localhost:5173')
            .trim()
            .replace(/\/+$/, '');
        const webhookUrl = (this.configService.get('MP_WEBHOOK_URL') || '').trim();
        const returnBaseUrl = params.barberSlug
            ? `${appPublicUrl}/${encodeURIComponent(params.barberSlug)}`
            : appPublicUrl;
        const isHttpsFrontend = appPublicUrl.startsWith('https://');
        const isHttpsWebhook = webhookUrl.startsWith('https://') && !webhookUrl.includes('localhost');
        const preferencePayload = {
            items: [
                {
                    id: params.slotId,
                    title: `Seña de Turno (30 min) - ${(0, pii_sanitizer_util_1.sanitizeControlChars)(params.shopName)}`,
                    description: `Reserva de turno para DNI ${(0, pii_sanitizer_util_1.maskDni)(params.clientDni)}`,
                    quantity: 1,
                    currency_id: 'ARS',
                    unit_price: exports.PLATFORM_DEPOSIT_ARS,
                },
            ],
            payer: {
                name: (0, pii_sanitizer_util_1.sanitizeControlChars)(params.clientName) ||
                    `Cliente DNI ${(0, pii_sanitizer_util_1.maskDni)(params.clientDni)}`,
                identification: {
                    type: 'DNI',
                    number: params.clientDni,
                },
            },
            external_reference: params.slotId,
            back_urls: {
                success: `${returnBaseUrl}?payment_status=approved&slot=${encodeURIComponent(params.slotId)}`,
                failure: `${returnBaseUrl}?payment_status=rejected&slot=${encodeURIComponent(params.slotId)}`,
                pending: `${returnBaseUrl}?payment_status=pending&slot=${encodeURIComponent(params.slotId)}`,
            },
            ...(isHttpsFrontend ? { auto_return: 'approved' } : {}),
            ...(isHttpsWebhook ? { notification_url: webhookUrl } : {}),
            statement_descriptor: 'TURNERO BARBER',
        };
        const isPlaceholderToken = !mpAccessToken ||
            mpAccessToken.includes('CENTRAL-PLATFORM-TOKEN') ||
            mpAccessToken === 'TEST-000000';
        if (isPlaceholderToken) {
            throw new common_1.BadGatewayException('No se configuró un MP_ACCESS_TOKEN válido de Mercado Pago en el servidor.');
        }
        let response;
        try {
            response = await fetch('https://api.mercadopago.com/checkout/preferences', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${mpAccessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(preferencePayload),
            });
        }
        catch (err) {
            this.logger.error(`Error de red conectando con Mercado Pago: ${err.message}`);
            throw new common_1.BadGatewayException('No se pudo conectar con Mercado Pago. Intentá nuevamente en unos segundos.');
        }
        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            this.logger.error(`Mercado Pago rechazó la creación de preferencia (${response.status}): ${errorText}`);
            throw new common_1.BadGatewayException('Mercado Pago no pudo generar el link de pago en este momento.');
        }
        const data = (await response.json());
        return {
            preference_id: data.id,
            init_point: data.init_point,
            sandbox_init_point: data.sandbox_init_point || data.init_point,
            deposit_amount: exports.PLATFORM_DEPOSIT_ARS,
            external_reference: params.slotId,
            is_sandbox_local: false,
        };
    }
    async confirmPaymentReturn(dto) {
        const slotId = (dto.slotId || dto.external_reference || '').trim();
        const rawPaymentId = (dto.paymentId ||
            dto.payment_id ||
            dto.collection_id ||
            '').trim();
        const rawStatus = (dto.status || dto.collection_status || '')
            .trim()
            .toLowerCase();
        if (!slotId && !rawPaymentId) {
            throw new common_1.BadRequestException('Se requiere slotId o paymentId para verificar el retorno del pago');
        }
        if (slotId &&
            (rawStatus === 'rejected' ||
                rawStatus === 'failure' ||
                rawStatus === 'cancelled' ||
                rawStatus === 'null')) {
            const released = await this.prisma.appointmentSlot.updateMany({
                where: {
                    id: slotId,
                    status: client_1.SlotStatus.PENDING_PAYMENT,
                },
                data: {
                    status: client_1.SlotStatus.AVAILABLE,
                    client_id: null,
                    locked_until: null,
                    mp_preference_id: null,
                },
            });
            return {
                processed: false,
                released: released.count > 0,
                slot_id: slotId,
                status: client_1.SlotStatus.AVAILABLE,
                reason: 'El pago fue rechazado o cancelado y el horario fue liberado.',
            };
        }
        if (slotId) {
            const existingSlot = await this.prisma.appointmentSlot.findUnique({
                where: { id: slotId },
                include: {
                    barber: { include: { user: true } },
                    client: true,
                    reminders: { orderBy: { created_at: 'desc' }, take: 1 },
                },
            });
            if (existingSlot && existingSlot.status === client_1.SlotStatus.CONFIRMED) {
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
        if (rawPaymentId) {
            return this.handleWebhook({
                type: 'payment',
                payment_id: rawPaymentId,
                ...(slotId ? { external_reference: slotId } : {}),
                ...(rawStatus ? { status: rawStatus } : {}),
            }, {});
        }
        if (!this.isProductionEnv() && slotId && rawStatus === 'approved') {
            return this.handleWebhook({
                type: 'payment',
                payment_id: `mp_sim_return_${slotId}`,
                external_reference: slotId,
                status: 'approved',
            }, {});
        }
        return {
            received: true,
            processed: false,
            slot_id: slotId,
            status: rawStatus || 'pending',
            reason: 'Pago pendiente de confirmación por Mercado Pago',
        };
    }
    async handleWebhook(body = {}, query = {}, signatureHeaders) {
        const rawPaymentId = body?.data?.id ||
            query?.['data.id'] ||
            body?.id ||
            query?.id ||
            body?.payment_id;
        const paymentId = rawPaymentId !== undefined && rawPaymentId !== null
            ? (0, pii_sanitizer_util_1.sanitizeControlChars)(String(rawPaymentId))
            : undefined;
        const eventType = (0, pii_sanitizer_util_1.sanitizeControlChars)(String(body?.type || query?.type || body?.action || query?.topic || 'unknown'));
        this.logger.log(`Webhook MP recibido: type=${eventType}, id=${paymentId}`);
        if (!paymentId || paymentId === '123456') {
            return { received: true, simulated: true };
        }
        const webhookSecret = (this.configService.get('MP_WEBHOOK_SECRET') || '').trim();
        if (webhookSecret && signatureHeaders?.xSignature) {
            const isValidSig = this.verifyMercadoPagoWebhookSignature(paymentId, signatureHeaders.xSignature, signatureHeaders.xRequestId, webhookSecret);
            if (!isValidSig) {
                this.logger.warn(`[SECURITY_AUDIT] event=WEBHOOK_SIGNATURE_INVALID paymentId=${paymentId}`);
                return {
                    received: true,
                    processed: false,
                    error: 'Invalid webhook signature',
                };
            }
        }
        const mpPaymentId = paymentId;
        const alreadyProcessedSlot = await this.prisma.appointmentSlot.findUnique({
            where: { mp_payment_id: mpPaymentId },
            include: {
                barber: { include: { user: true } },
                reminders: { orderBy: { created_at: 'desc' }, take: 1 },
            },
        });
        if (alreadyProcessedSlot) {
            this.logger.log(`[Idempotencia] Pago mp_payment_id=${mpPaymentId} ya fue procesado para el slot ${alreadyProcessedSlot.id}`);
            const latestRem = alreadyProcessedSlot.reminders?.[0];
            return {
                received: true,
                processed: true,
                idempotent: true,
                status: alreadyProcessedSlot.status,
                slot_id: alreadyProcessedSlot.id,
                mp_payment_id: mpPaymentId,
                deposit_amount: alreadyProcessedSlot.deposit_amount,
                start_time: alreadyProcessedSlot.start_time.toISOString(),
                end_time: alreadyProcessedSlot.end_time.toISOString(),
                barber_phone: alreadyProcessedSlot.barber?.user?.phone,
                shop_name: alreadyProcessedSlot.barber?.shop_name,
                barber_slug: alreadyProcessedSlot.barber?.slug,
                reminder_enqueued: Boolean(latestRem),
                reminder_id: latestRem?.id || null,
                reminder_message: latestRem?.generated_message || null,
            };
        }
        const paymentDetails = await this.resolvePaymentDetails(mpPaymentId, body);
        if (!paymentDetails) {
            return { received: true, processed: false, error: 'Payment not found or unverified' };
        }
        if (paymentDetails.status !== 'approved') {
            this.logger.log(`Pago ${mpPaymentId} recibido con estado "${paymentDetails.status}" (no aprobado). Ignorando confirmación.`);
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
            this.logger.warn(`El pago ${mpPaymentId} está aprobado pero no posee external_reference (slotId). Ignorando.`);
            return { received: true, processed: false, error: 'Missing external_reference' };
        }
        let transitionResult = null;
        try {
            transitionResult = await this.prisma.$transaction(async (tx) => {
                const slot = await tx.appointmentSlot.findUnique({
                    where: { id: paymentDetails.externalReference },
                    include: {
                        barber: {
                            include: { user: true },
                        },
                        client: true,
                        reminders: { orderBy: { created_at: 'desc' }, take: 1 },
                    },
                });
                if (!slot) {
                    return null;
                }
                if (slot.status === client_1.SlotStatus.CONFIRMED) {
                    return { slot, alreadyConfirmed: true };
                }
                const updated = await tx.appointmentSlot.update({
                    where: { id: slot.id },
                    data: {
                        status: client_1.SlotStatus.CONFIRMED,
                        mp_payment_id: mpPaymentId,
                        locked_until: null,
                        deposit_amount: exports.PLATFORM_DEPOSIT_ARS,
                    },
                    include: {
                        barber: {
                            include: { user: true },
                        },
                        client: true,
                        reminders: { orderBy: { created_at: 'desc' }, take: 1 },
                    },
                });
                return { slot: updated, alreadyConfirmed: false };
            });
        }
        catch (err) {
            if (err instanceof client_1.Prisma.PrismaClientKnownRequestError &&
                err.code === 'P2002') {
                const existing = await this.prisma.appointmentSlot.findUnique({
                    where: { mp_payment_id: mpPaymentId },
                    include: { barber: { include: { user: true } } },
                });
                if (existing) {
                    return {
                        received: true,
                        processed: true,
                        idempotent: true,
                        slot_id: existing.id,
                        status: existing.status,
                        mp_payment_id: mpPaymentId,
                        start_time: existing.start_time.toISOString(),
                        end_time: existing.end_time.toISOString(),
                        barber_phone: existing.barber?.user?.phone,
                        shop_name: existing.barber?.shop_name,
                    };
                }
            }
            throw err;
        }
        if (!transitionResult || !transitionResult.slot) {
            this.logger.warn(`No existe el turno (slot) con id ${paymentDetails.externalReference} para el pago ${mpPaymentId}`);
            return { received: true, processed: false, error: 'Slot not found' };
        }
        const { slot: confirmedSlot, alreadyConfirmed } = transitionResult;
        if (alreadyConfirmed) {
            const existingReminder = confirmedSlot.reminders?.[0];
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
                barber_phone: confirmedSlot.barber.user.phone,
                shop_name: confirmedSlot.barber.shop_name,
                barber_slug: confirmedSlot.barber.slug,
                reminder_enqueued: Boolean(existingReminder),
                reminder_id: existingReminder?.id || null,
                reminder_message: existingReminder?.generated_message || null,
            };
        }
        let reminderRecord = null;
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
    async resolvePaymentDetails(mpPaymentId, body) {
        const isProd = this.isProductionEnv();
        const mpAccessToken = (this.configService.get('MP_ACCESS_TOKEN') || '').trim();
        const isPlaceholderToken = !mpAccessToken ||
            mpAccessToken.includes('CENTRAL-PLATFORM-TOKEN') ||
            mpAccessToken === 'TEST-000000';
        const isSimulatedId = mpPaymentId.startsWith('mp_pay_') || mpPaymentId.startsWith('mp_sim_');
        if (!isProd && body?.external_reference && body?.status && (isPlaceholderToken || isSimulatedId)) {
            return {
                status: String(body.status),
                externalReference: String(body.external_reference),
            };
        }
        if (isPlaceholderToken) {
            this.logger.warn(`No hay MP_ACCESS_TOKEN válido para consultar el pago ${mpPaymentId} en Mercado Pago.`);
            return null;
        }
        try {
            const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(mpPaymentId)}`, {
                headers: {
                    Authorization: `Bearer ${mpAccessToken}`,
                },
            });
            if (!response.ok) {
                const errorBody = await response.text().catch(() => '');
                this.logger.warn(`Consulta de pago MP ${mpPaymentId} devolvió status ${response.status}: ${errorBody}`);
                return null;
            }
            const paymentData = (await response.json());
            if (!paymentData || !paymentData.status) {
                this.logger.warn(`Respuesta de MP para pago ${mpPaymentId} no contiene status válido.`);
                return null;
            }
            if (typeof paymentData.transaction_amount === 'number' &&
                paymentData.transaction_amount < exports.PLATFORM_DEPOSIT_ARS) {
                this.logger.warn(`Pago ${mpPaymentId} rechazado por monto insuficiente (${paymentData.transaction_amount} < ${exports.PLATFORM_DEPOSIT_ARS}).`);
                return null;
            }
            return {
                status: paymentData.status,
                externalReference: paymentData.external_reference,
            };
        }
        catch (error) {
            this.logger.warn(`Error consultando pago ${mpPaymentId} en Mercado Pago: ${error.message}`);
            return null;
        }
    }
    verifyMercadoPagoWebhookSignature(dataId, xSignature, xRequestId, secret) {
        try {
            const parts = xSignature.split(',');
            let ts = '';
            let v1 = '';
            for (const part of parts) {
                const [k, v] = part.split('=').map((s) => s.trim());
                if (k === 'ts')
                    ts = v || '';
                if (k === 'v1')
                    v1 = v || '';
            }
            if (!ts || !v1) {
                return false;
            }
            const manifest = `id:${dataId.toLowerCase()};${xRequestId ? `request-id:${xRequestId};` : ''}ts:${ts};`;
            const expectedHex = crypto
                .createHmac('sha256', secret)
                .update(manifest)
                .digest('hex');
            const bufA = Buffer.from(v1, 'hex');
            const bufB = Buffer.from(expectedHex, 'hex');
            if (bufA.length !== bufB.length || bufA.length === 0) {
                return false;
            }
            return crypto.timingSafeEqual(bufA, bufB);
        }
        catch {
            return false;
        }
    }
};
exports.PaymentsService = PaymentsService;
exports.PaymentsService = PaymentsService = PaymentsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, common_1.Inject)(reminder_interface_1.REMINDER_PROVIDER)),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService,
        mail_service_1.MailService, Object])
], PaymentsService);
//# sourceMappingURL=payments.service.js.map