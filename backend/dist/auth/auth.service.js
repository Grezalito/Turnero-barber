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
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const client_1 = require("@prisma/client");
const bcrypt = require("bcrypt");
const prisma_service_1 = require("../prisma/prisma.service");
let AuthService = class AuthService {
    constructor(prisma, jwtService) {
        this.prisma = prisma;
        this.jwtService = jwtService;
    }
    async login(dto) {
        const user = await this.prisma.user.findUnique({
            where: { dni: dto.dni },
            include: { barber_profile: true },
        });
        if (!user) {
            throw new common_1.UnauthorizedException('DNI o contraseña incorrectos');
        }
        const isPasswordValid = await bcrypt.compare(dto.password, user.password);
        if (!isPasswordValid) {
            throw new common_1.UnauthorizedException('DNI o contraseña incorrectos');
        }
        const payload = {
            sub: user.id,
            dni: user.dni,
            role: user.role,
        };
        return {
            access_token: await this.jwtService.signAsync(payload),
            user: {
                id: user.id,
                dni: user.dni,
                name: user.name,
                phone: user.phone,
                email: user.email,
                role: user.role,
                barber_profile: user.barber_profile,
            },
        };
    }
    async registerClient(dto) {
        const existing = await this.prisma.user.findUnique({
            where: { dni: dto.dni },
        });
        if (existing) {
            throw new common_1.ConflictException('Ya existe un usuario registrado con ese DNI');
        }
        const hashedPassword = await bcrypt.hash(dto.password, 10);
        const user = await this.prisma.user.create({
            data: {
                dni: dto.dni,
                password: hashedPassword,
                name: dto.name,
                phone: dto.phone,
                email: dto.email || null,
                role: client_1.Role.CLIENT,
            },
        });
        const payload = {
            sub: user.id,
            dni: user.dni,
            role: user.role,
        };
        return {
            access_token: await this.jwtService.signAsync(payload),
            user: {
                id: user.id,
                dni: user.dni,
                name: user.name,
                phone: user.phone,
                email: user.email,
                role: user.role,
            },
        };
    }
    async getProfile(userId) {
        return this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                dni: true,
                name: true,
                phone: true,
                email: true,
                role: true,
                barber_profile: true,
                created_at: true,
            },
        });
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService])
], AuthService);
//# sourceMappingURL=auth.service.js.map