import { PaginationDto } from '@/pagination/dto/pagination.dto';
import { IsOptional, IsString } from 'class-validator';

export class AdminTicketTimelineQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  branchId?: string;
}
