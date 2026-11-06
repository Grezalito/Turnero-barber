import { Module } from '@nestjs/common';
import { MercadoPagoWebhookGuard } from './guards/mercadopago-webhook.guard';
import { MercadoPagoService } from './mercadopago.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, MercadoPagoService, MercadoPagoWebhookGuard],
  exports: [PaymentsService, MercadoPagoService],
})
export class PaymentsModule {}
