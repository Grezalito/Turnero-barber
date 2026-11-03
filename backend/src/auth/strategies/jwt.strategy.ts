import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveJwtSecret } from '../jwt-secret.util';

export interface JwtPayload {
  sub: string;
  dni: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['HS256'],
      issuer: 'turnero-barber-api',
      secretOrKey: resolveJwtSecret(configService.get<string>('JWT_SECRET')),
    });
  }

  /**
   * El token solo es válido si el usuario existe HOY en la base y conserva el rol con el que se emitió.
   * Usuarios borrados, tokens apócrifos o roles degradados/escalados → 401.
   */
  async validate(payload: JwtPayload) {
    const user = payload?.sub
      ? await this.prisma.user.findUnique({
          where: { id: payload.sub },
          select: { id: true, dni: true, name: true, phone: true, role: true },
        })
      : null;

    if (!user || user.role !== payload.role) {
      this.logger.warn(
        `[SECURITY_AUDIT] event=JWT_REJECTED reason=${user ? 'ROLE_MISMATCH' : 'USER_NOT_FOUND'} tokenRole=${payload?.role ?? 'none'}`,
      );
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
