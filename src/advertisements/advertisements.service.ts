import { DB_CONN } from '@/database/db.conn';
import { schema } from '@/database/schema';
import { PaginationService } from '@/pagination/pagination.service';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ADVERTISEMENT_ALLOWED_IMAGE_MIME_TYPES,
  ADVERTISEMENT_ALLOWED_VIDEO_MIME_TYPES,
  ADVERTISEMENT_DEFAULT_DISPLAY_MODE,
  ADVERTISEMENT_DEFAULT_DURATION_SECONDS,
  ADVERTISEMENT_DEFAULT_TRANSITION,
  ADVERTISEMENT_MEDIA_TYPES,
  ADVERTISEMENT_DISPLAY_MODES,
  ADVERTISEMENT_TRANSITIONS,
  ADVERTISEMENT_UPLOAD_SUBDIRECTORY,
  type AdvertisementDisplayMode,
  type AdvertisementMediaType,
} from './constants/advertisement.constants';
import { CreateAdvertisementDto } from './dto/create-advertisement.dto';
import { FindAdvertisementsQueryDto } from './dto/find-advertisements-query.dto';
import { UpdateAdvertisementDto } from './dto/update-advertisement.dto';
import type { AdvertisementUploadFile } from './interfaces/advertisement-upload-file.interface';
import { AdvertisementResponse } from './interfaces/advertisement.interface';

type AdvertisementRow = typeof schema.advertisements.$inferSelect;

@Injectable()
export class AdvertisementsService extends PaginationService {
  private readonly uploadsRootDir = join(process.cwd(), 'uploads');

