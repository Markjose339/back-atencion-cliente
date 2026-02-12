import { PaginationDto } from '@/pagination/dto/pagination.dto';
import { IsString } from 'class-validator';

export class OperatorQueueQueryDto extends PaginationDto {
  @IsString()
  branchId!: string;

  @IsString()
  serviceId!: string;
}
