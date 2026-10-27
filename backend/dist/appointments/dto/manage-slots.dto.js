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
exports.ManageBarberSlotsDto = void 0;
const class_validator_1 = require("class-validator");
class ManageBarberSlotsDto {
}
exports.ManageBarberSlotsDto = ManageBarberSlotsDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Matches)(/^\d{4}-\d{2}-\d{2}$/, {
        message: 'date debe tener formato YYYY-MM-DD',
    }),
    __metadata("design:type", String)
], ManageBarberSlotsDto.prototype, "date", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Matches)(/^\d{4}-\d{2}-\d{2}$/, {
        message: 'end_date debe tener formato YYYY-MM-DD',
    }),
    __metadata("design:type", String)
], ManageBarberSlotsDto.prototype, "end_date", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ManageBarberSlotsDto.prototype, "start_time", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ManageBarberSlotsDto.prototype, "end_time", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Matches)(/^\d{2}:(00|30)$/, {
        message: 'break_start_time debe tener formato HH:00 o HH:30',
    }),
    __metadata("design:type", String)
], ManageBarberSlotsDto.prototype, "break_start_time", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Matches)(/^\d{2}:(00|30)$/, {
        message: 'break_end_time debe tener formato HH:00 o HH:30',
    }),
    __metadata("design:type", String)
], ManageBarberSlotsDto.prototype, "break_end_time", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ManageBarberSlotsDto.prototype, "slot_start_time", void 0);
//# sourceMappingURL=manage-slots.dto.js.map