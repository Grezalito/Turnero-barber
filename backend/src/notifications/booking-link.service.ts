import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { resolveJwtSecret } from '../auth/jwt-secret.util';

export interface BookingIdentity {
  id: string;
  client_id: string | null;
  mp_payment_id: string | null;
}

/** Respuesta única para "no existe" y "ref inválido": no permite averiguar qué turnos existen. */
export const BOOKING_NOT_FOUND_MESSAGE = 'No encontramos esta reserva o el link ya no es válido';

/**
 * Links públicos a la página de una reserva: `/reserva/:slotId?ref=<firma>`.
 *
 * El `ref` es un HMAC de (turno, cliente, pago). El id del turno solo NO alcanza: un turno
 * cancelado puede reactivarse y reservarse por otro cliente con el MISMO id, y el link viejo
 * mostraría la reserva ajena. Al cambiar cliente o pago, el ref deja de coincidir.
 *
 * La clave se deriva de JWT_SECRET (no requiere variable nueva); rotarlo invalida los links.
 */
@Injectable()
export class BookingLinkService {
  private readonly key: Buffer;

  constructor(private readonly configService: ConfigService) {
    const secret = resolveJwtSecret(this.configService.get<string>('JWT_SECRET'));
    this.key = crypto.createHmac('sha256', secret).update('turnazo-booking-link-v1').digest();
  }

  /** 22 caracteres base64url (~132 bits). */
  ref(booking: BookingIdentity): string {
    return crypto
      .createHmac('sha256', this.key)
      .update(`${booking.id}:${booking.client_id ?? ''}:${booking.mp_payment_id ?? ''}`)
      .digest('base64url')
      .slice(0, 22);
  }

  verify(booking: BookingIdentity, ref: string | undefined | null): boolean {
    if (!ref || !booking.client_id) return false;
    const expected = Buffer.from(this.ref(booking));
    const received = Buffer.from(ref);
    return expected.length === received.length && crypto.timingSafeEqual(expected, received);
  }

  /** Ruta relativa (para notificaciones push abiertas dentro de la PWA). */
  path(booking: BookingIdentity): string {
    return `/reserva/${encodeURIComponent(booking.id)}?ref=${this.ref(booking)}`;
  }

  /** Ruta (relativa a la API) del .ics del turno; exige el mismo ref que la página pública. */
  icsPath(booking: BookingIdentity): string {
    return `/appointments/${encodeURIComponent(booking.id)}/ics?ref=${this.ref(booking)}`;
  }

  /** URL absoluta (WhatsApp, emails). */
  url(booking: BookingIdentity): string {
    return `${this.frontendBaseUrl()}${this.path(booking)}`;
  }

  frontendBaseUrl(): string {
    return (
      this.configService.get<string>('FRONTEND_URL') ||
      this.configService.get<string>('PUBLIC_APP_URL') ||
      'http://localhost:5173'
    )
      .split(',')[0]
      .trim()
      .replace(/\/+$/, '');
  }
}
