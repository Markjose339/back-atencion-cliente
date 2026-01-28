import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(50, { message: 'El nombre no puede exceder los 50 caracteres' })
  name: string;

  @IsString({ message: 'El correo electrónico debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El correo electrónico es obligatorio' })
  @IsEmail({}, { message: 'Debe proporcionar un correo electrónico válido' })
  @MaxLength(100, {
    message: 'El correo electrónico no puede exceder los 100 caracteres',
  })
  @Transform(({ value }: { value: string }) =>
    value.toLowerCase().trim().replace(/\s+/g, ' '),
  )
  email: string;

  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La contraseña es obligatoria' })
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(20, {
    message: 'La contraseña no puede exceder los 20 caracteres',
  })
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&.#_-])[A-Za-z\d@$!%*?&.#_-]/,
    {
      message:
        'La contraseña debe contener: una letra mayúscula, una letra minúscula, un número y un carácter especial (@$!%*?&.#_-)',
    },
  )
  password: string;

  @IsOptional()
  @IsString({ message: 'La dirección debe ser una cadena de texto' })
  @MaxLength(255, {
    message: 'La dirección no puede exceder los 255 caracteres',
  })
  address?: string;

  @IsOptional()
  @IsString({ message: 'El teléfono debe ser una cadena de texto' })
  @MaxLength(15, { message: 'El teléfono no puede exceder los 15 caracteres' })
  @Matches(/^[\d\s\-+()]*$/, {
    message:
      'El teléfono solo puede contener dígitos, espacios y los caracteres especiales: + - ( )',
  })
  phone?: string;

  @IsBoolean({ message: 'El estado activo debe ser un valor booleano' })
  @IsNotEmpty({ message: 'El estado activo es obligatorio' })
  isActive: boolean;

  @IsArray({ message: 'Los roles deben proporcionarse como un arreglo' })
  @IsString({
    each: true,
    message: 'Cada ID de rol debe ser una cadena de texto',
  })
  @IsNotEmpty({ each: true, message: 'Cada ID de rol es obligatorio' })
  @ArrayMinSize(1, { message: 'Debe asignar al menos un rol al usuario' })
  roleIds: string[];
}
