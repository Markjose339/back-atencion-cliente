import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateAssignmentDto {
  @IsNotEmpty({ message: 'El id de la sucursal es obligatorio' })
  @IsString({ message: 'El id de la sucursal debe ser una cadena de texto' })
  @MaxLength(24, {
    message: 'El id de la sucursal no puede exceder los 24 caracteres',
  })
  branchId: string;

  @IsNotEmpty({ message: 'El id de la ventana es obligatorio' })
  @IsString({ message: 'El id de la ventana debe ser una cadena de texto' })
  @MaxLength(24, {
    message: 'El id de la ventana no puede exceder los 24 caracteres',
  })
  windowId: string;

  @IsNotEmpty({ message: 'El id del servicio es obligatorio' })
  @IsString({ message: 'El id del servicio debe ser una cadena de texto' })
  @MaxLength(24, {
    message: 'El id del servicio no puede exceder los 24 caracteres',
  })
  serviceId: string;

  @IsNotEmpty({ message: 'El id del usuario es obligatorio' })
  @IsString({ message: 'El id del usuario debe ser una cadena de texto' })
  @MaxLength(24, {
    message: 'El id del usuario no puede exceder los 24 caracteres',
  })
  userId: string;
}
