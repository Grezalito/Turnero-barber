import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

const authModuleLogger = new Logger('AuthModule');

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProd =
          (configService.get<string>('NODE_ENV') || '').toLowerCase() ===
          'production';
        const configuredSecret = configService.get<string>('JWT_SECRET')?.trim();

        if (isProd && (!configuredSecret || configuredSecret.length < 32)) {
          authModuleLogger.warn(
            '[SECURITY_AUDIT] event=WEAK_OR_MISSING_JWT_SECRET_IN_PROD recommendation="Configure un JWT_SECRET de al menos 32 bytes de entropía"',
          );
        }

        return {
          secret:
            configuredSecret || 'turnero-barber-super-secret-jwt-key-2026',
          signOptions: {
            algorithm: 'HS256',
            expiresIn: configService.get<string>('JWT_EXPIRES_IN') || '12h',
            issuer: 'turnero-barber-api',
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
