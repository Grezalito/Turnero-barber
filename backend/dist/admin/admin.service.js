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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminService = void 0;
exports.generateSlug = generateSlug;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const bcrypt = require("bcrypt");
const weekly_bonus_util_1 = require("../appointments/weekly-bonus.util");
const prisma_service_1 = require("../prisma/prisma.service");
function generateSlug(rawText) {
    return rawText
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
}
let AdminService = class AdminService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async ensureUniqueSlug(rawSource) {
        const baseSlug = generateSlug(rawSource) ||
            `barberia-${Math.floor(1000 + Math.random() * 9000)}`;
        const existing = await this.prisma.barberProfile.findUnique({
            where: { slug: baseSlug },
        });
        if (!existing) {
            return baseSlug;
        }
        for (let attempt = 0; attempt < 15; attempt++) {
            const randomSuffix = Math.floor(100 + Math.random() * 900);
            const candidate = `${baseSlug}-${randomSuffix}`;
            const taken = await this.prisma.barberProfile.findUnique({
                where: { slug: candidate },
            });
            if (!taken) {
                return candidate;
            }
        }
        return `${baseSlug}-${Date.now().toString().slice(-4)}`;
    }
    async createBarber(dto) {
        const cleanDni = dto.dni.replace(/\D/g, '');
        const resolvedShopName = (dto.shopName || dto.shop_name || '').trim();
        if (!resolvedShopName) {
            throw new common_1.BadRequestException('El nombre de la barbería (shopName) es obligatorio');
        }
        const existingDni = await this.prisma.user.findUnique({
            where: { dni: cleanDni },
            include: { barber_profile: true },
        });
        if (existingDni && existingDni.barber_profile) {
            throw new common_1.ConflictException(`Ya existe un barbero registrado con el DNI ${cleanDni}`);
        }
        const uniqueSlug = await this.ensureUniqueSlug(dto.slug?.trim() || resolvedShopName);
        const hashedPassword = await bcrypt.hash(dto.password, 10);
        if (existingDni && !existingDni.barber_profile) {
            const updatedUser = await this.prisma.user.update({
                where: { id: existingDni.id },
                data: {
                    name: dto.name.trim(),
                    phone: dto.phone.trim(),
                    email: dto.email?.trim() || existingDni.email || null,
                    password: hashedPassword,
                    role: client_1.Role.BARBER,
                    barber_profile: {
                        create: {
                            shop_name: resolvedShopName,
                            slug: uniqueSlug,
                            address: dto.address?.trim() || null,
                            reminder_addon_active: false,
                        },
                    },
                },
                include: {
                    barber_profile: true,
                },
            });
            const bp = updatedUser.barber_profile;
            return {
                id: bp.id,
                slug: bp.slug,
                shop_name: bp.shop_name,
                address: bp.address,
                reminder_addon_active: bp.reminder_addon_active,
                user: {
                    id: updatedUser.id,
                    dni: updatedUser.dni,
                    name: updatedUser.name,
                    phone: updatedUser.phone,
                    email: updatedUser.email,
                    role: updatedUser.role,
                },
            };
        }
        const createdUser = await this.prisma.user.create({
            data: {
                name: dto.name.trim(),
                dni: cleanDni,
                phone: dto.phone.trim(),
                email: dto.email?.trim() || null,
                password: hashedPassword,
                role: client_1.Role.BARBER,
                barber_profile: {
                    create: {
                        shop_name: resolvedShopName,
                        slug: uniqueSlug,
                        address: dto.address?.trim() || null,
                        reminder_addon_active: false,
                    },
                },
            },
            include: {
                barber_profile: true,
            },
        });
        const barberProfile = createdUser.barber_profile;
        return {
            id: barberProfile.id,
            slug: barberProfile.slug,
            shop_name: barberProfile.shop_name,
            address: barberProfile.address,
            reminder_addon_active: barberProfile.reminder_addon_active,
            user: {
                id: createdUser.id,
                dni: createdUser.dni,
                name: createdUser.name,
                phone: createdUser.phone,
                email: createdUser.email,
                role: createdUser.role,
            },
        };
    }
    async toggleReminderAddon(barberId, dto) {
        const barber = await this.prisma.barberProfile.findUnique({
            where: { id: barberId },
        });
        if (!barber) {
            throw new common_1.NotFoundException(`No se encontró el perfil de barbero con ID ${barberId}`);
        }
        const nextActiveState = typeof dto?.active === 'boolean'
            ? dto.active
            : !barber.reminder_addon_active;
        const updated = await this.prisma.barberProfile.update({
            where: { id: barberId },
            data: {
                reminder_addon_active: nextActiveState,
                ...(dto?.reminder_config !== undefined && {
                    reminder_config: dto.reminder_config,
                }),
            },
            include: {
                user: {
                    select: { id: true, dni: true, name: true, phone: true },
                },
            },
        });
        return {
            id: updated.id,
            slug: updated.slug,
            shop_name: updated.shop_name,
            reminder_addon_active: updated.reminder_addon_active,
            reminder_config: updated.reminder_config,
            user: updated.user,
        };
    }
    async listBarbers() {
        const orphanBarbers = await this.prisma.user.findMany({
            where: {
                role: client_1.Role.BARBER,
                barber_profile: { is: null },
            },
        });
        for (const orphan of orphanBarbers) {
            const fallbackShopName = `Barbería ${orphan.name}`;
            const uniqueSlug = await this.ensureUniqueSlug(fallbackShopName);
            await this.prisma.barberProfile.create({
                data: {
                    user_id: orphan.id,
                    shop_name: fallbackShopName,
                    slug: uniqueSlug,
                    reminder_addon_active: false,
                },
            });
        }
        const barbers = await this.prisma.barberProfile.findMany({
            include: {
                user: {
                    select: {
                        id: true,
                        dni: true,
                        name: true,
                        phone: true,
                        created_at: true,
                    },
                },
                _count: {
                    select: {
                        slots: {
                            where: { status: client_1.SlotStatus.CONFIRMED },
                        },
                    },
                },
            },
            orderBy: { created_at: 'desc' },
        });
        return barbers.map((barber) => ({
            id: barber.id,
            slug: barber.slug,
            shop_name: barber.shop_name,
            address: barber.address,
            reminder_addon_active: barber.reminder_addon_active,
            reminder_config: barber.reminder_config,
            confirmed_appointments_count: barber._count.slots,
            estimated_platform_revenue_ars: barber._count.slots * 2000,
            user: barber.user,
            created_at: barber.created_at,
        }));
    }
    async listWeeklySettlements() {
        const barbers = await this.prisma.barberProfile.findMany({
            include: {
                user: {
                    select: {
                        id: true,
                        dni: true,
                        name: true,
                        phone: true,
                        email: true,
                    },
                },
                slots: {
                    where: { status: client_1.SlotStatus.CONFIRMED },
                    select: { id: true, start_time: true, deposit_amount: true },
                },
                settlements: true,
            },
            orderBy: { created_at: 'desc' },
        });
        const now = new Date();
        const currentWeek = (0, weekly_bonus_util_1.getWeekBoundsUtc)(now);
        const prevWeek1 = (0, weekly_bonus_util_1.getWeekBoundsUtc)(new Date(currentWeek.weekStart.getTime() - 7 * 24 * 60 * 60 * 1000));
        const prevWeek2 = (0, weekly_bonus_util_1.getWeekBoundsUtc)(new Date(currentWeek.weekStart.getTime() - 14 * 24 * 60 * 60 * 1000));
        const weeksToEvaluate = [
            { ...currentWeek, label: 'Semana Actual (Lunes a Domingo)', isCurrent: true },
            { ...prevWeek1, label: 'Semana Anterior (-1 sem)', isCurrent: false },
            { ...prevWeek2, label: 'Hace 2 Semanas (-2 sem)', isCurrent: false },
        ];
        const items = [];
        for (const week of weeksToEvaluate) {
            const weekKeyIso = week.weekStart.toISOString().slice(0, 10);
            for (const barber of barbers) {
                const confirmedInWeek = barber.slots.filter((s) => s.start_time >= week.weekStart && s.start_time <= week.weekEnd).length;
                const metrics = (0, weekly_bonus_util_1.calculateWeeklyGoalMetrics)(confirmedInWeek, week.weekStart);
                const existingSettlement = barber.settlements.find((st) => st.week_start.toISOString().slice(0, 10) === weekKeyIso);
                items.push({
                    id: existingSettlement?.id || `${barber.id}_${weekKeyIso}`,
                    barber_id: barber.id,
                    shop_name: barber.shop_name,
                    slug: barber.slug,
                    barber_name: barber.user.name,
                    barber_dni: barber.user.dni,
                    barber_phone: barber.user.phone,
                    week_start: week.weekStart.toISOString(),
                    week_end: week.weekEnd.toISOString(),
                    week_label: week.label,
                    is_current_week: week.isCurrent,
                    confirmed_slots_count: confirmedInWeek,
                    platform_gross_revenue_ars: confirmedInWeek * 2000,
                    reached_bonus: metrics.earned_bonus_ars > 0,
                    bonus_tier: metrics.tier,
                    bonus_tier_label: metrics.tier_label,
                    amount_to_transfer_ars: metrics.earned_bonus_ars,
                    reminder_ia_bonified: metrics.reminder_ia_bonified,
                    transferred: existingSettlement?.transferred || false,
                    transferred_at: existingSettlement?.transferred_at
                        ? existingSettlement.transferred_at.toISOString()
                        : null,
                });
            }
        }
        return {
            current_week_start: currentWeek.weekStart.toISOString(),
            current_week_end: currentWeek.weekEnd.toISOString(),
            settlements: items,
        };
    }
    async markWeeklySettlementTransferred(barberId, weekStartIso, transferredState = true) {
        const barber = await this.prisma.barberProfile.findUnique({
            where: { id: barberId },
        });
        if (!barber) {
            throw new common_1.NotFoundException(`No se encontró el barbero con ID ${barberId}`);
        }
        const refDate = weekStartIso ? new Date(weekStartIso) : new Date();
        const { weekStart, weekEnd } = (0, weekly_bonus_util_1.getWeekBoundsUtc)(refDate);
        const confirmedCount = await this.prisma.appointmentSlot.count({
            where: {
                barber_id: barberId,
                status: client_1.SlotStatus.CONFIRMED,
                start_time: {
                    gte: weekStart,
                    lte: weekEnd,
                },
            },
        });
        const metrics = (0, weekly_bonus_util_1.calculateWeeklyGoalMetrics)(confirmedCount, weekStart);
        const settlement = await this.prisma.weeklySettlement.upsert({
            where: {
                barber_id_week_start: {
                    barber_id: barberId,
                    week_start: weekStart,
                },
            },
            update: {
                confirmed_slots: confirmedCount,
                bonus_tier: metrics.tier,
                bonus_amount_ars: metrics.earned_bonus_ars,
                reminder_ia_bonified: metrics.reminder_ia_bonified,
                transferred: transferredState,
                transferred_at: transferredState ? new Date() : null,
            },
            create: {
                barber_id: barberId,
                week_start: weekStart,
                week_end: weekEnd,
                confirmed_slots: confirmedCount,
                bonus_tier: metrics.tier,
                bonus_amount_ars: metrics.earned_bonus_ars,
                reminder_ia_bonified: metrics.reminder_ia_bonified,
                transferred: transferredState,
                transferred_at: transferredState ? new Date() : null,
            },
        });
        if (metrics.reminder_ia_bonified && !barber.reminder_addon_active) {
            await this.prisma.barberProfile.update({
                where: { id: barberId },
                data: { reminder_addon_active: true },
            });
        }
        return {
            settlement_id: settlement.id,
            barber_id: barberId,
            week_start: settlement.week_start.toISOString(),
            week_end: settlement.week_end.toISOString(),
            confirmed_slots_count: settlement.confirmed_slots,
            bonus_tier: settlement.bonus_tier,
            amount_to_transfer_ars: settlement.bonus_amount_ars,
            reminder_ia_bonified: settlement.reminder_ia_bonified,
            transferred: settlement.transferred,
            transferred_at: settlement.transferred_at
                ? settlement.transferred_at.toISOString()
                : null,
        };
    }
};
exports.AdminService = AdminService;
exports.AdminService = AdminService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AdminService);
//# sourceMappingURL=admin.service.js.map