  constructor(
    @Inject(DB_CONN)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {
    super();
  }

  async create(
    createAdvertisementDto: CreateAdvertisementDto,
    file?: AdvertisementUploadFile,
  ): Promise<AdvertisementResponse> {
    if (!file) {
      throw new BadRequestException('Debe enviar una imagen o video');
    }

    const mediaType = this.resolveMediaTypeFromMime(file.mimetype);
    if (!mediaType) {
      await this.safeDeletePhysicalFile(
        this.toUploadRelativePath(file.filename ?? ''),
      );
      throw new BadRequestException('Tipo de archivo no permitido');
    }

    this.validateSchedule(
      createAdvertisementDto.startsAt ?? null,
      createAdvertisementDto.endsAt ?? null,
    );

    const filePath = this.toUploadRelativePath(file.filename);

    try {
      const [advertisement] = await this.db
        .insert(schema.advertisements)
        .values({
          title: createAdvertisementDto.title.trim(),
          description: createAdvertisementDto.description?.trim() ?? null,
          mediaType,
          fileName: file.originalname,
          filePath,
          mimeType: file.mimetype,
          fileSize: file.size,
          displayMode:
            createAdvertisementDto.displayMode ??
            ADVERTISEMENT_DEFAULT_DISPLAY_MODE,
          transition:
            createAdvertisementDto.transition ??
            ADVERTISEMENT_DEFAULT_TRANSITION,
          durationSeconds:
            createAdvertisementDto.durationSeconds ??
            ADVERTISEMENT_DEFAULT_DURATION_SECONDS,
          sortOrder: createAdvertisementDto.sortOrder ?? 0,
          isActive: createAdvertisementDto.isActive ?? true,
          startsAt: createAdvertisementDto.startsAt ?? null,
          endsAt: createAdvertisementDto.endsAt ?? null,
        })
        .returning();

      return this.toResponse(advertisement);
    } catch (error) {
      await this.safeDeletePhysicalFile(filePath);
      throw error;
    }
  }

  async findAll(findAdvertisementsQueryDto: FindAdvertisementsQueryDto) {
    const { page, limit } = this.validatePaginationParams(
      findAdvertisementsQueryDto,
    );
    const skip = this.calculateSkip(page, limit);
    const where = this.buildFindWhere(findAdvertisementsQueryDto);

    const [rows, [{ value: total }]] = await Promise.all([
      this.db.query.advertisements.findMany({
        where,
        limit,
        offset: skip,
        orderBy: (advertisements, { asc, desc }) => [
          asc(advertisements.sortOrder),
          desc(advertisements.createdAt),
        ],
      }),
      this.db
        .select({ value: count() })
        .from(schema.advertisements)
        .where(where),
    ]);

    const data = rows.map((row) => this.toResponse(row));
    const meta = this.buildPaginationMeta(total, page, limit, data.length);

    return { data, meta };
  }

  async findOne(id: string): Promise<AdvertisementResponse> {
    const advertisement = await this.validateAdvertisementId(id);
    return this.toResponse(advertisement);
  }

  async update(
    id: string,
    updateAdvertisementDto: UpdateAdvertisementDto,
  ): Promise<AdvertisementResponse> {
    const current = await this.validateAdvertisementId(id);
    const startsAt =
      updateAdvertisementDto.startsAt === undefined
        ? current.startsAt
        : updateAdvertisementDto.startsAt;
    const endsAt =
      updateAdvertisementDto.endsAt === undefined
        ? current.endsAt
        : updateAdvertisementDto.endsAt;

    this.validateSchedule(startsAt ?? null, endsAt ?? null);

    const values = {
      ...(updateAdvertisementDto.title !== undefined
        ? { title: updateAdvertisementDto.title.trim() }
        : {}),
      ...(updateAdvertisementDto.description !== undefined
        ? { description: updateAdvertisementDto.description?.trim() ?? null }
        : {}),
      ...(updateAdvertisementDto.displayMode !== undefined
        ? { displayMode: updateAdvertisementDto.displayMode }
        : {}),
      ...(updateAdvertisementDto.transition !== undefined
        ? { transition: updateAdvertisementDto.transition }
        : {}),
      ...(updateAdvertisementDto.durationSeconds !== undefined
        ? { durationSeconds: updateAdvertisementDto.durationSeconds }
        : {}),
      ...(updateAdvertisementDto.sortOrder !== undefined
        ? { sortOrder: updateAdvertisementDto.sortOrder }
        : {}),
      ...(updateAdvertisementDto.isActive !== undefined
        ? { isActive: updateAdvertisementDto.isActive }
        : {}),
      ...(updateAdvertisementDto.startsAt !== undefined
        ? { startsAt: updateAdvertisementDto.startsAt ?? null }
        : {}),
      ...(updateAdvertisementDto.endsAt !== undefined
        ? { endsAt: updateAdvertisementDto.endsAt ?? null }
        : {}),
      updatedAt: sql`now()`,
    };

    if (Object.keys(values).length === 1) {
      return this.toResponse(current);
    }

    const [updated] = await this.db
      .update(schema.advertisements)
      .set(values)
      .where(eq(schema.advertisements.id, id))
      .returning();

    return this.toResponse(updated);
  }

  async remove(id: string) {
    const advertisement = await this.validateAdvertisementId(id);

    await this.db
      .delete(schema.advertisements)
      .where(eq(schema.advertisements.id, id));

    await this.safeDeletePhysicalFile(advertisement.filePath);

    return { id, message: 'Publicidad eliminada correctamente' };
  }

  async getActivePlaylist(displayMode?: AdvertisementDisplayMode) {
    const now = new Date();
    const where = this.combineWhere([
      this.buildActiveNowFilter(now),
      displayMode
        ? eq(schema.advertisements.displayMode, displayMode)
        : undefined,
    ]);

    const rows = await this.db.query.advertisements.findMany({
      where,
      orderBy: [
        asc(schema.advertisements.sortOrder),
        desc(schema.advertisements.createdAt),
      ],
    });

    return rows.map((row) => this.toResponse(row, now));
  }

  getOptions() {
    return {
      mediaTypes: [...ADVERTISEMENT_MEDIA_TYPES],
      displayModes: [...ADVERTISEMENT_DISPLAY_MODES],
      transitions: [...ADVERTISEMENT_TRANSITIONS],
    };
  }

  private async validateAdvertisementId(id: string): Promise<AdvertisementRow> {
    const advertisement = await this.db.query.advertisements.findFirst({
      where: eq(schema.advertisements.id, id),
    });

    if (!advertisement) {
      throw new NotFoundException(`Publicidad con id ${id} no encontrada`);
    }

    return advertisement;
  }

  private buildFindWhere(
    query: FindAdvertisementsQueryDto,
  ): SQL<unknown> | undefined {
    const search = query.search?.trim();
    const where = this.combineWhere([
      search
        ? or(
            ilike(schema.advertisements.id, `%${search}%`),
            ilike(schema.advertisements.title, `%${search}%`),
            ilike(schema.advertisements.description, `%${search}%`),
          )
        : undefined,
      query.mediaType
        ? eq(schema.advertisements.mediaType, query.mediaType)
        : undefined,
      query.displayMode
        ? eq(schema.advertisements.displayMode, query.displayMode)
        : undefined,
      query.isActive !== undefined
        ? eq(schema.advertisements.isActive, query.isActive)
        : undefined,
      query.activeNow ? this.buildActiveNowFilter(new Date()) : undefined,
    ]);

    return where;
  }

  private combineWhere(
    conditions: Array<SQL<unknown> | undefined>,
  ): SQL<unknown> | undefined {
    const validConditions = conditions.filter(
      (condition): condition is SQL<unknown> => condition !== undefined,
    );

    if (validConditions.length === 0) return undefined;
    return and(...validConditions);
  }

  private buildActiveNowFilter(now: Date): SQL<unknown> {
    return and(
      eq(schema.advertisements.isActive, true),
      or(
        isNull(schema.advertisements.startsAt),
        lte(schema.advertisements.startsAt, now),
      ),
      or(
        isNull(schema.advertisements.endsAt),
        gte(schema.advertisements.endsAt, now),
      ),
    ) as SQL<unknown>;
  }

  private validateSchedule(startsAt: Date | null, endsAt: Date | null): void {
    if (startsAt && endsAt && endsAt <= startsAt) {
      throw new BadRequestException('endsAt debe ser mayor que startsAt');
    }
  }

  private resolveMediaTypeFromMime(
    mimeType: string,
  ): AdvertisementMediaType | null {
    if (
      (ADVERTISEMENT_ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(
        mimeType,
      )
    ) {
      return 'IMAGE';
    }

    if (
      (ADVERTISEMENT_ALLOWED_VIDEO_MIME_TYPES as readonly string[]).includes(
        mimeType,
      )
    ) {
      return 'VIDEO';
    }

    return null;
  }

  private toUploadRelativePath(fileName: string): string {
    return `${ADVERTISEMENT_UPLOAD_SUBDIRECTORY}/${fileName}`.replace(
      /\\/g,
      '/',
    );
  }

  private async safeDeletePhysicalFile(filePath: string): Promise<void> {
    if (!filePath) return;

    const absolutePath = join(this.uploadsRootDir, filePath);

    try {
      await unlink(absolutePath);
    } catch {
      // No bloquea la operacion principal si el archivo ya no existe.
    }
  }

  private toResponse(
    advertisement: AdvertisementRow,
    now: Date = new Date(),
  ): AdvertisementResponse {
    const filePath = advertisement.filePath
      .replace(/\\/g, '/')
      .replace(/^\/+/, '');

    return {
      id: advertisement.id,
      title: advertisement.title,
      description: advertisement.description,
      mediaType: advertisement.mediaType,
      fileName: advertisement.fileName,
      filePath: advertisement.filePath,
      mimeType: advertisement.mimeType,
      fileSize: advertisement.fileSize,
      fileUrl: `/uploads/${filePath}`,
      displayMode: advertisement.displayMode,
      transition: advertisement.transition,
      durationSeconds: advertisement.durationSeconds,
      sortOrder: advertisement.sortOrder,
      isActive: advertisement.isActive,
      startsAt: advertisement.startsAt,
      endsAt: advertisement.endsAt,
      isVisibleNow: this.isVisibleNow(advertisement, now),
      createdAt: advertisement.createdAt,
      updatedAt: advertisement.updatedAt,
    };
  }

  private isVisibleNow(advertisement: AdvertisementRow, now: Date): boolean {
    if (!advertisement.isActive) return false;
    if (advertisement.startsAt && advertisement.startsAt > now) return false;
    if (advertisement.endsAt && advertisement.endsAt < now) return false;
    return true;
  }
}
