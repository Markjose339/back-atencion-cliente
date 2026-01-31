import { PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';
import { IsString, Matches, MinLength, ValidateIf } from 'class-validator';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ValidateIf(
    (o: UpdateUserDto) => o.password !== undefined && o.password !== '',
  )
  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&.#_-])[A-Za-z\d@$!%*?&.#_-]/,
    {
      message:
        'La contraseña debe contener: una letra mayúscula, una letra minúscula, un número y un carácter especial (@$!%*?&.#_-)',
    },
  )
  password?: string;
}
