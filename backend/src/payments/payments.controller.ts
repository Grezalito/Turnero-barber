import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { MercadoPagoWebhookDto } from './dto/mp-webhook.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleMercadoPagoWebhook(
    @Body() dto: MercadoPagoWebhookDto,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.paymentsService.handleWebhook(dto, query);
  }
}
