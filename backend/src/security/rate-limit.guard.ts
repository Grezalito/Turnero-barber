import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface RateBucket {
  count: number;
  resetAt: number;
}

/**
 * Guard Global de Limitación de Tasa (Rate Limiting) y Protección Anti-Fuerza Bruta
 * Controles asociados:
 * - SOC 2 (CC6.1 Prevención de fuerza bruta, A1.1 Disponibilidad y gestión de capacidad)
 * - ISO/IEC 27001:2022 (Anexo A.8.5 Autenticación segura, A.8.6 Gestión de capacidad, A.8.16 Monitoreo de actividades)
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  private readonly buckets = new Map<string, RateBucket>();
  private lastCleanup = Date.now();

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    if (!req || !res) {
      return true;
    }

    const now = Date.now();
    if (now - this.lastCleanup > 60_000) {
      this.cleanupExpiredBuckets(now);
      this.lastCleanup = now;
    }

    const ip = this.resolveClientIp(req);
    const path = (req.originalUrl || req.url || '').split('?')[0];
    const method = (req.method || 'GET').toUpperCase();

    const { category, maxRequests, windowMs } = this.resolvePolicy(
      method,
      path,
    );

    const bucketKey = `${category}:${ip}`;
    const existing = this.buckets.get(bucketKey);

    let bucket: RateBucket;
    if (!existing || existing.resetAt <= now) {
      bucket = {
        count: 1,
        resetAt: now + windowMs,
      };
      this.buckets.set(bucketKey, bucket);
    } else {
      existing.count += 1;
      bucket = existing;
    }

    const remaining = Math.max(0, maxRequests - bucket.count);
    const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

    res.setHeader('X-RateLimit-Limit', String(maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > maxRequests) {
      res.setHeader('Retry-After', String(retryAfterSec));
      const requestId =
        (req as Request & { requestId?: string }).requestId || 'n/a';
      this.logger.warn(
        `[SECURITY_AUDIT] Rate limit excedido (${category}) ip=${this.maskIp(ip)} method=${method} path=${path} count=${bucket.count}/${maxRequests} requestId=${requestId}`,
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message:
            'Demasiadas solicitudes desde tu conexión. Por favor aguardá unos segundos antes de volver a intentar.',
          retryAfterSeconds: retryAfterSec,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private resolvePolicy(
    method: string,
    path: string,
  ): {
    category: string;
    maxRequests: number;
    windowMs: number;
  } {
    // 1. Autenticación (Login / Registro): protección estricta contra fuerza bruta de DNI + Password
    if (
      method === 'POST' &&
      (path.startsWith('/auth/login') || path.startsWith('/auth/register'))
    ) {
      return {
        category: 'auth_strict',
        maxRequests: 10,
        windowMs: 60_000,
      };
    }

    // 2. Creación de preferencias de pago y bloqueo de turnos: prevención de acaparamiento malicioso de agenda (DoS de slots)
    if (
      method === 'POST' &&
      (path.startsWith('/payments/create-preference') ||
        path.endsWith('/lock'))
    ) {
      return {
        category: 'slot_checkout',
        maxRequests: 15,
        windowMs: 60_000,
      };
    }

    // 3. Webhooks y confirmación de retorno de pago
    if (
      method === 'POST' &&
      (path.startsWith('/payments/webhook') ||
        path.startsWith('/payments/confirm-return'))
    ) {
      return {
        category: 'payment_callbacks',
        maxRequests: 60,
        windowMs: 60_000,
      };
    }

    // 4. Límite general de API por minuto
    return {
      category: 'api_general',
      maxRequests: 120,
      windowMs: 60_000,
    };
  }

  /**
   * IP del cliente según Express (`req.ip`), que respeta `trust proxy` (configurado en main.ts):
   * solo se confía en la IP agregada por el proxy reverso; los valores de X-Forwarded-For
   * inyectados por el cliente se ignoran, evitando la evasión del rate limit por spoofing.
   */
  private resolveClientIp(req: Request): string {
    return req.ip || req.socket?.remoteAddress || 'unknown';
  }

  private maskIp(ip: string): string {
    if (!ip || ip === 'unknown') {
      return 'unknown';
    }
    if (ip.includes('.')) {
      const parts = ip.split('.');
      if (parts.length === 4) {
        return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
      }
    }
    return ip.slice(0, Math.min(8, ip.length)) + '***';
  }

  private cleanupExpiredBuckets(now: number): void {
    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
  }
}
