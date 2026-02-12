import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateWindowServiceDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
