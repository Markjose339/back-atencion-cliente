import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateWindowServiceDto {
  @IsString({ message: 'branchId debe ser un texto' })
  @IsNotEmpty({ message: 'branchId es requerido' })
  branchId!: string;

  @IsString({ message: 'windowId debe ser un texto' })
  @IsNotEmpty({ message: 'windowId es requerido' })
  windowId!: string;

  @IsArray({ message: 'serviceIds debe ser un arreglo' })
  @ArrayMinSize(1, {
    message: 'Debe enviar al menos un servicio para asignar',
  })
  @IsString({
    each: true,
    message: 'Cada serviceId debe ser un texto',
  })
  @IsNotEmpty({
    each: true,
    message: 'Ningun serviceId puede estar vacio',
  })
  serviceIds!: string[];

  @IsOptional()
  @IsBoolean({ message: 'isActive debe ser un booleano' })
  isActive?: boolean = true;
}
