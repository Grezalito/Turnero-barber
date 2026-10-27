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
var MockDeepSeekReminderService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockDeepSeekReminderService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let MockDeepSeekReminderService = MockDeepSeekReminderService_1 = class MockDeepSeekReminderService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(MockDeepSeekReminderService_1.name);
    }
    async scheduleForConfirmedSlot(payload) {
        if (!payload.reminderAddonActive) {
            return null;
        }
        const scheduledFor = new Date(payload.startTime.getTime() - 2 * 60 * 60 * 1000);
        const hh = String(payload.startTime.getUTCHours()).padStart(2, '0');
        const mm = String(payload.startTime.getUTCMinutes()).padStart(2, '0');
        const dateStr = payload.startTime.toISOString().slice(0, 10);
        const mockMessage = `[MOCK DeepSeek IA] Hola ${payload.clientName}, te recordamos tu turno de 30 min en ${payload.shopName} el ${dateStr} a las ${hh}:${mm} hs. Seña de $2.000 ARS acreditada.`;
        const createdReminder = await this.prisma.reminderQueue.create({
            data: {
                slot_id: payload.slotId,
                barber_id: payload.barberId,
                client_phone: payload.clientPhone || '+5491100000000',
                scheduled_for: scheduledFor,
                generated_message: mockMessage,
            },
        });
        this.logger.log(`[DeepSeek Stub] Turno CONFIRMED (${payload.slotId}) -> Recordatorio encolado para ${createdReminder.client_phone} (barber_id=${payload.barberId}): "${mockMessage}"`);
        return createdReminder;
    }
};
exports.MockDeepSeekReminderService = MockDeepSeekReminderService;
exports.MockDeepSeekReminderService = MockDeepSeekReminderService = MockDeepSeekReminderService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], MockDeepSeekReminderService);
//# sourceMappingURL=mock-deepseek-reminder.service.js.map