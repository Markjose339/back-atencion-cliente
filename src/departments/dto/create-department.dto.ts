import { IsNotEmpty, IsString, MaxLength, Matches } from 'class-validator';

export class CreateDepartmentDto {
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @MaxLength(25, { message: 'El nombre no puede exceder los 25 caracteres' })
  name: string;

  @IsNotEmpty({ message: 'El código es obligatorio' })
  @IsString({ message: 'El código debe ser una cadena de texto' })
  @MaxLength(10, { message: 'El código no puede exceder los 10 caracteres' })
  @Matches(/^[A-Z0-9-]+$/, {
    message:
      'El código solo puede contener letras mayúsculas, números y guiones',
  })
  code: string;
}
