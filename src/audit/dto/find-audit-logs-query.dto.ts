import { PaginationDto } from '@/pagination/dto/pagination.dto';
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class FindAuditLogsQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  auditableType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  userId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
