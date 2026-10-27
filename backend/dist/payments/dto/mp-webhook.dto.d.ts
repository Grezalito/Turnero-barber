export declare class MercadoPagoWebhookDto {
    type?: string;
    action?: string;
    data?: {
        id?: string;
    };
    payment_id?: string;
    external_reference?: string;
    status?: string;
}
