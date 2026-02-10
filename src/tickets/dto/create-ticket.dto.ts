import { IsEnum, IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class CreateTicketDto {
  @IsOptional()
  @IsString({ message: 'El código de paquete debe ser un texto' })
  packageCode?: string;

  @IsEnum(['REGULAR', 'PREFERENCIAL'], {
    message: 'El tipo de ticket debe ser REGULAR o PREFERENCIAL',
  })
  type: 'REGULAR' | 'PREFERENCIAL';

  @IsString({ message: 'branchId debe ser un texto' })
  @IsNotEmpty({ message: 'branchId es requerido' })
  branchId: string;

  @IsString({ message: 'serviceId debe ser un texto' })
  @IsNotEmpty({ message: 'serviceId es requerido' })
  serviceId: string;
}
