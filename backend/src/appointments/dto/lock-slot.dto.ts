import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class LockSlotDto {
  @IsString()
  @IsOptional()
  @Matches(/^\d{7,9}$/, {
    message: 'El DNI debe contener entre 7 y 9 dígitos numéricos',
  })
  dni?: string;

  @IsString()
  @IsOptional()
  @MinLength(6, {
    message: 'La contraseña debe tener al menos 6 caracteres',
  })
  password?: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEmail({}, { message: 'El formato del email no es válido' })
  @IsOptional()
  email?: string;
}
