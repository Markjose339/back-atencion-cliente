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
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
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
import { AdvertisementsService } from './advertisements.service';

const ADVERTISEMENT_UPLOAD_DIR = join(
  process.cwd(),
  'uploads',
  ADVERTISEMENT_UPLOAD_SUBDIRECTORY,
);

@Controller('advertisements')
export class AdvertisementsController {
  constructor(private readonly advertisementsService: AdvertisementsService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor(ADVERTISEMENT_UPLOAD_FIELD, {
      storage: diskStorage({
        destination: (_req, _file, callback) => {
          mkdirSync(ADVERTISEMENT_UPLOAD_DIR, { recursive: true });
          callback(null, ADVERTISEMENT_UPLOAD_DIR);
        },
        filename: (_req, file, callback) => {
          const extension = extname(file.originalname || '').toLowerCase();
          const safeExtension = extension.length <= 10 ? extension : '';
          const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExtension}`;
          callback(null, uniqueName);
        },
      }),
      limits: {
        fileSize: ADVERTISEMENT_MAX_FILE_SIZE_BYTES,
      },
      fileFilter: (_req, file, callback) => {
        const allowedMimeTypes =
          ADVERTISEMENT_ALLOWED_UPLOAD_MIME_TYPES as readonly string[];

        if (!allowedMimeTypes.includes(file.mimetype)) {
          callback(
            new BadRequestException(
              `Tipo de archivo no permitido. Usa: ${allowedMimeTypes.join(', ')}`,
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
    @UploadedFile() file?: Express.Multer.File,
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
