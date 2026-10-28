import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { CreatePreferenceDto } from './dto/create-preference.dto';
import { MercadoPagoWebhookDto } from './dto/mp-webhook.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('create-preference')
  @HttpCode(HttpStatus.OK)
  async createPreference(@Body() dto: CreatePreferenceDto) {
    return this.paymentsService.createPreferenceForSlot(dto);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleMercadoPagoWebhook(
    @Body() dto: MercadoPagoWebhookDto,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.paymentsService.handleWebhook(dto, query);
  }
}
