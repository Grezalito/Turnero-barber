import { ConfigService } from '@nestjs/config';
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
export declare class MailService {
    private readonly configService;
    private readonly logger;
    private readonly transporter;
    private readonly isSmtpConfigured;
    private readonly fromAddress;
    constructor(configService: ConfigService);
    formatIcsUtcDate(date: Date): string;
    buildIcsCalendar(payload: IcsAppointmentPayload): string;
    sendAppointmentConfirmationEmails(payload: ConfirmationEmailPayload): Promise<{
        clientEmailSent: boolean;
        barberEmailSent: boolean;
        mode: 'SMTP' | 'CONSOLE_FALLBACK';
    }>;
    private escapeIcsText;
}
