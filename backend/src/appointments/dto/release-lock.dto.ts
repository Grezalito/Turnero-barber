import { IsString, MaxLength } from 'class-validator';

export class ReleaseLockDto {
  /** Token devuelto por POST /appointments/:slotId/lock o POST /payments/create-preference. */
  @IsString({ message: 'lock_token es obligatorio para liberar el turno' })
  @MaxLength(128)
  lock_token!: string;
}
