import { Public } from '@/auth/decorators/public.decorator';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import type { Request } from 'express';
import { mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import {
  ADVERTISEMENT_ALLOWED_UPLOAD_MIME_TYPES,
  ADVERTISEMENT_MAX_FILE_SIZE_BYTES,
  ADVERTISEMENT_UPLOAD_FIELD,
  ADVERTISEMENT_UPLOAD_SUBDIRECTORY,
} from './constants/advertisement.constants';
import { CreateAdvertisementDto } from './dto/create-advertisement.dto';
import { FindAdvertisementsQueryDto } from './dto/find-advertisements-query.dto';
import { UpdateAdvertisementDto } from './dto/update-advertisement.dto';
import { AdvertisementUploadExceptionFilter } from './filters/advertisement-upload-exception.filter';
import type { AdvertisementUploadFile } from './interfaces/advertisement-upload-file.interface';
import { AdvertisementsService } from './advertisements.service';

const ADVERTISEMENT_UPLOAD_DIR = join(
  process.cwd(),
  'uploads',
  ADVERTISEMENT_UPLOAD_SUBDIRECTORY,
);
mkdirSync(ADVERTISEMENT_UPLOAD_DIR, { recursive: true });
const ALLOWED_UPLOAD_MIME_TYPES = new Set<string>(
  ADVERTISEMENT_ALLOWED_UPLOAD_MIME_TYPES,
);

const buildUploadFileName = (originalName: string): string => {
  const extension = extname(originalName).toLowerCase();
  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  return `${uniqueSuffix}${extension}`;
};

@Controller('advertisements')
export class AdvertisementsController {
  constructor(private readonly advertisementsService: AdvertisementsService) {}

  @Post()
  createWithoutFile(@Body() createAdvertisementDto: CreateAdvertisementDto) {
    return this.advertisementsService.create(createAdvertisementDto);
  }

  @Post('upload')
  @UseFilters(AdvertisementUploadExceptionFilter)
  @UseInterceptors(
    FileInterceptor(ADVERTISEMENT_UPLOAD_FIELD, {
      storage: diskStorage({
        destination: (_req, _file, callback) => {
          callback(null, ADVERTISEMENT_UPLOAD_DIR);
        },
        filename: (_req, file: AdvertisementUploadFile, callback) => {
          callback(null, buildUploadFileName(file.originalname));
        },
      }),
      limits: {
        fileSize: ADVERTISEMENT_MAX_FILE_SIZE_BYTES,
      },
      fileFilter: (
        _req: Request,
        file: AdvertisementUploadFile,
        callback: (error: Error | null, acceptFile: boolean) => void,
      ) => {
        if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.mimetype)) {
          callback(
            new BadRequestException(
              `Tipo de archivo no permitido: ${file.mimetype}`,
            ),
            false,
          );
          return;
        }

        callback(null, true);
      },
    }),
  )
  create(
    @Body() createAdvertisementDto: CreateAdvertisementDto,
    @UploadedFile() file?: AdvertisementUploadFile,
  ) {
    return this.advertisementsService.create(createAdvertisementDto, file);
  }

  @Get()
  findAll(@Query() findAdvertisementsQueryDto: FindAdvertisementsQueryDto) {
    return this.advertisementsService.findAll(findAdvertisementsQueryDto);
  }

  @Get('playlist')
  @Public()
  getActivePlaylist(@Query() query: FindAdvertisementsQueryDto) {
    return this.advertisementsService.getActivePlaylist(query.displayMode);
  }

  @Get('options')
  getOptions() {
    return this.advertisementsService.getOptions();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.advertisementsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateAdvertisementDto: UpdateAdvertisementDto,
  ) {
    return this.advertisementsService.update(id, updateAdvertisementDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.advertisementsService.remove(id);
  }
}
