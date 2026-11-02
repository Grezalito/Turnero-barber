import { Injectable, NestMiddleware } from '@nestjs/common';
import * as crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { sanitizeControlChars } from './pii-sanitizer.util';

/**
 * Middleware de Endurecimiento de Cabeceras HTTP y Trazabilidad (Correlation ID)
 * Controles asociados:
 * - SOC 2 (CC6.1 Control de Acceso, CC6.6 Seguridad en Tránsito, CC7.2 Monitoreo de Sistema)
 * - ISO/IEC 27001:2022 (Anexo A.8.9 Gestión de configuración, A.8.20 Seguridad en redes, A.8.26 Seguridad en aplicaciones)
 * - ISO/IEC 27701:2019 (Cláusula 6.10.2 Prevención de almacenamiento en caché de PII)
 */
@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incomingRequestId = req.headers['x-request-id'];
    const rawRequestId =
      typeof incomingRequestId === 'string' &&
      /^[a-zA-Z0-9_-]{8,64}$/.test(incomingRequestId)
        ? sanitizeControlChars(incomingRequestId)
        : crypto.randomUUID();

    (req as Request & { requestId?: string }).requestId = rawRequestId;
    res.setHeader('X-Request-Id', rawRequestId);

    // Ocultar huella tecnológica del servidor (ISO 27001 A.8.9)
    res.removeHeader('X-Powered-By');

    // Cabeceras de defensa en profundidad (OWASP / ISO 27001 A.8.26 / SOC 2 CC6.6)
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload',
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), usb=(), payment=(self "https://*.mercadopago.com" "https://*.mercadopago.com.ar")',
    );
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );

    // Evitar almacenamiento en caché de respuestas con PII, credenciales o pagos (ISO 27701)
    const path = req.originalUrl || req.url || '';
    if (
      path.startsWith('/auth') ||
      path.startsWith('/admin') ||
      path.startsWith('/barbers') ||
      path.startsWith('/payments') ||
      path.includes('/barber/slots') ||
      path.includes('/client/my-slots')
    ) {
      res.setHeader(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, proxy-revalidate',
      );
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }

    next();
  }
}
