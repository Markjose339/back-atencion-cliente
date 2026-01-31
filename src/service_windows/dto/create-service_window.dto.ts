import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CreateServiceWindowDto {
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @Transform(({ value }: { value: string }) =>
    value.toLowerCase().trim().replace(/\s+/g, ' '),
  )
  name: string;

  @IsNotEmpty({ message: 'El codigo es obligatorio' })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @Transform(({ value }: { value: string }) =>
    value.toUpperCase().trim().replace(/\s+/g, ' '),
  )
  code: string;
}
