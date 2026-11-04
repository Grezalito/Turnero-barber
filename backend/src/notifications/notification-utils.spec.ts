import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service';
import { isAllowedPushEndpoint } from './push-endpoint.util';
import { formatSlotDateAr, formatSlotTimeAr, nominalToInstant } from './slot-time.util';
import {
  buildBarberNotificationWhatsAppUrl,
  buildClientConfirmationMessage,
  buildClientConfirmationWhatsAppUrl,
  normalizeArgentinaWhatsAppNumber,
} from './whatsapp-link.util';

// Turno nominal 2026-11-04 14:30 (hora de pared de Buenos Aires)
const START = new Date('2026-11-04T14:30:00.000Z');
const END = new Date('2026-11-04T15:00:00.000Z');

describe('slot-time (America/Argentina/Buenos_Aires)', () => {
  it('el instante real es nominal + 3 h', () => {
    expect(nominalToInstant(START).toISOString()).toBe('2026-11-04T17:30:00.000Z');
  });
  it('formatea fecha y hora en es-AR sin desfase de día', () => {
    expect(formatSlotTimeAr(START)).toBe('14:30');
    expect(formatSlotDateAr(START)).toBe('miércoles, 4 de noviembre');
    // 23:30 nominal NO debe saltar al día siguiente
    expect(formatSlotDateAr(new Date('2026-11-04T23:30:00.000Z'))).toBe('miércoles, 4 de noviembre');
    expect(formatSlotTimeAr(new Date('2026-11-04T23:30:00.000Z'))).toBe('23:30');
  });
});

describe('normalizeArgentinaWhatsAppNumber', () => {
  it.each([
    ['+54 9 11 5566-7788', '5491155667788'],
    ['+541155667788', '5491155667788'],
    ['011 15 5566-7788', '5491155667788'],
    ['1155667788', '5491155667788'],
    ['0351 15 512-3456', '5493515123456'],
    ['00549 2214 55-6677', '5492214556677'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeArgentinaWhatsAppNumber(input)).toBe(expected);
  });

  it.each([null, '', 'sin teléfono', '12345', '+1 415 555 0100'])('rechaza %p (no inventa número)', (input) => {
    expect(normalizeArgentinaWhatsAppNumber(input as any)).toBeNull();
  });
});

describe('links de WhatsApp', () => {
  const ctx = {
    clientName: 'Ana',
    clientPhone: '11 5566-7788',
    barberName: 'Pepe',
    barberPhone: '+54 9 351 512-3456',
    shopName: 'Barbería Norte',
    startTime: START,
    endTime: END,
    depositAmountArs: 2000,
    manageUrl: 'https://turnazo.app/barberia-norte',
  };

  it('copy de confirmación al cliente con el formato acordado', () => {
    expect(buildClientConfirmationMessage(ctx)).toBe(
      '¡Hola Ana! Ya tenés confirmada tu seña para el miércoles, 4 de noviembre a las 14:30 con Pepe en Barbería Norte. ' +
        'Agendalo o gestioná tu turno acá: https://turnazo.app/barberia-norte',
    );
    const url = buildClientConfirmationWhatsAppUrl(ctx)!;
    expect(url.startsWith('https://wa.me/5491155667788?text=')).toBe(true);
    expect(decodeURIComponent(url.split('text=')[1])).toContain('¡Hola Ana!');
  });

  it('aviso al barbero con cliente, teléfono, servicio y seña', () => {
    const url = buildBarberNotificationWhatsAppUrl(ctx)!;
    expect(url.startsWith('https://wa.me/5493515123456?text=')).toBe(true);
    const text = decodeURIComponent(url.split('text=')[1]);
    expect(text).toContain('Cliente: Ana');
    expect(text).toContain('Teléfono: 11 5566-7788');
    expect(text).toContain('Servicio: Corte (30 min)');
    expect(text).toContain('Seña abonada: $2000 ARS'.replace('2000', (2000).toLocaleString('es-AR')));
  });

  it('sin teléfono válido no genera link', () => {
    expect(buildClientConfirmationWhatsAppUrl({ ...ctx, clientPhone: '' })).toBeNull();
    expect(buildBarberNotificationWhatsAppUrl({ ...ctx, barberPhone: null })).toBeNull();
  });
});

describe('isAllowedPushEndpoint (anti-SSRF)', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/QGx',
    'https://db5p.notify.windows.com/w/?token=abc',
  ])('acepta %s', (url) => expect(isAllowedPushEndpoint(url)).toBe(true));

  it.each([
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://169.254.169.254/latest/meta-data',
    'https://localhost/push',
    'https://fcm.googleapis.com.evil.com/x',
    'https://evilfcm.googleapis.com.attacker.io/x',
    'https://fcm.googleapis.com:8443/x',
    'https://user:pass@fcm.googleapis.com/x',
    'not a url',
  ])('rechaza %s', (url) => expect(isAllowedPushEndpoint(url)).toBe(false));
});

describe('MailService.buildIcsCalendar', () => {
  const mail = new MailService({ get: () => undefined } as unknown as ConfigService);
  const ics = mail.buildIcsCalendar({
    slotId: 'abc123',
    shopName: 'Barbería; Norte, Centro',
    barberName: 'Pepe',
    address: 'Av. Corrientes 1234, CABA',
    clientName: 'Ana',
    clientDni: '30123456',
    startTime: START,
    endTime: new Date(START.getTime() + 45 * 60_000),
    mpPaymentId: '999',
    depositAmountArs: 2000,
  });
  const unfolded = ics.replace(/\r\n /g, '');

  it('DTSTART/DTEND en UTC real (+3 h) respetando la duración exacta del turno', () => {
    expect(unfolded).toContain('DTSTART:20261104T173000Z');
    expect(unfolded).toContain('DTEND:20261104T181500Z');
    expect(unfolded).toContain('SUMMARY:Corte de Barbería (45 min) - Barbería\\; Norte\\, Centro');
  });

  it('escapa comas/punto y coma y usa saltos de línea ICS reales en DESCRIPTION', () => {
    expect(unfolded).toContain('LOCATION:Av. Corrientes 1234\\, CABA');
    expect(unfolded).toMatch(/DESCRIPTION:Reserva confirmada en [^\r\n]*\\nBarbero: Pepe/);
    expect(unfolded).not.toContain('\\\\n');
  });

  it('usa CRLF y pliega líneas a 75 octetos (RFC 5545)', () => {
    expect(ics.endsWith('\r\n')).toBe(true);
    for (const line of ics.split('\r\n')) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    }
  });

  it('no expone el DNI completo del cliente', () => {
    expect(unfolded).not.toContain('30123456');
  });
});
