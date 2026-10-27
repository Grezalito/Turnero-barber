import { IsObject, IsOptional, IsString } from 'class-validator';

export class MercadoPagoWebhookDto {
  @IsString()
  @IsOptional()
  type?: string;

  @IsString()
  @IsOptional()
  action?: string;

  @IsObject()
  @IsOptional()
  data?: {
    id?: string;
  };

  @IsString()
  @IsOptional()
  payment_id?: string;

  @IsString()
  @IsOptional()
  external_reference?: string;

  @IsString()
  @IsOptional()
  status?: string;
}
