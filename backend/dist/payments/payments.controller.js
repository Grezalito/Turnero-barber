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
var PaymentsController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentsController = void 0;
const common_1 = require("@nestjs/common");
const public_decorator_1 = require("../auth/decorators/public.decorator");
const create_preference_dto_1 = require("./dto/create-preference.dto");
const payments_service_1 = require("./payments.service");
let PaymentsController = PaymentsController_1 = class PaymentsController {
    constructor(paymentsService) {
        this.paymentsService = paymentsService;
        this.logger = new common_1.Logger(PaymentsController_1.name);
    }
    async createPreference(dto) {
        return this.paymentsService.createPreferenceForSlot(dto);
    }
    async handleWebhook(body, query) {
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
        return this.paymentsService.handleWebhook(body, query);
    }
};
exports.PaymentsController = PaymentsController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('create-preference'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_preference_dto_1.CreatePreferenceDto]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "createPreference", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('webhook'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "handleWebhook", null);
exports.PaymentsController = PaymentsController = PaymentsController_1 = __decorate([
    (0, common_1.Controller)('payments'),
    __metadata("design:paramtypes", [payments_service_1.PaymentsService])
], PaymentsController);
//# sourceMappingURL=payments.controller.js.map