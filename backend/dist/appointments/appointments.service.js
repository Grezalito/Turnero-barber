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
var AppointmentsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppointmentsService = exports.LOCK_DURATION_MS = exports.SLOT_DURATION_MS = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const client_1 = require("@prisma/client");
const bcrypt = require("bcrypt");
const mail_service_1 = require("../mail/mail.service");
const payments_service_1 = require("../payments/payments.service");
const prisma_service_1 = require("../prisma/prisma.service");
const weekly_bonus_util_1 = require("./weekly-bonus.util");
exports.SLOT_DURATION_MS = 30 * 60 * 1000;
exports.LOCK_DURATION_MS = 10 * 60 * 1000;
let AppointmentsService = AppointmentsService_1 = class AppointmentsService {
    constructor(prisma, paymentsService, mailService, jwtService) {
        this.prisma = prisma;
        this.paymentsService = paymentsService;
        this.mailService = mailService;
        this.jwtService = jwtService;
        this.logger = new common_1.Logger(AppointmentsService_1.name);
    }
    async manageBarberSlots(userId, dto) {
        const barber = await this.prisma.barberProfile.findUnique({
            where: { user_id: userId },
        });
        if (!barber) {
            throw new common_1.ForbiddenException('El usuario actual no posee un perfil de barbero asociado');
        }
        if (dto.slot_start_time) {
            const slotStart = this.parseDateTime(dto.slot_start_time, dto.date);
            this.assertAlignedTo30Min(slotStart);
            const slotEnd = new Date(slotStart.getTime() + exports.SLOT_DURATION_MS);
            const existingSlot = await this.prisma.appointmentSlot.findUnique({
                where: {
                    barber_id_start_time: {
                        barber_id: barber.id,
                        start_time: slotStart,
                    },
                },
            });
            if (existingSlot) {
                if (existingSlot.status !== client_1.SlotStatus.AVAILABLE) {
                    throw new common_1.BadRequestException(`No se puede eliminar un turno que está en estado ${existingSlot.status}`);
                }
                await this.prisma.appointmentSlot.delete({
                    where: { id: existingSlot.id },
                });
                return {
                    action: 'DELETED',
                    slot: existingSlot,
                };
            }
            const createdSlot = await this.prisma.appointmentSlot.create({
                data: {
                    barber_id: barber.id,
                    start_time: slotStart,
                    end_time: slotEnd,
                    status: client_1.SlotStatus.AVAILABLE,
                    deposit_amount: payments_service_1.PLATFORM_DEPOSIT_ARS,
                },
            });
            return {
                action: 'CREATED',
                slot: createdSlot,
            };
        }
        if (dto.start_time && dto.end_time) {
            const targetDates = this.resolveTargetDates(dto.date, dto.end_date);
            const slotsToCreate = [];
            let globalRangeStart = null;
            let globalRangeEnd = null;
            for (const currentDate of targetDates) {
                const rangeStart = this.parseDateTime(dto.start_time, currentDate);
                const rangeEnd = this.parseDateTime(dto.end_time, currentDate);
                this.assertAlignedTo30Min(rangeStart);
                this.assertAlignedTo30Min(rangeEnd);
                if (rangeEnd.getTime() <= rangeStart.getTime()) {
                    throw new common_1.BadRequestException('El horario de fin debe ser posterior al horario de inicio');
                }
                const totalDiffMs = rangeEnd.getTime() - rangeStart.getTime();
                if (totalDiffMs % exports.SLOT_DURATION_MS !== 0) {
                    throw new common_1.BadRequestException('El rango horario debe ser múltiplo exacto de 30 minutos');
                }
                let breakStartMs = null;
                let breakEndMs = null;
                if (dto.break_start_time && dto.break_end_time) {
                    const breakStart = this.parseDateTime(dto.break_start_time, currentDate);
                    const breakEnd = this.parseDateTime(dto.break_end_time, currentDate);
                    this.assertAlignedTo30Min(breakStart);
                    this.assertAlignedTo30Min(breakEnd);
                    if (breakEnd.getTime() <= breakStart.getTime()) {
                        throw new common_1.BadRequestException('El fin del descanso debe ser posterior al inicio del descanso');
                    }
                    breakStartMs = breakStart.getTime();
                    breakEndMs = breakEnd.getTime();
                }
                if (!globalRangeStart || rangeStart < globalRangeStart) {
                    globalRangeStart = rangeStart;
                }
                if (!globalRangeEnd || rangeEnd > globalRangeEnd) {
                    globalRangeEnd = rangeEnd;
                }
                for (let cursor = rangeStart.getTime(); cursor < rangeEnd.getTime(); cursor += exports.SLOT_DURATION_MS) {
                    if (breakStartMs !== null &&
                        breakEndMs !== null &&
                        cursor >= breakStartMs &&
                        cursor < breakEndMs) {
                        continue;
                    }
                    slotsToCreate.push({
                        barber_id: barber.id,
                        start_time: new Date(cursor),
                        end_time: new Date(cursor + exports.SLOT_DURATION_MS),
                        status: client_1.SlotStatus.AVAILABLE,
                        deposit_amount: payments_service_1.PLATFORM_DEPOSIT_ARS,
                    });
                }
            }
            const created = await this.prisma.appointmentSlot.createMany({
                data: slotsToCreate,
                skipDuplicates: true,
            });
            const slotsInRange = globalRangeStart && globalRangeEnd
                ? await this.prisma.appointmentSlot.findMany({
                    where: {
                        barber_id: barber.id,
                        start_time: { gte: globalRangeStart },
                        end_time: { lte: globalRangeEnd },
                    },
                    orderBy: { start_time: 'asc' },
                })
                : [];
            return {
                action: 'RANGE_GENERATED',
                days_processed: targetDates.length,
                generated_count: created.count,
                total_blocks_in_range: slotsInRange.length,
                slots: slotsInRange,
            };
        }
        throw new common_1.BadRequestException('Debés enviar un rango (start_time y end_time) o un horario puntual (slot_start_time)');
    }
    async getBarberSlots(userId) {
        const barber = await this.prisma.barberProfile.findUnique({
            where: { user_id: userId },
        });
        if (!barber) {
            throw new common_1.ForbiddenException('El usuario actual no posee un perfil de barbero asociado');
        }
        await this.releaseExpiredLocks();
        const slots = await this.prisma.appointmentSlot.findMany({
            where: { barber_id: barber.id },
            include: {
                client: {
                    select: { id: true, dni: true, name: true, phone: true, email: true },
                },
            },
            orderBy: { start_time: 'asc' },
        });
        const { weekStart, weekEnd } = (0, weekly_bonus_util_1.getWeekBoundsUtc)();
        const weeklyConfirmedCount = slots.filter((s) => s.status === client_1.SlotStatus.CONFIRMED &&
            s.start_time >= weekStart &&
            s.start_time <= weekEnd).length;
        return {
            barber: {
                id: barber.id,
                slug: barber.slug,
                shop_name: barber.shop_name,
                address: barber.address,
                reminder_addon_active: barber.reminder_addon_active,
            },
            weekly_goal: (0, weekly_bonus_util_1.calculateWeeklyGoalMetrics)(weeklyConfirmedCount),
            slots,
        };
    }
    async getClientSlots(userId) {
        await this.releaseExpiredLocks();
        const slots = await this.prisma.appointmentSlot.findMany({
            where: {
                client_id: userId,
                status: {
                    in: [client_1.SlotStatus.CONFIRMED, client_1.SlotStatus.PENDING_PAYMENT],
                },
            },
            include: {
                barber: {
                    select: {
                        id: true,
                        slug: true,
                        shop_name: true,
                        address: true,
                        reminder_addon_active: true,
                        user: {
                            select: {
                                name: true,
                                phone: true,
                            },
                        },
                    },
                },
                reminders: {
                    orderBy: { created_at: 'desc' },
                    take: 1,
                    select: {
                        id: true,
                        status: true,
                        scheduled_for: true,
                        generated_message: true,
                    },
                },
            },
            orderBy: { start_time: 'asc' },
        });
        return {
            slots,
        };
    }
    async generateSlotIcsFile(slotId) {
        const slot = await this.prisma.appointmentSlot.findUnique({
            where: { id: slotId },
            include: {
                barber: {
                    include: { user: true },
                },
                client: true,
            },
        });
        if (!slot) {
            throw new common_1.NotFoundException(`No se encontró el turno con ID ${slotId}`);
        }
        const icsContent = this.mailService.buildIcsCalendar({
            slotId: slot.id,
            shopName: slot.barber.shop_name,
            barberName: slot.barber.user.name,
            barberPhone: slot.barber.user.phone,
            address: slot.barber.address,
            clientName: slot.client?.name || 'Cliente',
            clientDni: slot.client?.dni || 'S/D',
            startTime: slot.start_time,
            endTime: slot.end_time,
            mpPaymentId: slot.mp_payment_id || 'PENDIENTE',
            depositAmountArs: slot.deposit_amount,
        });
        return {
            filename: `turno-${slot.id.slice(0, 8)}.ics`,
            icsContent,
        };
    }
    async cancelAppointmentNoRefund(slotId, user) {
        const slot = await this.prisma.appointmentSlot.findUnique({
            where: { id: slotId },
            include: {
                barber: true,
            },
        });
        if (!slot) {
            throw new common_1.NotFoundException('El turno indicado no existe');
        }
        const isOwnerClient = slot.client_id === user.sub;
        const isOwnerBarber = slot.barber.user_id === user.sub;
        const isSuperAdmin = user.role === client_1.Role.SUPERADMIN;
        if (!isOwnerClient && !isOwnerBarber && !isSuperAdmin) {
            throw new common_1.ForbiddenException('No tenés permisos para cancelar este turno');
        }
        const updatedSlot = await this.prisma.$transaction(async (tx) => {
            await tx.reminderQueue.updateMany({
                where: {
                    slot_id: slot.id,
                    status: client_1.ReminderStatus.PENDING,
                },
                data: {
                    status: client_1.ReminderStatus.CANCELLED,
                },
            });
            return tx.appointmentSlot.update({
                where: { id: slot.id },
                data: {
                    status: client_1.SlotStatus.CANCELLED,
                    locked_until: null,
                },
            });
        });
        this.logger.log(`🚫 Turno ${slot.id} cancelado por usuario ${user.dni}. Seña de $${slot.deposit_amount} ARS retenida (NO REEMBOLSABLE - Sin llamada a refund de Mercado Pago).`);
        return {
            cancelled: true,
            slot_id: updatedSlot.id,
            status: updatedSlot.status,
            refund_executed: false,
            deposit_retained: true,
            deposit_amount_retained_ars: updatedSlot.deposit_amount,
            policy: payments_service_1.NON_REFUNDABLE_DEPOSIT_POLICY,
        };
    }
    async releaseSingleLock(slotId) {
        const result = await this.prisma.appointmentSlot.updateMany({
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
            released: result.count > 0,
            slot_id: slotId,
        };
    }
    async getPublicAvailableSlotsBySlug(slug) {
        await this.releaseExpiredLocks();
        const barber = await this.prisma.barberProfile.findUnique({
            where: { slug },
            include: {
                user: {
                    select: { name: true, phone: true },
                },
            },
        });
        if (!barber) {
            throw new common_1.NotFoundException(`No se encontró ninguna barbería con el identificador "${slug}"`);
        }
        const availableSlots = await this.prisma.appointmentSlot.findMany({
            where: {
                barber_id: barber.id,
                status: client_1.SlotStatus.AVAILABLE,
                start_time: { gte: new Date() },
            },
            orderBy: { start_time: 'asc' },
            select: {
                id: true,
                start_time: true,
                end_time: true,
                status: true,
                deposit_amount: true,
            },
        });
        const groupedByDate = {};
        for (const slot of availableSlots) {
            const dateKey = slot.start_time.toISOString().slice(0, 10);
            if (!groupedByDate[dateKey]) {
                groupedByDate[dateKey] = [];
            }
            groupedByDate[dateKey].push(slot);
        }
        return {
            barber: {
                id: barber.id,
                slug: barber.slug,
                shop_name: barber.shop_name,
                address: barber.address,
                barber_name: barber.user.name,
                barber_phone: barber.user.phone,
            },
            deposit_amount_ars: payments_service_1.PLATFORM_DEPOSIT_ARS,
            slot_duration_minutes: 30,
            dates: groupedByDate,
        };
    }
    async lockSlot(slotId, authenticatedUserId, dto) {
        const resolvedAuth = await this.resolveClientForLock(authenticatedUserId, dto);
        const now = new Date();
        const lockedUntil = new Date(now.getTime() + exports.LOCK_DURATION_MS);
        const lockedSlot = await this.prisma.$transaction(async (tx) => {
            const currentSlot = await tx.appointmentSlot.findUnique({
                where: { id: slotId },
                include: { barber: true },
            });
            if (!currentSlot) {
                throw new common_1.NotFoundException('El turno solicitado no existe');
            }
            const durationMs = currentSlot.end_time.getTime() - currentSlot.start_time.getTime();
            if (durationMs !== exports.SLOT_DURATION_MS) {
                throw new common_1.BadRequestException('El bloque horario no cumple con la duración estricta de 30 minutos');
            }
            const updateResult = await tx.appointmentSlot.updateMany({
                where: {
                    id: slotId,
                    OR: [
                        { status: client_1.SlotStatus.AVAILABLE },
                        {
                            status: client_1.SlotStatus.PENDING_PAYMENT,
                            locked_until: { lt: now },
                        },
                    ],
                },
                data: {
                    status: client_1.SlotStatus.PENDING_PAYMENT,
                    client_id: resolvedAuth.user.id,
                    locked_until: lockedUntil,
                    deposit_amount: payments_service_1.PLATFORM_DEPOSIT_ARS,
                },
            });
            if (updateResult.count === 0) {
                throw new common_1.ConflictException('Este turno de 30 minutos ya fue reservado o está en proceso de pago por otro cliente');
            }
            return tx.appointmentSlot.findUniqueOrThrow({
                where: { id: slotId },
                include: { barber: true },
            });
        });
        const preference = await this.paymentsService.createDepositPreference({
            slotId: lockedSlot.id,
            shopName: lockedSlot.barber.shop_name,
            startTime: lockedSlot.start_time,
            clientDni: resolvedAuth.user.dni,
        });
        const updatedSlot = await this.prisma.appointmentSlot.update({
            where: { id: lockedSlot.id },
            data: {
                mp_preference_id: preference.preference_id,
            },
        });
        return {
            slot: {
                id: updatedSlot.id,
                barber_id: updatedSlot.barber_id,
                client_id: updatedSlot.client_id,
                start_time: updatedSlot.start_time,
                end_time: updatedSlot.end_time,
                status: updatedSlot.status,
                locked_until: updatedSlot.locked_until,
                deposit_amount: updatedSlot.deposit_amount,
                mp_preference_id: updatedSlot.mp_preference_id,
            },
            payment: preference,
            ...(resolvedAuth.access_token && {
                access_token: resolvedAuth.access_token,
                user: resolvedAuth.user,
            }),
        };
    }
    async releaseExpiredLocks() {
        const now = new Date();
        const result = await this.prisma.appointmentSlot.updateMany({
            where: {
                status: client_1.SlotStatus.PENDING_PAYMENT,
                locked_until: {
                    lte: now,
                },
            },
            data: {
                status: client_1.SlotStatus.AVAILABLE,
                client_id: null,
                locked_until: null,
                mp_preference_id: null,
            },
        });
        if (result.count > 0) {
            this.logger.log(`🔓 Cron liberó ${result.count} turno(s) vencido(s) de PENDING_PAYMENT a AVAILABLE`);
        }
        return result.count;
    }
    async resolveClientForLock(authenticatedUserId, dto) {
        if (authenticatedUserId) {
            const existingUser = await this.prisma.user.findUnique({
                where: { id: authenticatedUserId },
            });
            if (existingUser) {
                return {
                    user: {
                        id: existingUser.id,
                        dni: existingUser.dni,
                        name: existingUser.name,
                        phone: existingUser.phone,
                        role: existingUser.role,
                    },
                };
            }
        }
        if (!dto?.dni || !dto?.password) {
            throw new common_1.UnauthorizedException('Debés iniciar sesión con tu DNI y contraseña para señar el turno');
        }
        let user = await this.prisma.user.findUnique({
            where: { dni: dto.dni },
        });
        if (user) {
            const isPasswordValid = await bcrypt.compare(dto.password, user.password);
            if (!isPasswordValid) {
                throw new common_1.UnauthorizedException('DNI o contraseña incorrectos');
            }
            if (dto.email && !user.email) {
                user = await this.prisma.user.update({
                    where: { id: user.id },
                    data: { email: dto.email },
                });
            }
        }
        else {
            const hashedPassword = await bcrypt.hash(dto.password, 10);
            user = await this.prisma.user.create({
                data: {
                    dni: dto.dni,
                    password: hashedPassword,
                    name: dto.name || `Cliente ${dto.dni}`,
                    phone: dto.phone || '',
                    email: dto.email || null,
                    role: client_1.Role.CLIENT,
                },
            });
        }
        const token = await this.jwtService.signAsync({
            sub: user.id,
            dni: user.dni,
            role: user.role,
        });
        return {
            user: {
                id: user.id,
                dni: user.dni,
                name: user.name,
                phone: user.phone,
                role: user.role,
            },
            access_token: token,
        };
    }
    resolveTargetDates(startDate, endDate) {
        if (!startDate) {
            return [''];
        }
        if (!endDate || endDate === startDate) {
            return [startDate];
        }
        const start = new Date(`${startDate}T00:00:00.000Z`);
        const end = new Date(`${endDate}T00:00:00.000Z`);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            throw new common_1.BadRequestException('Formato de rango de fechas inválido');
        }
        if (end.getTime() < start.getTime()) {
            throw new common_1.BadRequestException('La fecha de fin debe ser igual o posterior a la fecha de inicio');
        }
        const diffDays = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
        if (diffDays > 30) {
            throw new common_1.BadRequestException('El rango de fechas no puede superar los 31 días por operación');
        }
        const dates = [];
        for (let i = 0; i <= diffDays; i++) {
            const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
            dates.push(d.toISOString().slice(0, 10));
        }
        return dates;
    }
    parseDateTime(timeOrIso, dateStr) {
        if (/^\d{2}:\d{2}$/.test(timeOrIso)) {
            if (!dateStr) {
                throw new common_1.BadRequestException(`Cuando se envía hora en formato HH:mm (${timeOrIso}), se requiere el campo date (YYYY-MM-DD)`);
            }
            const parsed = new Date(`${dateStr}T${timeOrIso}:00.000Z`);
            if (isNaN(parsed.getTime())) {
                throw new common_1.BadRequestException(`Fecha u hora inválida: ${dateStr} ${timeOrIso}`);
            }
            return parsed;
        }
        const parsed = new Date(timeOrIso);
        if (isNaN(parsed.getTime())) {
            throw new common_1.BadRequestException(`Formato de fecha/hora inválido: ${timeOrIso}`);
        }
        return parsed;
    }
    assertAlignedTo30Min(date) {
        const minutes = date.getUTCMinutes();
        const seconds = date.getUTCSeconds();
        const ms = date.getUTCMilliseconds();
        if ((minutes !== 0 && minutes !== 30) || seconds !== 0 || ms !== 0) {
            throw new common_1.BadRequestException(`Los horarios deben estar alineados a bloques exactos de 30 minutos (:00 o :30). Recibido: ${date.toISOString()}`);
        }
    }
};
exports.AppointmentsService = AppointmentsService;
exports.AppointmentsService = AppointmentsService = AppointmentsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        payments_service_1.PaymentsService,
        mail_service_1.MailService,
        jwt_1.JwtService])
], AppointmentsService);
//# sourceMappingURL=appointments.service.js.map