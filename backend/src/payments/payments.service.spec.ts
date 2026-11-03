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
  let slotInDb: any;
  let orphans: any[];

  const mockSlotId = 'slot-id-100';
  const mockPaymentId = 'mp-pay-unique-999';

  beforeEach(async () => {
    const baseSlot = {
      id: mockSlotId,
      status: SlotStatus.PENDING_PAYMENT,
      client_id: 'client-1',
      locked_until: new Date(Date.now() + 10 * 60_000),
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

    slotInDb = { ...baseSlot };
    orphans = [];

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
        findUniqueOrThrow: jest.fn(async () => slotInDb),
        updateMany: jest.fn(async ({ where, data }: any) => {
          if (
            where.id === mockSlotId &&
            where.status === slotInDb.status &&
            where.client_id === slotInDb.client_id
          ) {
            slotInDb = { ...slotInDb, ...data };
            return { count: 1 };
          }
          return { count: 0 };
        }),
      },
      orphanPayment: {
        findUnique: jest.fn(async ({ where }: any) =>
          orphans.find((o) => o.mp_payment_id === where.mp_payment_id) ?? null,
        ),
        create: jest.fn(async ({ data }: any) => {
          orphans.push(data);
          return data;
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
        metadata: { slot_id: mockSlotId, client_id: 'client-1' },
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

  it('pago de otro cliente sobre un bloqueo vigente se registra como OrphanPayment sin tocar el turno', async () => {
    mercadoPagoServiceMock.getPayment.mockResolvedValue({
      id: 'mp-pay-late-A',
      status: 'approved',
      external_reference: mockSlotId,
      transaction_amount: 2000,
      metadata: { slot_id: mockSlotId, client_id: 'client-A-expired' },
    });

    const result = await service.processPaymentNotification('mp-pay-late-A');

    expect(result.processed).toBe(false);
    expect(result.status).toBe('REQUIRES_REFUND');
    expect(result.reason).toBe('SLOT_TAKEN_BY_OTHER_CLIENT');
    expect(slotInDb.status).toBe(SlotStatus.PENDING_PAYMENT);
    expect(slotInDb.client_id).toBe('client-1');
    expect(orphans).toHaveLength(1);
    expect(reminderProviderMock.scheduleForConfirmedSlot).not.toHaveBeenCalled();
  });

  it('segundo pago distinto sobre un turno ya confirmado queda como DUPLICATE_PAYMENT', async () => {
    await service.processPaymentNotification(mockPaymentId);
    mercadoPagoServiceMock.getPayment.mockResolvedValue({
      id: 'mp-pay-second',
      status: 'approved',
      external_reference: mockSlotId,
      transaction_amount: 2000,
      metadata: { slot_id: mockSlotId, client_id: 'client-1' },
    });

    const result = await service.processPaymentNotification('mp-pay-second');

    expect(result.status).toBe('REQUIRES_REFUND');
    expect(result.reason).toBe('DUPLICATE_PAYMENT');
    expect(slotInDb.mp_payment_id).toBe(mockPaymentId);
    expect(reminderProviderMock.scheduleForConfirmedSlot).toHaveBeenCalledTimes(1);
  });

  it('pago real sin metadata de cliente no confirma (MISSING_CLIENT_BINDING)', async () => {
    mercadoPagoServiceMock.getPayment.mockResolvedValue({
      id: 'mp-pay-nometa',
      status: 'approved',
      external_reference: mockSlotId,
      transaction_amount: 2000,
    });

    const result = await service.processPaymentNotification('mp-pay-nometa');

    expect(result.reason).toBe('MISSING_CLIENT_BINDING');
    expect(slotInDb.status).toBe(SlotStatus.PENDING_PAYMENT);
  });
});
