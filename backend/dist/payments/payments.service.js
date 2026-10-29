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
exports.PaymentsService = exports.NON_REFUNDABLE_DEPOSIT_POLICY = exports.LOCK_DURATION_MS = exports.PLATFORM_DEPOSIT_ARS = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_1 = require("@prisma/client");
const bcrypt = require("bcrypt");
const mail_service_1 = require("../mail/mail.service");
const prisma_service_1 = require("../prisma/prisma.service");
const reminder_interface_1 = require("../reminders/reminder.interface");
exports.PLATFORM_DEPOSIT_ARS = 2000;
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
    async createPreferenceForSlot(dto) {
        const cleanDni = dto.clientDni.replace(/\D/g, '');
        const now = new Date();
        const lockedUntil = new Date(now.getTime() + exports.LOCK_DURATION_MS);
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
        }
        else {
            const defaultPasswordHash = await bcrypt.hash(cleanDni.padStart(6, '0'), 10);
            clientUser = await this.prisma.user.create({
                data: {
                    dni: cleanDni,
                    password: defaultPasswordHash,
                    name: dto.clientName.trim(),
                    phone: dto.clientPhone.trim(),
                    role: client_1.Role.CLIENT,
                },
            });
        }
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
                deposit_amount: exports.PLATFORM_DEPOSIT_ARS,
            };
        }
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
                deposit_amount: exports.PLATFORM_DEPOSIT_ARS,
            };
        }
        throw new common_1.NotFoundException('El turno seleccionado no existe.');
    }
    async createDepositPreference(params) {
        const mpAccessToken = (this.configService.get('MP_ACCESS_TOKEN') || '').trim();
        const appPublicUrl = (this.configService.get('FRONTEND_URL') ||
            this.configService.get('PUBLIC_APP_URL') ||
            'http://localhost:5173').trim();
        const webhookUrl = (this.configService.get('MP_WEBHOOK_URL') || '').trim();
        const isHttpsFrontend = appPublicUrl.startsWith('https://');
        const isHttpsWebhook = webhookUrl.startsWith('https://') && !webhookUrl.includes('localhost');
        const preferencePayload = {
            items: [
                {
                    id: params.slotId,
                    title: `Seña de Turno (30 min) - ${params.shopName}`,
                    description: `Reserva de turno para DNI ${params.clientDni}`,
                    quantity: 1,
                    currency_id: 'ARS',
                    unit_price: exports.PLATFORM_DEPOSIT_ARS,
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
    async handleWebhook(body = {}, query = {}) {
        const rawPaymentId = body?.data?.id ||
            query?.['data.id'] ||
            body?.id ||
            query?.id ||
            body?.payment_id;
        const paymentId = rawPaymentId !== undefined && rawPaymentId !== null
            ? String(rawPaymentId)
            : undefined;
        const eventType = body?.type || query?.type || body?.action || query?.topic || 'unknown';
        this.logger.log(`Webhook MP recibido: type=${eventType}, id=${paymentId}`);
        if (!paymentId || paymentId === '123456') {
            return { received: true, simulated: true };
        }
        const mpPaymentId = paymentId;
        const alreadyProcessedSlot = await this.prisma.appointmentSlot.findUnique({
            where: { mp_payment_id: mpPaymentId },
        });
        if (alreadyProcessedSlot) {
            this.logger.log(`[Idempotencia] Pago mp_payment_id=${mpPaymentId} ya fue procesado para el slot ${alreadyProcessedSlot.id}`);
            return {
                received: true,
                idempotent: true,
                status: alreadyProcessedSlot.status,
                slot_id: alreadyProcessedSlot.id,
                mp_payment_id: mpPaymentId,
            };
        }
        const paymentDetails = await this.resolvePaymentDetails(mpPaymentId, body);
        if (!paymentDetails) {
            return { received: true, error: 'Payment not found or simulated' };
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
            return { received: true, error: 'Payment not found or simulated' };
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
                return null;
            }
            if (slot.status === client_1.SlotStatus.CONFIRMED) {
                return slot;
            }
            return tx.appointmentSlot.update({
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
                },
            });
        });
        if (!confirmedSlot) {
            this.logger.warn(`No existe el turno (slot) con id ${paymentDetails.externalReference} para el pago ${mpPaymentId}`);
            return { received: true, error: 'Payment not found or simulated' };
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
        const mpAccessToken = (this.configService.get('MP_ACCESS_TOKEN') || '').trim();
        const isPlaceholderToken = !mpAccessToken ||
            mpAccessToken.includes('CENTRAL-PLATFORM-TOKEN') ||
            mpAccessToken === 'TEST-000000';
        if (body?.external_reference && body?.status) {
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