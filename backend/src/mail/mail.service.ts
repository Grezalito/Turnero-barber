import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import {
  maskDni,
  maskEmail,
  sanitizeControlChars,
} from '../security/pii-sanitizer.util';
import {
  formatSlotDateAr,
  formatSlotTimeAr,
  nominalToInstant,
  slotDurationMinutes,
} from '../notifications/slot-time.util';

export interface ReminderEmailPayload {
  to: string;
  clientName: string;
  shopName: string;
  barberName: string;
  address?: string | null;
  startTime: Date;
  endTime: Date;
  kind: '24h' | '2h';
}

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
   * Convierte el horario nominal del turno (hora de pared de Argentina guardada como UTC)
   * al instante real en UTC (`Z`). Usar UTC explícito en DTSTART/DTEND evita depender de
   * VTIMEZONE: Apple Calendar, Google y Outlook lo muestran en la zona del dispositivo sin desfase.
   */
  formatArgentinaSlotToUtcIcsDate(nominalDate: Date): string {
    return this.formatIcsUtcDate(nominalToInstant(nominalDate));
  }

  /**
   * Genera un .ICS (RFC 5545) compatible con Apple Calendar, Outlook y Google Calendar.
   * DTEND respeta la duración real del turno (end_time - start_time).
   */
  buildIcsCalendar(payload: IcsAppointmentPayload): string {
    const nowUtc = this.formatIcsUtcDate(new Date());
    const startUtc = this.formatArgentinaSlotToUtcIcsDate(payload.startTime);
    const endUtc = this.formatArgentinaSlotToUtcIcsDate(payload.endTime);
    const minutes = slotDurationMinutes(payload.startTime, payload.endTime);
    const location = payload.address || payload.shopName;
    const summary = `Corte de Barbería (${minutes} min) - ${payload.shopName}`;
    const descriptionLines = [
      `Reserva confirmada en ${payload.shopName}`,
      `Barbero: ${payload.barberName}`,
      `Cliente: ${payload.clientName} (DNI ${maskDni(payload.clientDni)})`,
      `Seña acreditada: $${payload.depositAmountArs.toLocaleString('es-AR')} ARS`,
      `Comprobante Mercado Pago: ${payload.mpPaymentId}`,
      `Política: la seña no es reembolsable ni transferible ante cancelaciones o inasistencias.`,
    ];

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Turnazo//Booking Engine//ES',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:slot-${payload.slotId}@turnazo.app`,
      `DTSTAMP:${nowUtc}`,
      `DTSTART:${startUtc}`,
      `DTEND:${endUtc}`,
      `SUMMARY:${this.escapeIcsText(summary)}`,
      `LOCATION:${this.escapeIcsText(location)}`,
      // Cada línea se escapa por separado y recién después se une con el salto de línea ICS (\n).
      `DESCRIPTION:${descriptionLines.map((l) => this.escapeIcsText(l)).join('\\n')}`,
      'STATUS:CONFIRMED',
      'BEGIN:VALARM',
      'TRIGGER:-PT2H',
      'ACTION:DISPLAY',
      `DESCRIPTION:${this.escapeIcsText(`Tu turno en ${payload.shopName} es en 2 horas`)}`,
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ];

    return lines.map((line) => this.foldIcsLine(line)).join('\r\n') + '\r\n';
  }

  /** RFC 5545 §3.1: líneas de máx. 75 octetos; las continuaciones empiezan con un espacio. */
  private foldIcsLine(line: string): string {
    const bytes = Buffer.from(line, 'utf8');
    if (bytes.length <= 75) return line;
    const chunks: string[] = [];
    let current = '';
    let currentBytes = 0;
    for (const char of line) {
      const charBytes = Buffer.byteLength(char, 'utf8');
      const limit = chunks.length === 0 ? 75 : 74; // la continuación ya usa 1 octeto en el espacio
      if (currentBytes + charBytes > limit) {
        chunks.push(current);
        current = '';
        currentBytes = 0;
      }
      current += char;
      currentBytes += charBytes;
    }
    chunks.push(current);
    return chunks.join('\r\n ');
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
    const dateStr = formatSlotDateAr(payload.startTime);
    const startHhMm = formatSlotTimeAr(payload.startTime);
    const endHhMm = formatSlotTimeAr(payload.endTime);
    const minutes = slotDurationMinutes(payload.startTime, payload.endTime);

    // Nunca inventar destinatarios: sin email real no se envía (antes se usaba cliente.<DNI>@...local).
    const clientRecipient = payload.clientEmail?.trim() || null;
    const barberRecipient = payload.barberEmail?.trim() || null;

    const clientSubject = `✓ Turno Confirmado (${dateStr} ${startHhMm} hs) - ${payload.shopName}`;
    const clientText = [
      `Hola ${payload.clientName},`,
      ``,
      `Tu turno de ${minutes} minutos en ${payload.shopName} fue CONFIRMADO.`,
      `- Fecha: ${dateStr}`,
      `- Horario: ${startHhMm} a ${endHhMm} hs (hora de Argentina)`,
      `- Barbero: ${payload.barberName}`,
      `- Dirección: ${payload.address || 'Consultar con la barbería'}`,
      `- Seña acreditada: $${payload.depositAmountArs} ARS`,
      `- Comprobante MP: ${payload.mpPaymentId}`,
      ``,
      `IMPORTANTE: Reserva garantizada: la seña de $2.000 ARS no es reembolsable ni transferible ante cancelaciones o inasistencias.`,
      ``,
      `Adjuntamos el archivo .ics para agregar el evento a tu Apple Calendar, Outlook o Google Calendar.`,
    ].join('\n');

    const barberSubject = `Nuevo Turno Señado (${dateStr} ${startHhMm} hs) - ${payload.clientName}`;
    const barberText = [
      `Hola ${payload.barberName},`,
      ``,
      `Tenés un nuevo turno CONFIRMADO de ${minutes} minutos en ${payload.shopName}:`,
      `- Fecha: ${dateStr}`,
      `- Horario: ${startHhMm} a ${endHhMm} hs`,
      `- Cliente: ${payload.clientName} (DNI ${payload.clientDni})`,
      `- Comprobante MP: ${payload.mpPaymentId} (Seña $2.000 ARS acreditada)`,
    ].join('\n');

    if (this.isSmtpConfigured && this.transporter) {
      let clientEmailSent = false;
      let barberEmailSent = false;
      try {
        if (clientRecipient) {
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
          clientEmailSent = true;
        }

        if (barberRecipient) {
          await this.transporter.sendMail({
            from: this.fromAddress,
            to: barberRecipient,
            subject: barberSubject,
            text: barberText,
          });
          barberEmailSent = true;
        }

        this.logger.log(
          `📧 Confirmación SMTP: cliente=${clientRecipient ? maskEmail(clientRecipient) : 'sin email'} barbero=${barberRecipient ? maskEmail(barberRecipient) : 'sin email'}`,
        );

        return { clientEmailSent, barberEmailSent, mode: 'SMTP' };
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
        `[SECURITY_AUDIT] event=MAIL_FALLBACK_REDACTED slotId=${payload.slotId} clientDni=${maskDni(payload.clientDni)} clientEmail=${clientRecipient ? maskEmail(clientRecipient) : 'none'}`,
      );
    } else {
      // Fallback en desarrollo: console.log estructurado con DNI enmascarado
      console.log('\n============================================================');
      console.log('📧 [MailService Fallback - Desarrollo] COMPROBANTE AL CLIENTE');
      console.log(`Para: ${clientRecipient ? maskEmail(clientRecipient) : '(cliente sin email)'}`);
      console.log(`Asunto: ${clientSubject}`);
      console.log(`Adjunto: turno-${payload.slotId.slice(0, 8)}.ics (${icsContent.length} bytes)`);
      console.log('------------------------------------------------------------');
      console.log('📧 [MailService Fallback - Desarrollo] AVISO AL BARBERO');
      console.log(`Para: ${barberRecipient ? maskEmail(barberRecipient) : '(barbero sin email)'}`);
      console.log(`Asunto: Nuevo Turno Señado (${dateStr} ${startHhMm} hs) - Cliente DNI ${maskDni(payload.clientDni)}`);
      console.log('============================================================\n');
    }

    return {
      clientEmailSent: false,
      barberEmailSent: false,
      mode: 'CONSOLE_FALLBACK',
    };
  }

  /**
   * Recordatorio 24 hs / 2 hs. `sent` es true solo si el SMTP aceptó el mensaje
   * (o, fuera de producción, si se volcó al fallback de consola).
   */
  async sendAppointmentReminderEmail(
    payload: ReminderEmailPayload,
  ): Promise<{ sent: boolean; mode: 'SMTP' | 'CONSOLE_FALLBACK' | 'DISABLED' }> {
    const when = payload.kind === '24h' ? 'mañana' : 'hoy';
    const time = formatSlotTimeAr(payload.startTime);
    const date = formatSlotDateAr(payload.startTime);
    const subject = `Recordatorio: ${when} a las ${time} hs en ${payload.shopName}`;
    const text = [
      `Hola ${payload.clientName},`,
      ``,
      `Te recordamos tu turno ${when} (${date}) a las ${time} hs con ${payload.barberName} en ${payload.shopName}.`,
      `Dirección: ${payload.address || 'Consultar con la barbería'}`,
      ``,
      `Recordá que la seña no es reembolsable ante inasistencias. ¡Te esperamos!`,
    ].join('\n');

    if (this.isSmtpConfigured && this.transporter) {
      try {
        await this.transporter.sendMail({ from: this.fromAddress, to: payload.to, subject, text });
        return { sent: true, mode: 'SMTP' };
      } catch (err) {
        this.logger.warn(`Fallo SMTP en recordatorio (${maskEmail(payload.to)}): ${(err as Error).message}`);
        return { sent: false, mode: 'SMTP' };
      }
    }

    const isProd =
      (this.configService.get<string>('NODE_ENV') || '').toLowerCase() === 'production';
    if (isProd) {
      return { sent: false, mode: 'DISABLED' };
    }
    console.log(`📧 [MailService Fallback - Desarrollo] RECORDATORIO ${payload.kind} → ${maskEmail(payload.to)} | ${subject}`);
    return { sent: true, mode: 'CONSOLE_FALLBACK' };
  }

  private escapeIcsText(text: string): string {
    return sanitizeControlChars(text)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }
}
