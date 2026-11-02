import { IsOptional, IsString } from 'class-validator';

export class ConfirmReturnDto {
  @IsString()
  @IsOptional()
  slotId?: string;

  @IsString()
  @IsOptional()
  external_reference?: string;

  @IsString()
  @IsOptional()
  paymentId?: string;

  @IsString()
  @IsOptional()
  payment_id?: string;

  @IsString()
  @IsOptional()
  collection_id?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  collection_status?: string;

  @IsString()
  @IsOptional()
  preference_id?: string;
}
