import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { generateSlug } from '../admin/admin.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  maskDni,
  sanitizeControlChars,
} from '../security/pii-sanitizer.util';
import { LoginDto } from './dto/login.dto';
import { RegisterClientDto } from './dto/register.dto';

// Hash bcrypt precalculado para igualar tiempos de cómputo cuando el DNI no existe (Mitigación de Timing Side-Channel - ISO 27001 A.8.5)
const TIMING_SAFE_DUMMY_BCRYPT_HASH =
  '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  private timingSafeStringEqual(a: string, b: string): boolean {
    const hashA = crypto.createHash('sha256').update(String(a)).digest();
    const hashB = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(hashA, hashB);
  }

  private async ensureUniqueSlug(rawSource: string): Promise<string> {
    const baseSlug =
      generateSlug(rawSource) ||
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

  async login(dto: LoginDto) {
    const cleanDni = dto.dni.replace(/\D/g, '');
    const isProd = (process.env.NODE_ENV || '').toLowerCase() === 'production';
    const superAdminDni = (
      process.env.SUPERADMIN_DNI || (isProd ? '' : '00000000')
    ).trim();
    const superAdminPassword =
      process.env.SUPERADMIN_PASSWORD || (isProd ? '' : 'adminPassword123!');

    const isSuperAdminMatch =
      Boolean(superAdminDni && superAdminPassword) &&
      this.timingSafeStringEqual(cleanDni, superAdminDni) &&
      this.timingSafeStringEqual(dto.password, superAdminPassword);

    if (isSuperAdminMatch) {
      const hashedAdminPassword = await bcrypt.hash(superAdminPassword, 10);
      const superAdminUser = await this.prisma.user.upsert({
        where: { dni: superAdminDni },
        update: {
          role: Role.SUPERADMIN,
          password: hashedAdminPassword,
        },
        create: {
          dni: superAdminDni,
          password: hashedAdminPassword,
          name: 'SuperAdmin Plataforma',
          phone: '+5491100000000',
          email: 'admin@turnero-barber.com',
          role: Role.SUPERADMIN,
        },
        include: { barber_profile: true },
      });

      const payload = {
        sub: superAdminUser.id,
        dni: superAdminUser.dni,
        role: superAdminUser.role,
      };

      this.logger.log(
        `[SECURITY_AUDIT] event=AUTH_LOGIN_SUCCESS role=SUPERADMIN dni=${maskDni(cleanDni)}`,
      );

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
      // Ejecutar bcrypt.compare ficticio para evitar enumeración de DNI por diferencia de tiempo de respuesta (ISO 27001 A.8.5)
      await bcrypt.compare(dto.password, TIMING_SAFE_DUMMY_BCRYPT_HASH);
      this.logger.warn(
        `[SECURITY_AUDIT] event=AUTH_LOGIN_FAILED reason=INVALID_CREDENTIALS dni=${maskDni(cleanDni)}`,
      );
      throw new UnauthorizedException('DNI o contraseña incorrectos');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      this.logger.warn(
        `[SECURITY_AUDIT] event=AUTH_LOGIN_FAILED reason=INVALID_PASSWORD dni=${maskDni(cleanDni)} role=${user.role}`,
      );
      throw new UnauthorizedException('DNI o contraseña incorrectos');
    }

    if (user.role === Role.BARBER && !user.barber_profile) {
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

    this.logger.log(
      `[SECURITY_AUDIT] event=AUTH_LOGIN_SUCCESS role=${user.role} dni=${maskDni(cleanDni)}`,
    );

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

  async registerClient(dto: RegisterClientDto) {
    const cleanDni = dto.dni.replace(/\D/g, '');
    const existing = await this.prisma.user.findUnique({
      where: { dni: cleanDni },
    });

    if (existing) {
      throw new ConflictException('Ya existe un usuario registrado con ese DNI');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        dni: cleanDni,
        password: hashedPassword,
        name: sanitizeControlChars(dto.name),
        phone: sanitizeControlChars(dto.phone),
        email: dto.email ? sanitizeControlChars(dto.email) : null,
        role: Role.CLIENT,
      },
    });

    const payload = {
      sub: user.id,
      dni: user.dni,
      role: user.role,
    };

    this.logger.log(
      `[SECURITY_AUDIT] event=CLIENT_REGISTERED dni=${maskDni(cleanDni)}`,
    );

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

  async getProfile(userId: string) {
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

    if (profile && profile.role === Role.BARBER && !profile.barber_profile) {
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
}
