import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateRoleDto {
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @Transform(({ value }: { value: string }) =>
    value.toLowerCase().trim().replace(/\s+/g, ' '),
  )
  name: string;

  @IsString({
    each: true,
    message: 'Cada ID de permiso debe ser una cadena de texto',
  })
  @IsNotEmpty({
    each: true,
    message: 'Los IDs de permisos no pueden estar vacíos',
  })
  @IsArray({ message: 'Los permisos deben enviarse como un arreglo' })
  @ArrayMinSize(1, {
    message: 'Debe asignar al menos un permiso al rol',
  })
  permissionIds: string[];
}
