import { PaginationDto } from '@/pagination/dto/pagination.dto';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import {
  ADVERTISEMENT_DISPLAY_MODES,
  ADVERTISEMENT_MEDIA_TYPES,
} from '@/advertisements/constants/advertisement.constants';
import { toOptionalBoolean } from './transformers';

export class FindAdvertisementsQueryDto extends PaginationDto {
  @IsOptional()
  @IsIn(ADVERTISEMENT_MEDIA_TYPES, {
    message: `mediaType invÃ¡lido. Valores permitidos: ${ADVERTISEMENT_MEDIA_TYPES.join(', ')}`,
  })
  mediaType?: (typeof ADVERTISEMENT_MEDIA_TYPES)[number];

  @IsOptional()
  @IsIn(ADVERTISEMENT_DISPLAY_MODES, {
    message: `displayMode invÃ¡lido. Valores permitidos: ${ADVERTISEMENT_DISPLAY_MODES.join(', ')}`,
  })
  displayMode?: (typeof ADVERTISEMENT_DISPLAY_MODES)[number];

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean({ message: 'isActive debe ser booleano' })
  isActive?: boolean;

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean({ message: 'activeNow debe ser booleano' })
  activeNow?: boolean;
}
