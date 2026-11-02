import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import {
  maskDni,
  maskEmail,
  sanitizeControlChars,
} from '../security/pii-sanitizer.util';

export interface IcsAppointmentPayload {
  slotId: string;
  shopName: string;
  barberName: string;
  barberPhone?: string;
  address?: string | null;
  clientName: string;
  clientDni: string;
  startTime: Date;
  endTime: Date;
  mpPaymentId: string;
  depositAmountArs: number;
}

export interface ConfirmationEmailPayload extends IcsAppointmentPayload {
  clientEmail?: string | null;
  barberEmail?: string | null;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter | null = null;
  private readonly isSmtpConfigured: boolean = false;
  private readonly fromAddress: string;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST')?.trim();
    const port = Number(this.configService.get<string>('SMTP_PORT') || 587);
    const user = this.configService.get<string>('SMTP_USER')?.trim();
    const pass = this.configService.get<string>('SMTP_PASS')?.trim();
    this.fromAddress =
      this.configService.get<string>('SMTP_FROM')?.trim() ||
      'Turnero Barber Craft <no-reply@turnero-barber.com>';

    if (host && user && pass) {
      this.isSmtpConfigured = true;
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
    }
  }

  /**
   * Formatea un objeto Date a UTC en estándar RFC 5545: YYYYMMDDTHHMMSSZ
   */
  formatIcsUtcDate(date: Date): string {
    return date
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}Z$/, 'Z');
  }

  /**
   * Convierte el horario nominal del turno (almacenado en HH:mm UTC nominal para Argentina UTC-3)
   * al instante real UTC (+3 horas) para que Google Calendar, Apple Calendar y Outlook en Argentina
   * agenden el evento en la hora local exacta.
   */
  formatArgentinaSlotToUtcIcsDate(nominalDate: Date): string {
    const realUtcDate = new Date(nominalDate.getTime() + 3 * 60 * 60 * 1000);
    return this.formatIcsUtcDate(realUtcDate);
  }

  /**
   * Genera contenido .ICS compatible con Apple Calendar, Outlook y Google Calendar
   * para el turno estricto de 30 minutos.
   */
  buildIcsCalendar(payload: IcsAppointmentPayload): string {
    const nowUtc = this.formatIcsUtcDate(new Date());
    const startUtc = this.formatArgentinaSlotToUtcIcsDate(payload.startTime);
    const endUtc = this.formatArgentinaSlotToUtcIcsDate(payload.endTime);
    const location = payload.address || payload.shopName;
    const summary = `Corte de Barbería (30 min) - ${payload.shopName}`;
    const descriptionLines = [
      `Reserva confirmada en ${payload.shopName}`,
      `Barbero: ${payload.barberName}`,
      `Cliente: ${payload.clientName} (DNI ${payload.clientDni})`,
      `Seña acreditada: $${payload.depositAmountArs.toLocaleString('es-AR')} ARS`,
      `Comprobante Mercado Pago: ${payload.mpPaymentId}`,
      `Política: Reserva garantizada: la seña de $2.000 ARS no es reembolsable ni transferible ante cancelaciones o inasistencias.`,
    ];

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Turnero Barber Craft//Booking Engine 30m//ES',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:slot-${payload.slotId}@turnero-barber.local`,
      `DTSTAMP:${nowUtc}`,
      `DTSTART:${startUtc}`,
      `DTEND:${endUtc}`,
      `SUMMARY:${this.escapeIcsText(summary)}`,
      `LOCATION:${this.escapeIcsText(location)}`,
      `DESCRIPTION:${this.escapeIcsText(descriptionLines.join('\\n'))}`,
      'STATUS:CONFIRMED',
      'BEGIN:VALARM',
      'TRIGGER:-PT30M',
      'ACTION:DISPLAY',
      'DESCRIPTION:Recordatorio de tu turno en 30 minutos',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ];

    return lines.join('\r\n');
  }

  /**
   * Envía el comprobante con archivo .ics adjunto al cliente y un aviso al barbero.
   * Si no hay credenciales SMTP en .env (modo desarrollo), hace fallback a console.log.
   */
  async sendAppointmentConfirmationEmails(
    payload: ConfirmationEmailPayload,
  ): Promise<{
    clientEmailSent: boolean;
    barberEmailSent: boolean;
    mode: 'SMTP' | 'CONSOLE_FALLBACK';
  }> {
    const icsContent = this.buildIcsCalendar(payload);
    const dateStr = payload.startTime.toISOString().slice(0, 10);
    const startHhMm = payload.startTime.toISOString().slice(11, 16);
    const endHhMm = payload.endTime.toISOString().slice(11, 16);

    const clientRecipient =
      payload.clientEmail || `cliente.${payload.clientDni}@turnero-barber.local`;
    const barberRecipient =
      payload.barberEmail || `barbero.${payload.shopName.toLowerCase().replace(/[^a-z0-9]/g, '')}@turnero-barber.local`;

    const clientSubject = `✓ Turno Confirmado (${dateStr} ${startHhMm} hs) - ${payload.shopName}`;
    const clientText = [
      `Hola ${payload.clientName} (DNI ${payload.clientDni}),`,
      ``,
      `Tu turno de 30 minutos en ${payload.shopName} fue CONFIRMADO.`,
      `- Fecha: ${dateStr}`,
      `- Horario UTC: ${startHhMm} a ${endHhMm} hs (30 min)`,
      `- Barbero: ${payload.barberName}`,
      `- Dirección: ${payload.address || 'Consultar con la barbería'}`,
      `- Seña acreditada: $${payload.depositAmountArs} ARS`,
      `- Comprobante MP: ${payload.mpPaymentId}`,
      ``,
      `IMPORTANTE: Reserva garantizada: la seña de $2.000 ARS no es reembolsable ni transferible ante cancelaciones o inasistencias.`,
      ``,
      `Adjuntamos el archivo .ics para agregar el evento a tu Apple Calendar, Outlook o Google Calendar.`,
    ].join('\n');

    const barberSubject = `Nuevo Turno Señado (${dateStr} ${startHhMm} hs) - Cliente DNI ${payload.clientDni}`;
    const barberText = [
      `Hola ${payload.barberName},`,
      ``,
      `Tenés un nuevo turno CONFIRMADO de 30 minutos en ${payload.shopName}:`,
      `- Fecha: ${dateStr}`,
      `- Horario: ${startHhMm} a ${endHhMm} hs`,
      `- Cliente: ${payload.clientName} (DNI ${payload.clientDni})`,
      `- Comprobante MP: ${payload.mpPaymentId} (Seña $2.000 ARS acreditada)`,
    ].join('\n');

    if (this.isSmtpConfigured && this.transporter) {
      try {
        await this.transporter.sendMail({
          from: this.fromAddress,
          to: clientRecipient,
          subject: clientSubject,
          text: clientText,
          attachments: [
            {
              filename: `turno-${payload.slotId.slice(0, 8)}.ics`,
              content: icsContent,
              contentType: 'text/calendar; charset=utf-8; method=PUBLISH',
            },
          ],
        });

        await this.transporter.sendMail({
          from: this.fromAddress,
          to: barberRecipient,
          subject: barberSubject,
          text: barberText,
        });

        this.logger.log(
          `📧 Emails SMTP enviados a cliente (${maskEmail(clientRecipient)}) con .ics adjunto y barbero (${maskEmail(barberRecipient)})`,
        );

        return {
          clientEmailSent: true,
          barberEmailSent: true,
          mode: 'SMTP',
        };
      } catch (err) {
        this.logger.warn(
          `Fallo envío SMTP (${(err as Error).message}), ejecutando fallback seguro`,
        );
      }
    }

    const isProd =
      (this.configService.get<string>('NODE_ENV') || '').toLowerCase() ===
      'production';

    if (isProd) {
      // En producción, jamás volcar cuerpos de correo ni PII en texto plano a stdout (ISO 27701 / ISO 27001 A.8.15)
      this.logger.log(
        `[SECURITY_AUDIT] event=MAIL_FALLBACK_REDACTED slotId=${payload.slotId} clientDni=${maskDni(payload.clientDni)} clientEmail=${maskEmail(clientRecipient)}`,
      );
    } else {
      // Fallback en desarrollo: console.log estructurado con DNI enmascarado
      console.log('\n============================================================');
      console.log('📧 [MailService Fallback - Desarrollo] COMPROBANTE AL CLIENTE');
      console.log(`Para: ${maskEmail(clientRecipient)}`);
      console.log(`Asunto: ${clientSubject}`);
      console.log(`Adjunto: turno-${payload.slotId.slice(0, 8)}.ics (${icsContent.length} bytes)`);
      console.log('------------------------------------------------------------');
      console.log('📧 [MailService Fallback - Desarrollo] AVISO AL BARBERO');
      console.log(`Para: ${maskEmail(barberRecipient)}`);
      console.log(`Asunto: Nuevo Turno Señado (${dateStr} ${startHhMm} hs) - Cliente DNI ${maskDni(payload.clientDni)}`);
      console.log('============================================================\n');
    }

    return {
      clientEmailSent: true,
      barberEmailSent: true,
      mode: 'CONSOLE_FALLBACK',
    };
  }

  private escapeIcsText(text: string): string {
    return sanitizeControlChars(text)
      .replace(/\\/g, '\\\\')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;');
  }
}
