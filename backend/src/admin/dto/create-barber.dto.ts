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
  @IsNotEmpty({ message: 'El nombre del barbero es obligatorio' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'El teléfono del barbero es obligatorio' })
  phone: string;

  @IsString()
  @IsOptional()
  shopName?: string;

  @IsString()
  @IsOptional()
  shop_name?: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsEmail({}, { message: 'El formato del email no es válido' })
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  address?: string;
}
