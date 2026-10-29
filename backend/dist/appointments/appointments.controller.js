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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppointmentsController = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const client_1 = require("@prisma/client");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const public_decorator_1 = require("../auth/decorators/public.decorator");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const appointments_service_1 = require("./appointments.service");
const lock_slot_dto_1 = require("./dto/lock-slot.dto");
const manage_slots_dto_1 = require("./dto/manage-slots.dto");
let AppointmentsController = class AppointmentsController {
    constructor(appointmentsService, jwtService) {
        this.appointmentsService = appointmentsService;
        this.jwtService = jwtService;
    }
    async manageBarberSlots(user, dto) {
        return this.appointmentsService.manageBarberSlots(user.sub, dto);
    }
    async getBarberSlots(user) {
        return this.appointmentsService.getBarberSlots(user.sub);
    }
    async getClientSlots(user) {
        return this.appointmentsService.getClientSlots(user.sub);
    }
    async getPublicAvailableSlots(slug) {
        return this.appointmentsService.getPublicAvailableSlotsBySlug(slug);
    }
    async downloadSlotIcs(slotId, res) {
        const { filename, icsContent } = await this.appointmentsService.generateSlotIcsFile(slotId);
        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(icsContent);
    }
    async cancelAppointment(slotId, user) {
        return this.appointmentsService.cancelAppointmentNoRefund(slotId, user);
    }
    async releaseLock(slotId) {
        return this.appointmentsService.releaseSingleLock(slotId);
    }
    async lockSlot(slotId, authHeader, dto) {
        let authenticatedUserId;
        if (authHeader?.startsWith('Bearer ')) {
            const token = authHeader.slice(7);
            try {
                const payload = await this.jwtService.verifyAsync(token);
                authenticatedUserId = payload.sub;
            }
            catch {
            }
        }
        return this.appointmentsService.lockSlot(slotId, authenticatedUserId, dto);
    }
};
exports.AppointmentsController = AppointmentsController;
__decorate([
    (0, common_1.Post)('barber/slots'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.BARBER),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, manage_slots_dto_1.ManageBarberSlotsDto]),
    __metadata("design:returntype", Promise)
], AppointmentsController.prototype, "manageBarberSlots", null);
__decorate([
    (0, common_1.Get)('barber/slots'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.BARBER),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AppointmentsController.prototype, "getBarberSlots", null);
__decorate([
    (0, common_1.Get)('client/my-slots'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AppointmentsController.prototype, "getClientSlots", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('public/:slug'),
    __param(0, (0, common_1.Param)('slug')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AppointmentsController.prototype, "getPublicAvailableSlots", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(':slotId/ics'),
    __param(0, (0, common_1.Param)('slotId')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AppointmentsController.prototype, "downloadSlotIcs", null);
__decorate([
    (0, common_1.Post)(':slotId/cancel'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('slotId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AppointmentsController.prototype, "cancelAppointment", null);
__decorate([
    (0, common_1.Post)(':slotId/release-lock'),
    __param(0, (0, common_1.Param)('slotId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AppointmentsController.prototype, "releaseLock", null);
__decorate([
    (0, common_1.Post)(':slotId/lock'),
    __param(0, (0, common_1.Param)('slotId')),
    __param(1, (0, common_1.Headers)('authorization')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, lock_slot_dto_1.LockSlotDto]),
    __metadata("design:returntype", Promise)
], AppointmentsController.prototype, "lockSlot", null);
exports.AppointmentsController = AppointmentsController = __decorate([
    (0, common_1.Controller)('appointments'),
    __metadata("design:paramtypes", [appointments_service_1.AppointmentsService,
        jwt_1.JwtService])
], AppointmentsController);
//# sourceMappingURL=appointments.controller.js.map