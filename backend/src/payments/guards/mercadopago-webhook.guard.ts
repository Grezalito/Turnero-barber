import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { MercadoPagoService } from '../mercadopago.service';

@Injectable()
export class MercadoPagoWebhookGuard implements CanActivate {
  constructor(private readonly mercadoPagoService: MercadoPagoService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const query = (request.query || {}) as Record<string, any>;
    const body = (request.body || {}) as Record<string, any>;
    const headers = (request.headers || {}) as Record<string, any>;

    const xSignature = headers['x-signature'] as string | undefined;
    const xRequestId = headers['x-request-id'] as string | undefined;

    // data.id: primero query['data.id'], fallback body.data.id
    const rawDataId = query?.['data.id'] ?? body?.data?.id;
    const dataId =
      rawDataId !== undefined && rawDataId !== null
        ? String(rawDataId)
        : undefined;

    const result = this.mercadoPagoService.validateWebhookSignature({
      xSignature,
      xRequestId,
      dataId,
    });

    if (!result.isValid) {
      switch (result.reason) {
        case 'MISSING_SIGNATURE':
        case 'MISSING_REQUEST_ID':
        case 'MISSING_DATA_ID':
        case 'MALFORMED_SIGNATURE':
          throw new BadRequestException(
            `Webhook inválido: ${result.reason}`,
          );
        case 'TIMESTAMP_EXPIRED':
        case 'SIGNATURE_MISMATCH':
        case 'MISSING_SECRET':
        default:
          throw new UnauthorizedException(
            `Firma de webhook inválida: ${result.reason}`,
          );
      }
    }

    return true;
  }
}
