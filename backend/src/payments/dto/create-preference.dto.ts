import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class CreatePreferenceDto {
  @IsString()
  @IsNotEmpty({ message: 'El identificador del turno (slotId) es obligatorio' })
  slotId!: string;

  @IsString()
  @Matches(/^\d{7,9}$/, {
    message: 'El DNI debe contener entre 7 y 9 dígitos numéricos',
  })
  clientDni!: string;

  @IsString()
  @IsNotEmpty({ message: 'El nombre del cliente es obligatorio' })
  clientName!: string;

  @IsString()
  @IsNotEmpty({ message: 'El teléfono de WhatsApp es obligatorio' })
  clientPhone!: string;
}
