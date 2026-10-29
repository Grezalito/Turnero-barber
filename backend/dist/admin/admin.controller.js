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
exports.AdminController = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const admin_service_1 = require("./admin.service");
const create_barber_dto_1 = require("./dto/create-barber.dto");
const toggle_reminder_dto_1 = require("./dto/toggle-reminder.dto");
let AdminController = class AdminController {
    constructor(adminService) {
        this.adminService = adminService;
    }
    async createBarber(dto) {
        return this.adminService.createBarber(dto);
    }
    async toggleReminder(barberId, dto) {
        return this.adminService.toggleReminderAddon(barberId, dto);
    }
    async listBarbers() {
        return this.adminService.listBarbers();
    }
    async listWeeklySettlements() {
        return this.adminService.listWeeklySettlements();
    }
    async markWeeklySettlementTransferred(barberId, body) {
        return this.adminService.markWeeklySettlementTransferred(barberId, body?.week_start, body?.transferred);
    }
};
exports.AdminController = AdminController;
__decorate([
    (0, common_1.Post)('barbers'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.SUPERADMIN),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_barber_dto_1.CreateBarberDto]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "createBarber", null);
__decorate([
    (0, common_1.Patch)('barbers/:id/toggle-reminder'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, toggle_reminder_dto_1.ToggleReminderDto]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "toggleReminder", null);
__decorate([
    (0, common_1.Get)('barbers'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "listBarbers", null);
__decorate([
    (0, common_1.Get)('settlements'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "listWeeklySettlements", null);
__decorate([
    (0, common_1.Patch)('settlements/:barberId/transfer'),
    __param(0, (0, common_1.Param)('barberId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "markWeeklySettlementTransferred", null);
exports.AdminController = AdminController = __decorate([
    (0, common_1.Controller)(['admin', '']),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.SUPERADMIN),
    __metadata("design:paramtypes", [admin_service_1.AdminService])
], AdminController);
//# sourceMappingURL=admin.controller.js.map