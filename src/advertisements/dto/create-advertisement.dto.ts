import { Transform } from 'class-transformer';
import {
  IsInt,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  Max,
  IsString,
  Min,
  MaxLength,
} from 'class-validator';
import {
  ADVERTISEMENT_DEFAULT_PLAYBACK_ORDER,
  ADVERTISEMENT_DEFAULT_VIDEO_VOLUME,
  ADVERTISEMENT_DISPLAY_MODES,
  ADVERTISEMENT_MAX_VIDEO_VOLUME,
  ADVERTISEMENT_MIN_PLAYBACK_ORDER,
  ADVERTISEMENT_MIN_VIDEO_VOLUME,
  ADVERTISEMENT_MEDIA_TYPES,
} from '@/advertisements/constants/advertisement.constants';
import {
  toOptionalBoolean,
  toOptionalNumber,
} from './transformers';

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
  @Transform(toOptionalNumber)
  @IsInt({ message: 'playbackOrder debe ser un numero entero' })
  @Min(ADVERTISEMENT_MIN_PLAYBACK_ORDER, {
    message: `playbackOrder no puede ser menor que ${ADVERTISEMENT_MIN_PLAYBACK_ORDER}`,
  })
  playbackOrder?: number = ADVERTISEMENT_DEFAULT_PLAYBACK_ORDER;

  @IsOptional()
  @Transform(toOptionalNumber)
  @IsInt({ message: 'videoVolume debe ser un numero entero' })
  @Min(ADVERTISEMENT_MIN_VIDEO_VOLUME, {
    message: `videoVolume no puede ser menor que ${ADVERTISEMENT_MIN_VIDEO_VOLUME}`,
  })
  @Max(ADVERTISEMENT_MAX_VIDEO_VOLUME, {
    message: `videoVolume no puede ser mayor que ${ADVERTISEMENT_MAX_VIDEO_VOLUME}`,
  })
  videoVolume?: number = ADVERTISEMENT_DEFAULT_VIDEO_VOLUME;

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean({ message: 'videoMuted debe ser booleano' })
  videoMuted?: boolean;
}
