import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateOperatorAssignmentDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
