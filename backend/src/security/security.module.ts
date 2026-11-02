import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module';
import { AllExceptionsSecurityFilter } from './all-exceptions.filter';
import { PrivacyRetentionService } from './privacy-retention.service';
import { RateLimitGuard } from './rate-limit.guard';
import { SecurityHeadersMiddleware } from './security-headers.middleware';

@Module({
  imports: [PrismaModule],
  providers: [
    PrivacyRetentionService,
    RateLimitGuard,
    AllExceptionsSecurityFilter,
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsSecurityFilter,
    },
  ],
  exports: [PrivacyRetentionService, RateLimitGuard],
})
export class SecurityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SecurityHeadersMiddleware).forRoutes('*');
  }
}
