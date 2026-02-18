import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ADVERTISEMENT_DISPLAY_MODES,
  ADVERTISEMENT_TRANSITIONS,
} from '@/advertisements/constants/advertisement.constants';
import {
  toOptionalBoolean,
  toOptionalDateOrNull,
  toOptionalNumber,
} from './transformers';

export class CreateAdvertisementDto {
  @IsNotEmpty({ message: 'El tÃ­tulo es obligatorio' })
  @IsString({ message: 'El tÃ­tulo debe ser texto' })
  @MaxLength(120, { message: 'El tÃ­tulo no puede exceder 120 caracteres' })
  title: string;

  @IsOptional()
  @IsString({ message: 'La descripciÃ³n debe ser texto' })
  @MaxLength(300, {
    message: 'La descripciÃ³n no puede exceder 300 caracteres',
  })
  description?: string;

  @IsOptional()
  @IsIn(ADVERTISEMENT_DISPLAY_MODES, {
    message: `displayMode invÃ¡lido. Valores permitidos: ${ADVERTISEMENT_DISPLAY_MODES.join(', ')}`,
  })
  displayMode?: (typeof ADVERTISEMENT_DISPLAY_MODES)[number];

  @IsOptional()
  @IsIn(ADVERTISEMENT_TRANSITIONS, {
    message: `transition invÃ¡lida. Valores permitidos: ${ADVERTISEMENT_TRANSITIONS.join(', ')}`,
  })
  transition?: (typeof ADVERTISEMENT_TRANSITIONS)[number];

  @IsOptional()
  @Transform(toOptionalNumber)
  @IsInt({ message: 'durationSeconds debe ser un entero' })
  @Min(1, { message: 'durationSeconds debe ser mayor o igual a 1' })
  @Max(300, { message: 'durationSeconds debe ser menor o igual a 300' })
  durationSeconds?: number;

  @IsOptional()
  @Transform(toOptionalNumber)
  @IsInt({ message: 'sortOrder debe ser un entero' })
  @Min(0, { message: 'sortOrder debe ser mayor o igual a 0' })
  sortOrder?: number;

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean({ message: 'isActive debe ser booleano' })
  isActive?: boolean;

  @IsOptional()
  @Transform(toOptionalDateOrNull)
  @IsDate({ message: 'startsAt debe ser una fecha vÃ¡lida' })
  startsAt?: Date | null;

  @IsOptional()
  @Transform(toOptionalDateOrNull)
  @IsDate({ message: 'endsAt debe ser una fecha vÃ¡lida' })
  endsAt?: Date | null;
}
