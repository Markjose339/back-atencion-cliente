import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsString, ValidateNested } from 'class-validator';

class SyncWindowServicesItemDto {
  @IsString({ message: 'windowId debe ser un texto' })
  @IsNotEmpty({ message: 'windowId es requerido' })
  windowId!: string;

  @IsArray({ message: 'serviceIds debe ser un arreglo' })
  @IsString({
    each: true,
    message: 'Cada serviceId debe ser un texto',
  })
  @IsNotEmpty({
    each: true,
    message: 'Ningun serviceId puede estar vacio',
  })
  serviceIds!: string[];
}

export class SyncWindowServicesDto {
  @IsString({ message: 'branchId debe ser un texto' })
  @IsNotEmpty({ message: 'branchId es requerido' })
  branchId!: string;

  @IsArray({ message: 'windowServices debe ser un arreglo' })
  @ValidateNested({ each: true })
  @Type(() => SyncWindowServicesItemDto)
  windowServices!: SyncWindowServicesItemDto[];
}
