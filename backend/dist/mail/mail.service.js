"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var MailService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const nodemailer = require("nodemailer");
let MailService = MailService_1 = class MailService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(MailService_1.name);
        this.transporter = null;
        this.isSmtpConfigured = false;
        const host = this.configService.get('SMTP_HOST')?.trim();
        const port = Number(this.configService.get('SMTP_PORT') || 587);
        const user = this.configService.get('SMTP_USER')?.trim();
        const pass = this.configService.get('SMTP_PASS')?.trim();
        this.fromAddress =
            this.configService.get('SMTP_FROM')?.trim() ||
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
    formatIcsUtcDate(date) {
        return date
            .toISOString()
            .replace(/[-:]/g, '')
            .replace(/\.\d{3}Z$/, 'Z');
    }
    buildIcsCalendar(payload) {
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
    async sendAppointmentConfirmationEmails(payload) {
        const icsContent = this.buildIcsCalendar(payload);
        const dateStr = payload.startTime.toISOString().slice(0, 10);
        const startHhMm = payload.startTime.toISOString().slice(11, 16);
        const endHhMm = payload.endTime.toISOString().slice(11, 16);
        const clientRecipient = payload.clientEmail || `cliente.${payload.clientDni}@turnero-barber.local`;
        const barberRecipient = payload.barberEmail || `barbero.${payload.shopName.toLowerCase().replace(/[^a-z0-9]/g, '')}@turnero-barber.local`;
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
                this.logger.log(`📧 Emails SMTP enviados a cliente (${clientRecipient}) con .ics adjunto y barbero (${barberRecipient})`);
                return {
                    clientEmailSent: true,
                    barberEmailSent: true,
                    mode: 'SMTP',
                };
            }
            catch (err) {
                this.logger.warn(`Fallo envío SMTP (${err.message}), ejecutando fallback a console.log`);
            }
        }
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
    escapeIcsText(text) {
        return text.replace(/,/g, '\\,').replace(/;/g, '\\;');
    }
};
exports.MailService = MailService;
exports.MailService = MailService = MailService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], MailService);
//# sourceMappingURL=mail.service.js.map