import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{7,9}$/, {
    message: 'El DNI debe contener únicamente entre 7 y 9 dígitos numéricos',
  })
  dni: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6, {
    message: 'La contraseña debe tener al menos 6 caracteres',
  })
  password: string;
}
