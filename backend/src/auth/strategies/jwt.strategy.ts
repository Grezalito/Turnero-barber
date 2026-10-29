import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  dni: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('JWT_SECRET') ||
        'turnero-barber-super-secret-jwt-key-2026',
    });
  }

  async validate(payload: JwtPayload) {
    let user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, dni: true, name: true, phone: true, role: true },
    });

    if (!user && payload.dni) {
      user = await this.prisma.user.findUnique({
        where: { dni: payload.dni },
        select: { id: true, dni: true, name: true, phone: true, role: true },
      });
    }

    if (!user) {
      if (payload.role === 'SUPERADMIN') {
        return {
          sub: payload.sub,
          dni: payload.dni,
          name: 'SuperAdmin Plataforma',
          phone: '+5491100000000',
          role: 'SUPERADMIN',
        };
      }
      throw new UnauthorizedException('Usuario no encontrado o sesión inválida');
    }

    return {
      sub: user.id,
      dni: user.dni,
      name: user.name,
      phone: user.phone,
      role: user.role,
    };
  }
}
