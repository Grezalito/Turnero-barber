import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { MercadoPagoService } from './mercadopago.service';

describe('MercadoPagoService - Validación Criptográfica Manual', () => {
  const secret = 'test-secret-key-12345678901234567890';
  const toleranceSeconds = 300;

  function createService(env: Record<string, any> = {}): MercadoPagoService {
    const defaultEnv: Record<string, any> = {
      NODE_ENV: 'test',
      MP_ACCESS_TOKEN: 'TEST-TOKEN-123',
      MP_WEBHOOK_SECRET: secret,
      MP_WEBHOOK_TOLERANCE_SECONDS: toleranceSeconds,
      ...env,
    };
    const mockConfigService = {
      get: (key: string) => defaultEnv[key],
    } as unknown as ConfigService;

    return new MercadoPagoService(mockConfigService);
  }

  function generateSignature(params: {
    secretKey?: string;
    dataId?: string;
    requestId?: string;
    ts?: number | string;
  }) {
    const secretKey = params.secretKey ?? secret;
    const ts = params.ts ?? Math.floor(Date.now() / 1000);
    const dataId = (params.dataId ?? '').toLowerCase();
    const requestId = params.requestId ?? '';
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const hash = crypto
      .createHmac('sha256', secretKey)
      .update(manifest)
      .digest('hex');
    const xSignature = `ts=${ts},v1=${hash}`;

    return {
      xSignature,
      xRequestId: params.requestId,
      dataId: params.dataId,
      ts,
      hash,
    };
  }

  it('1. valida exitosamente una firma válida', () => {
    const service = createService();
    const dataId = '123456789';
    const requestId = 'req-valid-1';
    const { xSignature, xRequestId } = generateSignature({
      dataId,
      requestId,
    });

    const result = service.validateWebhookSignature({
      xSignature,
      xRequestId,
      dataId,
    });

    expect(result.isValid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('2. rechaza una firma inválida (hash mismatch)', () => {
    const service = createService();
    const ts = Math.floor(Date.now() / 1000);
    const invalidSignature = `ts=${ts},v1=0000000000000000000000000000000000000000000000000000000000000000`;

    const result = service.validateWebhookSignature({
      xSignature: invalidSignature,
      xRequestId: 'req-invalid-1',
      dataId: '123456789',
    });

    expect(result.isValid).toBe(false);
    expect(result.reason).toBe('SIGNATURE_MISMATCH');
  });

  it('3. rechaza un timestamp vencido en el pasado (> 300s)', () => {
    const nowMs = 1700000500000;
    const nowSec = Math.floor(nowMs / 1000);
    const service = createService();

    const { xSignature, xRequestId, dataId } = generateSignature({
      dataId: '123456789',
      requestId: 'req-past-1',
      ts: nowSec - 400, // 400s en el pasado (> 300s)
    });

    const result = service.validateWebhookSignature({
      xSignature,
      xRequestId,
      dataId,
      now: () => nowMs,
    });

    expect(result.isValid).toBe(false);
    expect(result.reason).toBe('TIMESTAMP_EXPIRED');
  });

  it('4. rechaza un timestamp vencido en el futuro (> 300s)', () => {
    const nowMs = 1700000500000;
    const nowSec = Math.floor(nowMs / 1000);
    const service = createService();

    const { xSignature, xRequestId, dataId } = generateSignature({
      dataId: '123456789',
      requestId: 'req-future-1',
      ts: nowSec + 400, // 400s en el futuro (> 300s)
    });

    const result = service.validateWebhookSignature({
      xSignature,
      xRequestId,
      dataId,
      now: () => nowMs,
    });

    expect(result.isValid).toBe(false);
    expect(result.reason).toBe('TIMESTAMP_EXPIRED');
  });

  it('5. rechaza cuando falta la cabecera x-signature', () => {
    const service = createService();

    const result = service.validateWebhookSignature({
      xSignature: undefined,
      xRequestId: 'req-missing-sig',
      dataId: '123456789',
    });

    expect(result.isValid).toBe(false);
    expect(result.reason).toBe('MISSING_SIGNATURE');
  });

  it('6. rechaza cuando falta la cabecera x-request-id', () => {
    const service = createService();

    const result = service.validateWebhookSignature({
      xSignature: 'ts=1700000000,v1=abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
      xRequestId: undefined,
      dataId: '123456789',
    });

    expect(result.isValid).toBe(false);
    expect(result.reason).toBe('MISSING_REQUEST_ID');
  });

  it('7. rechaza cuando falta data.id', () => {
    const service = createService();

    const result = service.validateWebhookSignature({
      xSignature: 'ts=1700000000,v1=abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
      xRequestId: 'req-missing-data-id',
      dataId: undefined,
    });

    expect(result.isValid).toBe(false);
    expect(result.reason).toBe('MISSING_DATA_ID');
  });

  it('8. rechaza secret ausente también fuera de producción (fail closed)', () => {
    const serviceDevNoSecret = createService({
      NODE_ENV: 'development',
      MP_WEBHOOK_SECRET: '',
    });

    const result = serviceDevNoSecret.validateWebhookSignature({
      xSignature: 'ts=1700000000,v1=anyhash',
      xRequestId: 'req-dev-no-secret',
      dataId: '123456789',
    });

    expect(result.isValid).toBe(false);
    expect(result.reason).toBe('MISSING_SECRET');
  });

  it('9. rechaza secret ausente en producción (fail closed)', () => {
    const serviceProdNoSecret = createService({
      NODE_ENV: 'production',
      MP_WEBHOOK_SECRET: '',
    });

    const result = serviceProdNoSecret.validateWebhookSignature({
      xSignature: 'ts=1700000000,v1=anyhash',
      xRequestId: 'req-prod-no-secret',
      dataId: '123456789',
    });

    expect(result.isValid).toBe(false);
    expect(result.reason).toBe('MISSING_SECRET');
  });

  it('10. normaliza data.id con mayúsculas a minúsculas para el manifest', () => {
    const service = createService();
    const uppercaseDataId = 'ORDER-ABC-123-XYZ';
    const { xSignature, xRequestId } = generateSignature({
      dataId: uppercaseDataId,
      requestId: 'req-case-1',
    });

    const result = service.validateWebhookSignature({
      xSignature,
      xRequestId,
      dataId: uppercaseDataId,
    });

    expect(result.isValid).toBe(true);
  });

  it('11. rechaza v1 con caracteres no-hex sin lanzar excepción', () => {
    const service = createService();
    const ts = Math.floor(Date.now() / 1000);
    const nonHexV1 = 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz';

    const result = service.validateWebhookSignature({
      xSignature: `ts=${ts},v1=${nonHexV1}`,
      xRequestId: 'req-non-hex',
      dataId: '123456789',
    });

    expect(result.isValid).toBe(false);
    expect(result.reason).toBe('SIGNATURE_MISMATCH');
  });

  it('12. rechaza v1 con longitud distinta a 64 hex sin lanzar excepción', () => {
    const service = createService();
    const ts = Math.floor(Date.now() / 1000);

    const result = service.validateWebhookSignature({
      xSignature: `ts=${ts},v1=1234abcd`, // longitud corta
      xRequestId: 'req-short-hash',
      dataId: '123456789',
    });

    expect(result.isValid).toBe(false);
    expect(result.reason).toBe('SIGNATURE_MISMATCH');
  });

  it('13. procesa correctamente ts enviado en milisegundos (13 dígitos)', () => {
    const nowMs = 1700000000000;
    const service = createService();

    // ts en ms (13 dígitos)
    const { xSignature, xRequestId, dataId } = generateSignature({
      dataId: '123456789',
      requestId: 'req-ms-1',
      ts: nowMs,
    });

    const result = service.validateWebhookSignature({
      xSignature,
      xRequestId,
      dataId,
      now: () => nowMs + 10000, // 10 segundos después
    });

    expect(result.isValid).toBe(true);
  });
});
