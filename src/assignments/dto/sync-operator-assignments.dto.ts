import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class SyncOperatorAssignmentItemDto {
  @IsString({ message: 'userId debe ser un texto' })
  @IsNotEmpty({ message: 'userId es requerido' })
  userId!: string;

  @IsString({ message: 'windowId debe ser un texto' })
  @IsNotEmpty({ message: 'windowId es requerido' })
  windowId!: string;

  @IsOptional()
  @IsBoolean({ message: 'isActive debe ser un booleano' })
  isActive?: boolean = true;
}

export class SyncOperatorAssignmentsDto {
  @IsString({ message: 'branchId debe ser un texto' })
  @IsNotEmpty({ message: 'branchId es requerido' })
  branchId!: string;

  @IsArray({ message: 'assignments debe ser un arreglo' })
  @ValidateNested({ each: true })
  @Type(() => SyncOperatorAssignmentItemDto)
  assignments!: SyncOperatorAssignmentItemDto[];
}
