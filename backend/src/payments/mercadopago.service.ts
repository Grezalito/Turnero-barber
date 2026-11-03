import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';

export type WebhookValidationFailureReason =
  | 'MISSING_SIGNATURE'
  | 'MISSING_REQUEST_ID'
  | 'MISSING_DATA_ID'
  | 'MALFORMED_SIGNATURE'
  | 'TIMESTAMP_EXPIRED'
  | 'SIGNATURE_MISMATCH'
  | 'MISSING_SECRET';

export interface WebhookValidationResult {
  isValid: boolean;
  reason?: WebhookValidationFailureReason;
}

export interface ValidateWebhookSignatureParams {
  xSignature?: string | null;
  xRequestId?: string | null;
  dataId?: string | null;
  secret?: string;
  toleranceSeconds?: number;
  now?: () => number;
}

@Injectable()
export class MercadoPagoService {
  private readonly logger = new Logger(MercadoPagoService.name);
  private readonly client: MercadoPagoConfig;
  private readonly preferenceClient: Preference;
  private readonly paymentClient: Payment;

  constructor(private readonly configService: ConfigService) {
    const accessToken = (
      this.configService.get<string>('MP_ACCESS_TOKEN') || ''
    ).trim();

    this.client = new MercadoPagoConfig({
      accessToken,
      options: {
        timeout: 10000,
        maxRetries: 3,
        jitter: true,
      },
    });

    this.preferenceClient = new Preference(this.client);
    this.paymentClient = new Payment(this.client);
  }

  isProductionEnv(): boolean {
    return (
      (this.configService.get<string>('NODE_ENV') || '').toLowerCase() ===
      'production'
    );
  }

  /**
   * Determina si el evento recibido corresponde a una notificación de pago.
   */
  isPaymentNotification(
    type?: string | null,
    action?: string | null,
    topic?: string | null,
  ): boolean {
    const normalizedType = (type || topic || '').toLowerCase().trim();
    const normalizedAction = (action || '').toLowerCase().trim();
    return (
      normalizedType === 'payment' || normalizedAction.startsWith('payment.')
    );
  }

  /**
   * Crea una preferencia de pago en Mercado Pago con una idempotencyKey determinística.
   */
  async createPreference(
    body: Parameters<Preference['create']>[0]['body'],
    requestOptions?: Parameters<Preference['create']>[0]['requestOptions'],
  ): Promise<Awaited<ReturnType<Preference['create']>>> {
    const externalReference = (body as any)?.external_reference || 'default';
    const idempotencyKey =
      requestOptions?.idempotencyKey || `pref-${externalReference}`;

    return this.preferenceClient.create({
      body,
      requestOptions: {
        ...requestOptions,
        idempotencyKey,
      },
    });
  }

  /**
   * Consulta un pago por ID en Mercado Pago.
   */
  async getPayment(
    id: string | number,
    requestOptions?: Parameters<Payment['get']>[0]['requestOptions'],
  ): Promise<Awaited<ReturnType<Payment['get']>>> {
    return this.paymentClient.get({
      id,
      requestOptions,
    });
  }

