import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { sanitizeControlChars } from '../security/pii-sanitizer.util';
import { ConfirmReturnDto } from './dto/confirm-return.dto';
import { CreatePreferenceDto } from './dto/create-preference.dto';
import { MercadoPagoWebhookGuard } from './guards/mercadopago-webhook.guard';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  @Public()
  @Post('create-preference')
  @HttpCode(HttpStatus.OK)
  async createPreference(@Body() dto: CreatePreferenceDto) {
    return this.paymentsService.createPreferenceForSlot(dto);
  }

  @Public()
  @Post('confirm-return')
  @HttpCode(HttpStatus.OK)
  async confirmReturn(@Body() dto: ConfirmReturnDto) {
    return this.paymentsService.confirmPaymentReturn(dto);
  }

  @Public()
  @UseGuards(MercadoPagoWebhookGuard)
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Body() body: Record<string, any>,
    @Query() query: Record<string, any>,
  ) {
    const rawType = String(query?.type || body?.type || '');
    const rawTopic = String(query?.topic || body?.topic || '');
    const rawAction = String(body?.action || query?.action || '');

    const isPayment =
      rawType === 'payment' ||
      rawTopic === 'payment' ||
      rawAction.startsWith('payment.');

    if (!isPayment) {
      this.logger.log(
        `Webhook MP ignorado (evento no payment): type=${rawType || rawTopic || rawAction}`,
      );
      return { received: true, ignored: true };
    }

    const rawPaymentId = query?.['data.id'] ?? body?.data?.id;
    const paymentId =
      rawPaymentId !== undefined && rawPaymentId !== null
        ? sanitizeControlChars(String(rawPaymentId))
        : '';

    this.logger.log(`Webhook MP recibido para procesar: id=${paymentId}`);

    // Responder 200 { received: true } INMEDIATAMENTE y procesar en segundo plano
    setImmediate(async () => {
      try {
        await this.paymentsService.processPaymentNotification(paymentId);
      } catch (error) {
        this.logger.error(
          `Error procesando webhook en segundo plano para paymentId=${paymentId}: ${(error as Error).message}`,
          (error as Error).stack,
        );
      }
    });

    return { received: true };
  }

  @Public()
  @Post('simulate-webhook')
  @HttpCode(HttpStatus.OK)
  async simulateWebhook(@Body() body: Record<string, any>) {
    if (this.paymentsService.isProductionEnv()) {
      throw new NotFoundException('Simulación no disponible en producción');
    }

    return this.paymentsService.simulateWebhook(body);
  }
}
