import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
} from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { sanitizeControlChars } from '../security/pii-sanitizer.util';
import { ConfirmReturnDto } from './dto/confirm-return.dto';
import { CreatePreferenceDto } from './dto/create-preference.dto';
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
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Body() body: Record<string, any>,
    @Query() query: Record<string, any>,
    @Headers('x-signature') xSignature?: string,
    @Headers('x-request-id') xRequestId?: string,
  ) {
    const rawPaymentId =
      body?.data?.id ||
      query?.['data.id'] ||
      body?.id ||
      query?.id ||
      body?.payment_id;
    const paymentId =
      rawPaymentId !== undefined && rawPaymentId !== null
        ? sanitizeControlChars(String(rawPaymentId))
        : undefined;
    const eventType = sanitizeControlChars(
      String(
        body?.type || query?.type || body?.action || query?.topic || 'unknown',
      ),
    );

    this.logger.log(`Webhook MP recibido: type=${eventType}, id=${paymentId}`);

    if (!paymentId || paymentId === '123456') {
      return { received: true, simulated: true };
    }

    return this.paymentsService.handleWebhook(body, query, {
      xSignature,
      xRequestId,
    });
  }
}
