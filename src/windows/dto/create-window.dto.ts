import { IsBoolean, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateWindowDto {
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @MaxLength(50, { message: 'El nombre no puede exceder los 50 caracteres' })
  name: string;

  @IsNotEmpty({ message: 'El codigo es obligatorio' })
  code: string;

  @IsBoolean({ message: 'El estado activo debe ser un valor booleano' })
  @IsNotEmpty({ message: 'El estado activo es obligatorio' })
  isActive: boolean;
}
