import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { sanitizeControlChars } from './pii-sanitizer.util';

/**
 * Filtro Global de Excepciones y Auditoría de Eventos de Seguridad
 * Controles asociados:
 * - SOC 2 (CC7.2 Detección de anomalías y registro de incidentes, CC6.8 Prevención de fuga de información técnica)
 * - ISO/IEC 27001:2022 (Anexo A.8.15 Registros de auditoría, A.8.28 Codificación segura)
 */
@Catch()
export class AllExceptionsSecurityFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsSecurityFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (!response || !request) {
      return;
    }

    const requestId =
      (request as Request & { requestId?: string }).requestId || 'n/a';
    const path = sanitizeControlChars(request.originalUrl || request.url || '');
    const method = sanitizeControlChars(request.method || 'UNKNOWN');

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    if (isHttpException) {
      const exceptionResponse = exception.getResponse();
      const payload =
        typeof exceptionResponse === 'string'
          ? {
              statusCode: status,
              message: exceptionResponse,
            }
          : (exceptionResponse as Record<string, unknown>);

      // Registrar eventos de seguridad relevantes (accesos denegados, intentos fallidos, límites de tasa)
      if (
        status === HttpStatus.UNAUTHORIZED ||
        status === HttpStatus.FORBIDDEN ||
        status === HttpStatus.TOO_MANY_REQUESTS
      ) {
        this.logger.warn(
          `[SECURITY_AUDIT] event=ACCESS_CONTROL_REJECTED status=${status} method=${method} path=${path} requestId=${requestId}`,
        );
      }

      response.status(status).json({
        ...payload,
        requestId,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Excepción no controlada (500): jamás exponer trazas de pila ni detalles internos de Prisma/SQL al cliente
    const errorMessage =
      exception instanceof Error ? exception.message : 'Unknown internal error';
    this.logger.error(
      `[SECURITY_AUDIT] event=UNHANDLED_INTERNAL_ERROR status=500 method=${method} path=${path} requestId=${requestId} detail="${sanitizeControlChars(errorMessage)}"`,
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message:
        'Ocurrió un error interno procesando la solicitud. Por favor intentá nuevamente.',
      requestId,
      timestamp: new Date().toISOString(),
    });
  }
}