  /**
   * Validación criptográfica manual de webhook de Mercado Pago con node:crypto.
   * Manifest canónico: id:${dataId};request-id:${xRequestId};ts:${ts};
   */
  validateWebhookSignature(
    params: ValidateWebhookSignatureParams,
  ): WebhookValidationResult {
    const secret = (
      params.secret ??
      this.configService.get<string>('MP_WEBHOOK_SECRET') ??
      ''
    ).trim();

    if (!secret) {
      this.logger.error(
        '[SECURITY_AUDIT] event=WEBHOOK_SIGNATURE_INVALID reason=MISSING_SECRET',
      );
      return { isValid: false, reason: 'MISSING_SECRET' };
    }

    const rawSignature = params.xSignature?.trim();
    if (!rawSignature) {
      this.logger.warn(
        `[SECURITY_AUDIT] event=WEBHOOK_SIGNATURE_INVALID reason=MISSING_SIGNATURE requestId=${params.xRequestId || 'none'}`,
      );
      return { isValid: false, reason: 'MISSING_SIGNATURE' };
    }

    const xRequestId = params.xRequestId?.trim();
    if (!xRequestId) {
      this.logger.warn(
        '[SECURITY_AUDIT] event=WEBHOOK_SIGNATURE_INVALID reason=MISSING_REQUEST_ID requestId=none',
      );
      return { isValid: false, reason: 'MISSING_REQUEST_ID' };
    }

    const rawDataId =
      params.dataId !== undefined && params.dataId !== null
        ? String(params.dataId).trim()
        : '';
    if (!rawDataId) {
      this.logger.warn(
        `[SECURITY_AUDIT] event=WEBHOOK_SIGNATURE_INVALID reason=MISSING_DATA_ID requestId=${xRequestId}`,
      );
      return { isValid: false, reason: 'MISSING_DATA_ID' };
    }
    const dataId = rawDataId.toLowerCase();

    // Parsear x-signature (ts=...,v1=..., partes separadas por coma, split en el primer '=')
    const parts = rawSignature.split(',');
    let ts: string | undefined;
    let v1: string | undefined;

    for (const part of parts) {
      const eqIdx = part.indexOf('=');
      if (eqIdx === -1) continue;
      const key = part.slice(0, eqIdx).trim().toLowerCase();
      const val = part.slice(eqIdx + 1).trim();
      if (key === 'ts') ts = val;
      else if (key === 'v1') v1 = val;
    }

    if (!ts || !v1 || !/^\d+$/.test(ts)) {
      this.logger.warn(
        `[SECURITY_AUDIT] event=WEBHOOK_SIGNATURE_INVALID reason=MALFORMED_SIGNATURE requestId=${xRequestId}`,
      );
      return { isValid: false, reason: 'MALFORMED_SIGNATURE' };
    }

    // Frescura: ts es Unix en segundos (si viene en ms —13 dígitos— convertir)
    const toleranceSecondsConfig = this.configService.get<string | number>(
      'MP_WEBHOOK_TOLERANCE_SECONDS',
    );
    const configuredTolerance =
      toleranceSecondsConfig !== undefined &&
      toleranceSecondsConfig !== null &&
      toleranceSecondsConfig !== ''
        ? Number(toleranceSecondsConfig)
        : 300;
    const toleranceSeconds =
      params.toleranceSeconds ??
      (isNaN(configuredTolerance) ? 300 : configuredTolerance);

    const nowFn = params.now ?? (() => Date.now());
    const nowMs = nowFn();

    const tsNum = Number(ts);
    const tsInSeconds =
      ts.length === 13 || tsNum > 1e11 ? Math.floor(tsNum / 1000) : tsNum;
    const nowInSeconds = Math.floor(nowMs / 1000);
    const driftSeconds = Math.abs(nowInSeconds - tsInSeconds);

    if (driftSeconds > toleranceSeconds) {
      this.logger.warn(
        `[SECURITY_AUDIT] event=WEBHOOK_SIGNATURE_INVALID reason=TIMESTAMP_EXPIRED requestId=${xRequestId}`,
      );
      return { isValid: false, reason: 'TIMESTAMP_EXPIRED' };
    }

    // Manifest exacto: id:${dataId};request-id:${xRequestId};ts:${ts};
    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
    const computedHash = crypto
      .createHmac('sha256', secret)
      .update(manifest)
      .digest('hex');

    // Validar que v1 sea hex válido y comparar con timingSafeEqual sobre buffers de igual longitud
    if (!/^[0-9a-fA-F]+$/.test(v1) || v1.length !== computedHash.length) {
      this.logger.warn(
        `[SECURITY_AUDIT] event=WEBHOOK_SIGNATURE_INVALID reason=SIGNATURE_MISMATCH requestId=${xRequestId}`,
      );
      return { isValid: false, reason: 'SIGNATURE_MISMATCH' };
    }

    const bufReceived = Buffer.from(v1.toLowerCase(), 'utf-8');
    const bufComputed = Buffer.from(computedHash, 'utf-8');

    if (
      bufReceived.length !== bufComputed.length ||
      !crypto.timingSafeEqual(bufReceived, bufComputed)
    ) {
      this.logger.warn(
        `[SECURITY_AUDIT] event=WEBHOOK_SIGNATURE_INVALID reason=SIGNATURE_MISMATCH requestId=${xRequestId}`,
      );
      return { isValid: false, reason: 'SIGNATURE_MISMATCH' };
    }

    return { isValid: true };
  }
}
