import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateOperatorAssignmentDto {
  @IsString()
  userId!: string;

  @IsString()
  branchId!: string;

  @IsString()
  windowId!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}
