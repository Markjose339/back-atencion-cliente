import { IsNotEmpty, IsString, MaxLength, Matches } from 'class-validator';

export class CreateServiceDto {
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @MaxLength(50, { message: 'El nombre no puede exceder los 50 caracteres' })
  name: string;

  @IsNotEmpty({ message: 'La abreviatura es obligatoria' })
  @IsString({ message: 'La abreviatura debe ser una cadena de texto' })
  @MaxLength(10, {
    message: 'La abreviatura no puede exceder los 10 caracteres',
  })
  abbreviation: string;

  @IsNotEmpty({ message: 'El código es obligatorio' })
  @IsString({ message: 'El código debe ser una cadena de texto' })
  @MaxLength(5, { message: 'El código no puede exceder los 5 caracteres' })
  @Matches(/^[A-Z0-9-]+$/, {
    message:
      'El código solo puede contener letras mayúsculas, números y guiones',
  })
  code: string;
}
