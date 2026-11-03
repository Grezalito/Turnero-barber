import {
  BadRequestException,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { MercadoPagoService } from '../mercadopago.service';
import { MercadoPagoWebhookGuard } from './mercadopago-webhook.guard';

describe('MercadoPagoWebhookGuard', () => {
  let guard: MercadoPagoWebhookGuard;
  let mockMercadoPagoService: Partial<MercadoPagoService>;

  beforeEach(() => {
    mockMercadoPagoService = {
      validateWebhookSignature: jest.fn(),
    };
    guard = new MercadoPagoWebhookGuard(
      mockMercadoPagoService as MercadoPagoService,
    );
  });

  function createMockContext(req: {
    query?: Record<string, any>;
    body?: Record<string, any>;
    headers?: Record<string, any>;
  }): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          query: req.query || {},
          body: req.body || {},
          headers: req.headers || {},
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it('lanza BadRequestException (400) si falta x-signature', () => {
    (mockMercadoPagoService.validateWebhookSignature as jest.Mock).mockReturnValue({
      isValid: false,
      reason: 'MISSING_SIGNATURE',
    });

    const context = createMockContext({
      query: { 'data.id': '12345' },
      headers: { 'x-request-id': 'req-1' },
    });

    expect(() => guard.canActivate(context)).toThrow(BadRequestException);
  });

  it('lanza BadRequestException (400) si falta x-request-id', () => {
    (mockMercadoPagoService.validateWebhookSignature as jest.Mock).mockReturnValue({
      isValid: false,
      reason: 'MISSING_REQUEST_ID',
    });

    const context = createMockContext({
      query: { 'data.id': '12345' },
      headers: { 'x-signature': 'ts=123,v1=abc' },
    });

    expect(() => guard.canActivate(context)).toThrow(BadRequestException);
  });

  it('lanza BadRequestException (400) si falta data.id', () => {
    (mockMercadoPagoService.validateWebhookSignature as jest.Mock).mockReturnValue({
      isValid: false,
      reason: 'MISSING_DATA_ID',
    });

    const context = createMockContext({
      headers: { 'x-signature': 'ts=123,v1=abc', 'x-request-id': 'req-1' },
    });

    expect(() => guard.canActivate(context)).toThrow(BadRequestException);
  });

  it('lanza UnauthorizedException (401) si la firma no coincide', () => {
    (mockMercadoPagoService.validateWebhookSignature as jest.Mock).mockReturnValue({
      isValid: false,
      reason: 'SIGNATURE_MISMATCH',
    });

    const context = createMockContext({
      query: { 'data.id': '12345' },
      headers: { 'x-signature': 'ts=123,v1=invalid', 'x-request-id': 'req-1' },
    });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('lanza UnauthorizedException (401) si el timestamp está vencido', () => {
    (mockMercadoPagoService.validateWebhookSignature as jest.Mock).mockReturnValue({
      isValid: false,
      reason: 'TIMESTAMP_EXPIRED',
    });

    const context = createMockContext({
      query: { 'data.id': '12345' },
      headers: { 'x-signature': 'ts=123,v1=expired', 'x-request-id': 'req-1' },
    });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('lanza UnauthorizedException (401) si falta el secret configurado', () => {
    (mockMercadoPagoService.validateWebhookSignature as jest.Mock).mockReturnValue({
      isValid: false,
      reason: 'MISSING_SECRET',
    });

    const context = createMockContext({
      query: { 'data.id': '12345' },
      headers: { 'x-signature': 'ts=123,v1=abc', 'x-request-id': 'req-1' },
    });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('retorna true cuando la firma es válida', () => {
    (mockMercadoPagoService.validateWebhookSignature as jest.Mock).mockReturnValue({
      isValid: true,
    });

    const context = createMockContext({
      query: { 'data.id': '12345' },
      headers: { 'x-signature': 'ts=123,v1=valid', 'x-request-id': 'req-1' },
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('valida también tipos no-payment (sin bypass)', () => {
    (mockMercadoPagoService.validateWebhookSignature as jest.Mock).mockReturnValue({
      isValid: false,
      reason: 'SIGNATURE_MISMATCH',
    });

    // Evento no-payment (ej: merchant_order / qr)
    const context = createMockContext({
      query: { topic: 'merchant_order', 'data.id': 'order-999' },
      headers: { 'x-signature': 'ts=123,v1=wrong', 'x-request-id': 'req-order-1' },
    });

    // Debe validar y rechazar con 401 si la firma es inválida
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(mockMercadoPagoService.validateWebhookSignature).toHaveBeenCalledWith({
      xSignature: 'ts=123,v1=wrong',
      xRequestId: 'req-order-1',
      dataId: 'order-999',
    });
  });
});
