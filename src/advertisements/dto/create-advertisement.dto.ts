import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  ADVERTISEMENT_DISPLAY_MODES,
  ADVERTISEMENT_MEDIA_TYPES,
} from '@/advertisements/constants/advertisement.constants';
import { toOptionalBoolean, toOptionalDateOrNull } from './transformers';

export class CreateAdvertisementDto {
  @IsNotEmpty({ message: 'El titulo es obligatorio' })
  @IsString({ message: 'El titulo debe ser texto' })
  @MaxLength(120, { message: 'El titulo no puede exceder 120 caracteres' })
  title: string;

  @IsNotEmpty({ message: 'mediaType es obligatorio' })
  @IsIn(ADVERTISEMENT_MEDIA_TYPES, {
    message: `mediaType invalido. Valores permitidos: ${ADVERTISEMENT_MEDIA_TYPES.join(', ')}`,
  })
  mediaType: (typeof ADVERTISEMENT_MEDIA_TYPES)[number];

  @IsOptional()
  @IsIn(ADVERTISEMENT_DISPLAY_MODES, {
    message: `displayMode invalido. Valores permitidos: ${ADVERTISEMENT_DISPLAY_MODES.join(', ')}`,
  })
  displayMode?: (typeof ADVERTISEMENT_DISPLAY_MODES)[number];

  @IsOptional()
  @IsString({ message: 'textContent debe ser texto' })
  @MaxLength(500, {
    message: 'textContent no puede exceder 500 caracteres',
  })
  textContent?: string;

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean({ message: 'isActive debe ser booleano' })
  isActive?: boolean;

  @IsOptional()
  @Transform(toOptionalDateOrNull)
  @IsDate({ message: 'startsAt debe ser una fecha valida' })
  startsAt?: Date | null;

  @IsOptional()
  @Transform(toOptionalDateOrNull)
  @IsDate({ message: 'endsAt debe ser una fecha valida' })
  endsAt?: Date | null;
}
