import { IsString } from 'class-validator';

export class CallNextDto {
  @IsString()
  branchId!: string;

  @IsString()
  serviceId!: string;
}
