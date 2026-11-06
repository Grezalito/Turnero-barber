import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SlotStatus } from '@prisma/client';
import { MailService } from '../mail/mail.service';
import {
  BOOKING_NOT_FOUND_MESSAGE,
  BookingLinkService,
} from '../notifications/booking-link.service';
import { AppointmentsService } from './appointments.service';

describe('AppointmentsService.generateSlotIcsFile (ref obligatorio)', () => {
  const config = { get: (k: string) => (k === 'JWT_SECRET' ? 'z'.repeat(48) : undefined) } as unknown as ConfigService;
  const bookingLinks = new BookingLinkService(config);
  const mail = new MailService(config);

  const slot = {
    id: '6f1c2c8e-1d2a-4f9b-9a51-1c2b3d4e5f60',
    client_id: 'client-A',
    mp_payment_id: '123456789',
    status: SlotStatus.CONFIRMED,
    start_time: new Date('2026-11-04T14:30:00.000Z'),
    end_time: new Date('2026-11-04T15:00:00.000Z'),
    deposit_amount: 2000,
    barber: { shop_name: 'Barbería Norte', address: 'Av. Siempre Viva 742', user: { name: 'Pepe', phone: '+5491155667788' } },
    client: { name: 'Ana Pérez', dni: '30123456' },
  };

  let current: any;
  const prisma = { appointmentSlot: { findUnique: jest.fn(async () => current) } };
  const service = new AppointmentsService(prisma as any, {} as any, mail, {} as any, bookingLinks);

  beforeEach(() => {
    current = { ...slot };
  });

  it('con el ref correcto devuelve el .ics del turno', async () => {
    const { icsContent, filename } = await service.generateSlotIcsFile(slot.id, bookingLinks.ref(slot));
    expect(filename).toBe('turno-6f1c2c8e.ics');
    expect(icsContent).toContain('BEGIN:VCALENDAR');
    expect(icsContent).toContain('DTSTART:20261104T173000Z');
  });

  const expectNotFound = async (promise: Promise<unknown>) => {
    await expect(promise).rejects.toBeInstanceOf(NotFoundException);
    await expect(promise).rejects.toThrow(BOOKING_NOT_FOUND_MESSAGE);
  };

  it('sin ref → 404', async () => {
    await expectNotFound(service.generateSlotIcsFile(slot.id));
  });

  it('ref adulterado → 404', async () => {
    const ref = bookingLinks.ref(slot);
    await expectNotFound(service.generateSlotIcsFile(slot.id, ref.slice(0, -1) + (ref.endsWith('A') ? 'B' : 'A')));
  });

  it('turno inexistente → el MISMO 404 que un ref inválido', async () => {
    current = null;
    await expectNotFound(service.generateSlotIcsFile(slot.id, bookingLinks.ref(slot)));
  });

  it('ref de una reserva anterior del mismo turno (otro cliente/pago) → 404', async () => {
    const oldRef = bookingLinks.ref(slot);
    current = { ...slot, client_id: 'client-B', mp_payment_id: '999' };
    await expectNotFound(service.generateSlotIcsFile(slot.id, oldRef));
  });
});
