import { Controller, Get, Header } from '@nestjs/common';

/**
 * Liveness probe para Docker HEALTHCHECK y el health check del proveedor de deploy.
 * Intencionalmente sin lógica de negocio ni acceso a la base de datos.
 */
@Controller('health')
export class HealthController {
  @Get()
  @Header('Cache-Control', 'no-store')
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
