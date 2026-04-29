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
  Req,
  UploadedFile,
  UseFilters,
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
import { AdvertisementUploadExceptionFilter } from './filters/advertisement-upload-exception.filter';
import { AdvertisementsService } from './advertisements.service';
import type { Request } from 'express';
import type { User } from '@/users/interfaces/user.interface';
import { buildAuditContext } from '@/audit/utils/build-audit-context';

const ADVERTISEMENT_UPLOAD_DIR = join(
  process.cwd(),
  'uploads',
  ADVERTISEMENT_UPLOAD_SUBDIRECTORY,
);
mkdirSync(ADVERTISEMENT_UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME_TYPES = new Set<string>(
  ADVERTISEMENT_ALLOWED_UPLOAD_MIME_TYPES,
);

const fileInterceptor = FileInterceptor(ADVERTISEMENT_UPLOAD_FIELD, {
  storage: diskStorage({
    destination: (_req, _file, cb) => cb(null, ADVERTISEMENT_UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
  limits: { fileSize: ADVERTISEMENT_MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(
        new BadRequestException(
          `Tipo de archivo no permitido: ${file.mimetype}`,
        ),
        false,
      );
      return;
    }
    cb(null, true);
  },
});

@Controller('advertisements')
export class AdvertisementsController {
  constructor(private readonly advertisementsService: AdvertisementsService) {}

  private getAuditContext(req: Request) {
    const userId = (req as Request & { user?: User }).user?.id;
    return buildAuditContext(req, userId);
  }

  @Post()
  create(@Body() dto: CreateAdvertisementDto, @Req() req: Request) {
    return this.advertisementsService.create(dto, undefined, this.getAuditContext(req));
  }

  @Post('upload')
  @UseFilters(AdvertisementUploadExceptionFilter)
  @UseInterceptors(fileInterceptor)
  createWithFile(
    @Body() dto: CreateAdvertisementDto,
    @Req() req: Request,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.advertisementsService.create(dto, file, this.getAuditContext(req));
  }

  @Get()
  findAll(@Query() query: FindAdvertisementsQueryDto) {
    return this.advertisementsService.findAll(query);
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
    @Body() dto: UpdateAdvertisementDto,
    @Req() req: Request,
  ) {
    return this.advertisementsService.update(id, dto, this.getAuditContext(req));
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: Request) {
    return this.advertisementsService.remove(id, this.getAuditContext(req));
  }
}
