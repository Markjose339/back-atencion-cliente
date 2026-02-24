import { Public } from '@/auth/decorators/public.decorator';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  ADVERTISEMENT_ALLOWED_UPLOAD_MIME_TYPES,
  ADVERTISEMENT_MAX_FILE_SIZE_BYTES,
  ADVERTISEMENT_UPLOAD_FIELD,
  ADVERTISEMENT_UPLOAD_SUBDIRECTORY,
} from './constants/advertisement.constants';
import { CreateAdvertisementDto } from './dto/create-advertisement.dto';
import { FindAdvertisementsQueryDto } from './dto/find-advertisements-query.dto';
import { UpdateAdvertisementDto } from './dto/update-advertisement.dto';
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

@Controller('advertisements')
export class AdvertisementsController {
  constructor(private readonly advertisementsService: AdvertisementsService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor(ADVERTISEMENT_UPLOAD_FIELD, {
      dest: ADVERTISEMENT_UPLOAD_DIR,
      limits: {
        fileSize: ADVERTISEMENT_MAX_FILE_SIZE_BYTES,
      },
      fileFilter: (
        _req: Request,
        file: AdvertisementUploadFile,
        callback: (error: Error | null, acceptFile: boolean) => void,
      ) => {
        if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.mimetype)) {
          callback(null, false);
          return;
        }

        callback(null, true);
      },
    }),
  )
  create(
    @Req() req: Request,
    @Body() createAdvertisementDto: CreateAdvertisementDto,
    @UploadedFile() file?: AdvertisementUploadFile,
  ) {
    this.advertisementsService.configureUploadTimeout(req);
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
