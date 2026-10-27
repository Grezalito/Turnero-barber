import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateBarberDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{7,9}$/, {
    message: 'El DNI debe contener entre 7 y 9 dígitos numéricos',
  })
  dni: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6, {
    message: 'La contraseña debe tener al menos 6 caracteres',
  })
  password: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsEmail({}, { message: 'El formato del email no es válido' })
  @IsOptional()
  email?: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'El slug solo puede contener letras minúsculas, números y guiones medios (ej: barberia-don-juan)',
  })
  slug: string;

  @IsString()
  @IsNotEmpty()
  shop_name: string;

  @IsString()
  @IsOptional()
  address?: string;
}
