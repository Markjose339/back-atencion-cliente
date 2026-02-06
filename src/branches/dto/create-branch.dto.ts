import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { BOLIVIA_DEPARTMENTS } from '@/branches/constants/bolivia-departments';
import type { BoliviaDepartment } from '@/branches/constants/bolivia-departments';

export class CreateBranchDto {
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @MaxLength(50, { message: 'El nombre no puede exceder los 50 caracteres' })
  name: string;

  @IsNotEmpty({ message: 'La dirección es obligatorio' })
  @IsString({ message: 'La dirección debe ser una cadena de texto' })
  @MaxLength(255, {
    message: 'La dirección no puede exceder los 255 caracteres',
  })
  address: string;

  @IsNotEmpty({ message: 'El departamento es obligatorio' })
  @IsString({ message: 'El departamento debe ser una cadena de texto' })
  @IsIn(BOLIVIA_DEPARTMENTS, {
    message: `Departamento inválido. Valores permitidos: ${BOLIVIA_DEPARTMENTS.join(', ')}`,
  })
  departmentName: BoliviaDepartment;
}
