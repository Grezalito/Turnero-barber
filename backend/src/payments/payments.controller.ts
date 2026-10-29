import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
} from '@nestjs/common';
import { CreatePreferenceDto } from './dto/create-preference.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('create-preference')
  @HttpCode(HttpStatus.OK)
  async createPreference(@Body() dto: CreatePreferenceDto) {
    return this.paymentsService.createPreferenceForSlot(dto);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Body() body: Record<string, any>,
    @Query() query: Record<string, any>,
  ) {
    const rawPaymentId =
      body?.data?.id ||
      query?.['data.id'] ||
      body?.id ||
      query?.id ||
      body?.payment_id;
    const paymentId =
      rawPaymentId !== undefined && rawPaymentId !== null
        ? String(rawPaymentId)
        : undefined;
    const eventType =
      body?.type || query?.type || body?.action || query?.topic || 'unknown';

    this.logger.log(`Webhook MP recibido: type=${eventType}, id=${paymentId}`);

    if (!paymentId || paymentId === '123456') {
      return { received: true, simulated: true };
    }

    return this.paymentsService.handleWebhook(body, query);
  }
}
