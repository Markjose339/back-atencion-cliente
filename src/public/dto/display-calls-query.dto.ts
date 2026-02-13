import { IsNotEmpty, IsString } from 'class-validator';

export class DisplayCallsQueryDto {
  @IsString({ message: 'branchId debe ser un texto' })
  @IsNotEmpty({ message: 'branchId es requerido' })
  branchId!: string;

  @IsString({ message: 'serviceIds debe ser un texto CSV' })
  @IsNotEmpty({ message: 'serviceIds es requerido (CSV)' })
  serviceIds!: string;
}
