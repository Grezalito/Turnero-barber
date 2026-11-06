import { ConfigService } from '@nestjs/config';
import { BookingLinkService } from './booking-link.service';
import {
  buildBarberCancellationRequestWhatsAppUrl,
  buildBarberRescheduleRequestWhatsAppUrl,
} from './whatsapp-link.util';

const config = (values: Record<string, string>) =>
  ({ get: (k: string) => values[k] }) as unknown as ConfigService;

describe('BookingLinkService', () => {
  const service = new BookingLinkService(
    config({ JWT_SECRET: 'x'.repeat(48), FRONTEND_URL: 'https://turnazo.app/, https://otro.app' }),
  );
  const booking = { id: '6f1c2c8e-1d2a-4f9b-9a51-1c2b3d4e5f60', client_id: 'client-A', mp_payment_id: '123' };

  it('genera una URL pública estable con ref de 22 caracteres', () => {
    const url = service.url(booking);
    expect(url).toMatch(/^https:\/\/turnazo\.app\/reserva\/6f1c2c8e-1d2a-4f9b-9a51-1c2b3d4e5f60\?ref=[A-Za-z0-9_-]{22}$/);
    expect(service.url(booking)).toBe(url);
  });

  it('verifica el ref correcto y rechaza refs ausentes o adulterados', () => {
    const ref = service.ref(booking);
    expect(service.verify(booking, ref)).toBe(true);
    expect(service.verify(booking, undefined)).toBe(false);
    expect(service.verify(booking, ref.slice(0, -1) + (ref.endsWith('A') ? 'B' : 'A'))).toBe(false);
  });

  it('el link viejo deja de valer si el mismo turno se reserva para otro cliente o con otro pago', () => {
    const ref = service.ref(booking);
    expect(service.verify({ ...booking, client_id: 'client-B', mp_payment_id: '999' }, ref)).toBe(false);
    expect(service.verify({ ...booking, mp_payment_id: '999' }, ref)).toBe(false);
    expect(service.verify({ ...booking, client_id: null, mp_payment_id: null }, ref)).toBe(false);
  });

  it('icsPath lleva el mismo ref que la página pública', () => {
    expect(service.icsPath(booking)).toBe(`/appointments/${booking.id}/ics?ref=${service.ref(booking)}`);
  });

  it('otro JWT_SECRET produce otros refs', () => {
    const other = new BookingLinkService(config({ JWT_SECRET: 'y'.repeat(48) }));
    expect(other.ref(booking)).not.toBe(service.ref(booking));
  });
});

describe('WhatsApp: pedidos de cancelación y reprogramación', () => {
  const ctx = {
    clientName: 'Ana',
    barberName: 'Pepe',
    barberPhone: '11 5566-7788',
    shopName: 'Barbería Norte',
    startTime: new Date('2026-11-04T14:30:00.000Z'),
    endTime: new Date('2026-11-04T15:00:00.000Z'),
    depositAmountArs: 2000,
    manageUrl: 'https://turnazo.app/reserva/x?ref=y',
  };

  it('cancelación: al barbero, con fecha AR y aviso de seña no reembolsable', () => {
    const url = buildBarberCancellationRequestWhatsAppUrl(ctx)!;
    expect(url.startsWith('https://wa.me/5491155667788?text=')).toBe(true);
    const text = decodeURIComponent(url.split('text=')[1]);
    expect(text).toContain('Necesito cancelar mi turno del miércoles, 4 de noviembre a las 14:30 hs');
    expect(text).toContain('la seña no es reembolsable');
  });

  it('reprogramación: al barbero, pidiendo otros horarios', () => {
    const text = decodeURIComponent(buildBarberRescheduleRequestWhatsAppUrl(ctx)!.split('text=')[1]);
    expect(text).toContain('¿Puedo reprogramar mi turno del miércoles, 4 de noviembre a las 14:30 hs');
  });

  it('sin teléfono del barbero no hay link', () => {
    expect(buildBarberCancellationRequestWhatsAppUrl({ ...ctx, barberPhone: '' })).toBeNull();
    expect(buildBarberRescheduleRequestWhatsAppUrl({ ...ctx, barberPhone: null })).toBeNull();
  });
});
