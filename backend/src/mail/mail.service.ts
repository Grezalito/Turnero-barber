import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

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
   * Genera contenido .ICS compatible con Apple Calendar, Outlook y Google Calendar
   * para el turno estricto de 30 minutos.
   */
  buildIcsCalendar(payload: IcsAppointmentPayload): string {
    const nowUtc = this.formatIcsUtcDate(new Date());
    const startUtc = this.formatIcsUtcDate(payload.startTime);
    const endUtc = this.formatIcsUtcDate(payload.endTime);
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
          `📧 Emails SMTP enviados a cliente (${clientRecipient}) con .ics adjunto y barbero (${barberRecipient})`,
        );

        return {
          clientEmailSent: true,
          barberEmailSent: true,
          mode: 'SMTP',
        };
      } catch (err) {
        this.logger.warn(
          `Fallo envío SMTP (${(err as Error).message}), ejecutando fallback a console.log`,
        );
      }
    }

    // Fallback en desarrollo: console.log estructurado
    console.log('\n============================================================');
    console.log('📧 [MailService Fallback - Desarrollo] COMPROBANTE AL CLIENTE');
    console.log(`Para: ${clientRecipient}`);
    console.log(`Asunto: ${clientSubject}`);
    console.log(`Adjunto: turno-${payload.slotId.slice(0, 8)}.ics (${icsContent.length} bytes)`);
    console.log(clientText);
    console.log('------------------------------------------------------------');
    console.log('📧 [MailService Fallback - Desarrollo] AVISO AL BARBERO');
    console.log(`Para: ${barberRecipient}`);
    console.log(`Asunto: ${barberSubject}`);
    console.log(barberText);
    console.log('============================================================\n');

    return {
      clientEmailSent: true,
      barberEmailSent: true,
      mode: 'CONSOLE_FALLBACK',
    };
  }

  private escapeIcsText(text: string): string {
    return text.replace(/,/g, '\\,').replace(/;/g, '\\;');
  }
}
