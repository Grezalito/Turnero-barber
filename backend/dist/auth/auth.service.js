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
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const client_1 = require("@prisma/client");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const admin_service_1 = require("../admin/admin.service");
const prisma_service_1 = require("../prisma/prisma.service");
const pii_sanitizer_util_1 = require("../security/pii-sanitizer.util");
const TIMING_SAFE_DUMMY_BCRYPT_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
let AuthService = AuthService_1 = class AuthService {
    constructor(prisma, jwtService) {
        this.prisma = prisma;
        this.jwtService = jwtService;
        this.logger = new common_1.Logger(AuthService_1.name);
    }
    timingSafeStringEqual(a, b) {
        const hashA = crypto.createHash('sha256').update(String(a)).digest();
        const hashB = crypto.createHash('sha256').update(String(b)).digest();
        return crypto.timingSafeEqual(hashA, hashB);
    }
    async ensureUniqueSlug(rawSource) {
        const baseSlug = (0, admin_service_1.generateSlug)(rawSource) ||
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
    async login(dto) {
        const cleanDni = dto.dni.replace(/\D/g, '');
        const isProd = (process.env.NODE_ENV || '').toLowerCase() === 'production';
        const superAdminDni = (process.env.SUPERADMIN_DNI || (isProd ? '' : '00000000')).trim();
        const superAdminPassword = process.env.SUPERADMIN_PASSWORD || (isProd ? '' : 'adminPassword123!');
        const isSuperAdminMatch = Boolean(superAdminDni && superAdminPassword) &&
            this.timingSafeStringEqual(cleanDni, superAdminDni) &&
            this.timingSafeStringEqual(dto.password, superAdminPassword);
        if (isSuperAdminMatch) {
            const hashedAdminPassword = await bcrypt.hash(superAdminPassword, 10);
            const superAdminUser = await this.prisma.user.upsert({
                where: { dni: superAdminDni },
                update: {
                    role: client_1.Role.SUPERADMIN,
                    password: hashedAdminPassword,
                },
                create: {
                    dni: superAdminDni,
                    password: hashedAdminPassword,
                    name: 'SuperAdmin Plataforma',
                    phone: '+5491100000000',
                    email: 'admin@turnero-barber.com',
                    role: client_1.Role.SUPERADMIN,
                },
                include: { barber_profile: true },
            });
            const payload = {
                sub: superAdminUser.id,
                dni: superAdminUser.dni,
                role: superAdminUser.role,
            };
            this.logger.log(`[SECURITY_AUDIT] event=AUTH_LOGIN_SUCCESS role=SUPERADMIN dni=${(0, pii_sanitizer_util_1.maskDni)(cleanDni)}`);
            return {
                access_token: await this.jwtService.signAsync(payload),
                user: {
                    id: superAdminUser.id,
                    dni: superAdminUser.dni,
                    name: superAdminUser.name,
                    phone: superAdminUser.phone,
                    email: superAdminUser.email,
                    role: superAdminUser.role,
                    barber_profile: superAdminUser.barber_profile,
                },
            };
        }
        let user = await this.prisma.user.findUnique({
            where: { dni: cleanDni },
            include: { barber_profile: true },
        });
        if (!user) {
            await bcrypt.compare(dto.password, TIMING_SAFE_DUMMY_BCRYPT_HASH);
            this.logger.warn(`[SECURITY_AUDIT] event=AUTH_LOGIN_FAILED reason=INVALID_CREDENTIALS dni=${(0, pii_sanitizer_util_1.maskDni)(cleanDni)}`);
            throw new common_1.UnauthorizedException('DNI o contraseña incorrectos');
        }
        const isPasswordValid = await bcrypt.compare(dto.password, user.password);
        if (!isPasswordValid) {
            this.logger.warn(`[SECURITY_AUDIT] event=AUTH_LOGIN_FAILED reason=INVALID_PASSWORD dni=${(0, pii_sanitizer_util_1.maskDni)(cleanDni)} role=${user.role}`);
            throw new common_1.UnauthorizedException('DNI o contraseña incorrectos');
        }
        if (user.role === client_1.Role.BARBER && !user.barber_profile) {
            const shopName = `Barbería ${user.name}`;
            const uniqueSlug = await this.ensureUniqueSlug(shopName);
            user = await this.prisma.user.update({
                where: { id: user.id },
                data: {
                    barber_profile: {
                        create: {
                            shop_name: shopName,
                            slug: uniqueSlug,
                            reminder_addon_active: false,
                        },
                    },
                },
                include: { barber_profile: true },
            });
        }
        const payload = {
            sub: user.id,
            dni: user.dni,
            role: user.role,
            slug: user.barber_profile?.slug || undefined,
        };
        this.logger.log(`[SECURITY_AUDIT] event=AUTH_LOGIN_SUCCESS role=${user.role} dni=${(0, pii_sanitizer_util_1.maskDni)(cleanDni)}`);
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
        const cleanDni = dto.dni.replace(/\D/g, '');
        const existing = await this.prisma.user.findUnique({
            where: { dni: cleanDni },
        });
        if (existing) {
            throw new common_1.ConflictException('Ya existe un usuario registrado con ese DNI');
        }
        const hashedPassword = await bcrypt.hash(dto.password, 10);
        const user = await this.prisma.user.create({
            data: {
                dni: cleanDni,
                password: hashedPassword,
                name: (0, pii_sanitizer_util_1.sanitizeControlChars)(dto.name),
                phone: (0, pii_sanitizer_util_1.sanitizeControlChars)(dto.phone),
                email: dto.email ? (0, pii_sanitizer_util_1.sanitizeControlChars)(dto.email) : null,
                role: client_1.Role.CLIENT,
            },
        });
        const payload = {
            sub: user.id,
            dni: user.dni,
            role: user.role,
        };
        this.logger.log(`[SECURITY_AUDIT] event=CLIENT_REGISTERED dni=${(0, pii_sanitizer_util_1.maskDni)(cleanDni)}`);
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
        let profile = await this.prisma.user.findUnique({
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
        if (profile && profile.role === client_1.Role.BARBER && !profile.barber_profile) {
            const shopName = `Barbería ${profile.name}`;
            const uniqueSlug = await this.ensureUniqueSlug(shopName);
            profile = await this.prisma.user.update({
                where: { id: profile.id },
                data: {
                    barber_profile: {
                        create: {
                            shop_name: shopName,
                            slug: uniqueSlug,
                            reminder_addon_active: false,
                        },
                    },
                },
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
        return profile;
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService])
], AuthService);
//# sourceMappingURL=auth.service.js.map