import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export class CreateTicketDto {
  @IsString({ message: 'El código de paquete debe ser un texto' })
  @IsNotEmpty({ message: 'El código de paquete es requerido' })
  packageCode: string;

  @IsEnum(['REGULAR', 'PREFERENCIAL'], {
    message: 'El tipo de ticket debe ser REGULAR o PREFERENCIAL',
  })
  type: 'REGULAR' | 'PREFERENCIAL';
}
