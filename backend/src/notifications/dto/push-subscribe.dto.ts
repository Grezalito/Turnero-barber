import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class PushKeysDto {
  @IsString()
  @MaxLength(256)
  p256dh!: string;

  @IsString()
  @MaxLength(128)
  auth!: string;
}

export class PushSubscriptionJsonDto {
  @IsUrl({ protocols: ['https'], require_protocol: true }, { message: 'endpoint debe ser una URL https' })
  @MaxLength(1024)
  endpoint!: string;

  @IsOptional()
  @IsNumber()
  expirationTime?: number | null;

  @ValidateNested()
  @Type(() => PushKeysDto)
  keys!: PushKeysDto;
}

export class PushSubscribeDto {
  @IsString()
  @MaxLength(64)
  slot_id!: string;

  /** lockToken emitido al bloquear el turno: prueba que este dispositivo es del titular. */
  @IsString()
  @MaxLength(128)
  lock_token!: string;

  @ValidateNested()
  @Type(() => PushSubscriptionJsonDto)
  subscription!: PushSubscriptionJsonDto;
}
