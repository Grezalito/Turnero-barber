import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MercadoPagoWebhookGuard } from './guards/mercadopago-webhook.guard';
import { MercadoPagoService } from './mercadopago.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

describe('PaymentsController', () => {
  let controller: PaymentsController;
  let paymentsService: Partial<PaymentsService>;

  beforeEach(async () => {
    paymentsService = {
      processPaymentNotification: jest
        .fn()
        .mockResolvedValue({ processed: true }),
      simulateWebhook: jest
        .fn()
        .mockResolvedValue({ received: true, simulated: true }),
      isProductionEnv: jest.fn().mockReturnValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        {
          provide: PaymentsService,
          useValue: paymentsService,
        },
        {
          provide: MercadoPagoService,
          useValue: {
            validateWebhookSignature: jest.fn().mockReturnValue({ isValid: true }),
            isPaymentNotification: jest.fn().mockReturnValue(true),
          },
        },
      ],
    })
      .overrideGuard(MercadoPagoWebhookGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PaymentsController>(PaymentsController);
  });

  it('con firma válida (tras pasar guard) responde { received: true } inmediatamente sin esperar el procesamiento', async () => {
    const response = await controller.handleWebhook(
      { type: 'payment' },
      { 'data.id': 'payment-123', type: 'payment' },
    );

    expect(response).toEqual({ received: true });

    // Esperar a que se ejecute la cola de setImmediate
    await new Promise((resolve) => setImmediate(resolve));

    expect(paymentsService.processPaymentNotification).toHaveBeenCalledWith(
      'payment-123',
    );
  });

  it('si el evento no es de tipo payment, responde { received: true, ignored: true } sin procesar', async () => {
    const response = await controller.handleWebhook(
      { type: 'merchant_order' },
      { topic: 'merchant_order', 'data.id': 'order-999' },
    );

    expect(response).toEqual({ received: true, ignored: true });

    await new Promise((resolve) => setImmediate(resolve));

    expect(paymentsService.processPaymentNotification).not.toHaveBeenCalled();
  });

  it('simulate-webhook ejecuta de forma síncrona fuera de producción', async () => {
    (paymentsService.isProductionEnv as jest.Mock).mockReturnValue(false);

    const body = {
      type: 'payment',
      payment_id: 'mp_pay_sim_123',
      external_reference: 'slot-1',
      status: 'approved',
    };

    const res = await controller.simulateWebhook(body);

    expect(paymentsService.simulateWebhook).toHaveBeenCalledWith(body);
    expect(res).toEqual({ received: true, simulated: true });
  });

  it('simulate-webhook lanza NotFoundException en producción', async () => {
    (paymentsService.isProductionEnv as jest.Mock).mockReturnValue(true);

    const body = {
      type: 'payment',
      payment_id: 'mp_pay_sim_123',
      external_reference: 'slot-1',
      status: 'approved',
    };

    await expect(controller.simulateWebhook(body)).rejects.toThrow(
      NotFoundException,
    );
    expect(paymentsService.simulateWebhook).not.toHaveBeenCalled();
  });
});
