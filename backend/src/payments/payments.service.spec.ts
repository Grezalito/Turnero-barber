import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { SlotStatus } from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { REMINDER_PROVIDER } from '../reminders/reminder.interface';
import { MercadoPagoService } from './mercadopago.service';
import { PaymentsService } from './payments.service';

describe('PaymentsService - Idempotencia de Webhooks', () => {
  let service: PaymentsService;
  let prismaMock: any;
  let reminderProviderMock: any;
  let mailServiceMock: any;
  let mercadoPagoServiceMock: any;

  const mockSlotId = 'slot-id-100';
  const mockPaymentId = 'mp-pay-unique-999';

  beforeEach(async () => {
    const baseSlot = {
      id: mockSlotId,
      status: SlotStatus.AVAILABLE,
      start_time: new Date('2026-11-04T14:00:00Z'),
      end_time: new Date('2026-11-04T14:30:00Z'),
      deposit_amount: 2000,
      barber_id: 'barber-1',
      barber: {
        id: 'barber-1',
        shop_name: 'Barbería Test',
        slug: 'barberia-test',
        reminder_addon_active: true,
        address: 'Calle Falsa 123',
        user: {
          name: 'Barbero Pepe',
          phone: '+5491111111111',
          email: 'barbero@test.com',
        },
      },
      client: {
        id: 'client-1',
        name: 'Cliente Test',
        dni: '12345678',
        phone: '+5491122222222',
        email: 'cliente@test.com',
      },
      reminders: [],
    };

    let slotInDb: any = { ...baseSlot };

    prismaMock = {
      appointmentSlot: {
        findUnique: jest.fn(async ({ where }: any) => {
          if (where.mp_payment_id) {
            if (slotInDb.mp_payment_id === where.mp_payment_id) {
              return slotInDb;
            }
            return null;
          }
          if (where.id === mockSlotId) {
            return slotInDb;
          }
          return null;
        }),
        updateMany: jest.fn(async ({ where, data }: any) => {
          if (
            where.id === mockSlotId &&
            slotInDb.status !== SlotStatus.CONFIRMED
          ) {
            slotInDb = {
              ...slotInDb,
              status: data.status,
              mp_payment_id: data.mp_payment_id,
            };
            return { count: 1 };
          }
          return { count: 0 };
        }),
      },
      $transaction: jest.fn(async (cb: (tx: any) => Promise<any>) => {
        return cb(prismaMock);
      }),
    };

    reminderProviderMock = {
      scheduleForConfirmedSlot: jest.fn().mockResolvedValue({
        id: 'reminder-1',
        generated_message: 'Hola, tu turno está confirmado',
        scheduled_for: new Date('2026-11-04T12:00:00Z'),
      }),
    };

    mailServiceMock = {
      sendAppointmentConfirmationEmails: jest.fn().mockResolvedValue({
        clientEmailSent: true,
        mode: 'SMTP',
      }),
    };

    mercadoPagoServiceMock = {
      getPayment: jest.fn().mockResolvedValue({
        id: mockPaymentId,
        status: 'approved',
        external_reference: mockSlotId,
        transaction_amount: 2000,
      }),
      isPaymentNotification: jest.fn().mockReturnValue(true),
    };

    const configServiceMock = {
      get: jest.fn((key: string) => {
        if (key === 'NODE_ENV') return 'production';
        if (key === 'MP_ACCESS_TOKEN') return 'APP_USR-TEST-TOKEN';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: MailService, useValue: mailServiceMock },
        { provide: REMINDER_PROVIDER, useValue: reminderProviderMock },
        { provide: MercadoPagoService, useValue: mercadoPagoServiceMock },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  it('segunda notificación del mismo payment no vuelve a confirmar ni a encolar recordatorio ni enviar mail', async () => {
    // 1. Primera notificación: debe confirmar el turno y ejecutar los efectos secundarios
    const firstResult = await service.processPaymentNotification(mockPaymentId);

    expect(firstResult.processed).toBe(true);
    expect(firstResult.status).toBe(SlotStatus.CONFIRMED);
    expect(firstResult.idempotent).toBeUndefined();
    expect(reminderProviderMock.scheduleForConfirmedSlot).toHaveBeenCalledTimes(1);
    expect(mailServiceMock.sendAppointmentConfirmationEmails).toHaveBeenCalledTimes(1);

    // 2. Segunda notificación con el mismo paymentId: debe ser detectada como idempotente
    const secondResult = await service.processPaymentNotification(mockPaymentId);

    expect(secondResult.processed).toBe(true);
    expect(secondResult.idempotent).toBe(true);
    expect(secondResult.status).toBe(SlotStatus.CONFIRMED);

    // Los efectos secundarios NO deben haberse llamado una segunda vez
    expect(reminderProviderMock.scheduleForConfirmedSlot).toHaveBeenCalledTimes(1);
    expect(mailServiceMock.sendAppointmentConfirmationEmails).toHaveBeenCalledTimes(1);
  });
});
