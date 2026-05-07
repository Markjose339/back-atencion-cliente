import { IsNotEmpty, IsString, MaxLength, IsBoolean } from 'class-validator';

export class CreateServiceDto {
  @IsNotEmpty({ message: 'El nombre es obligatorio.' })
  @IsString({ message: 'El nombre debe ser una cadena de texto válida.' })
  @MaxLength(50, {
    message: 'El nombre no debe exceder los 50 caracteres.',
  })
  name!: string;

  @IsNotEmpty({ message: 'La abreviatura es obligatoria.' })
  @IsString({ message: 'La abreviatura debe ser una cadena de texto válida.' })
  @MaxLength(10, {
    message: 'La abreviatura no debe exceder los 10 caracteres.',
  })
  abbreviation!: string;

  @IsNotEmpty({
    message: 'Debe indicar si el servicio requiere código.',
  })
  @IsBoolean({
    message: 'El campo debe ser un valor booleano (true o false).',
  })
  code!: boolean;

  @IsBoolean({ message: 'El estado activo debe ser un valor booleano' })
  @IsNotEmpty({ message: 'El estado activo es obligatorio' })
  isActive!: boolean;
}
