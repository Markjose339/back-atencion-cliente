import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateWindowServiceDto {
  @IsString()
  branchId!: string;

  @IsString()
  windowId!: string;

  @IsString()
  serviceId!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}
