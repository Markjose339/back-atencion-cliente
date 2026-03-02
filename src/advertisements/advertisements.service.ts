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
import { isAbsolute, join, normalize } from 'node:path';
import {
  ADVERTISEMENT_ALLOWED_IMAGE_MIME_TYPES,
  ADVERTISEMENT_ALLOWED_VIDEO_MIME_TYPES,
  ADVERTISEMENT_DEFAULT_DISPLAY_MODE,
  ADVERTISEMENT_DISPLAY_MODES,
  ADVERTISEMENT_MEDIA_TYPES,
  ADVERTISEMENT_UPLOAD_SUBDIRECTORY,
  type AdvertisementDisplayMode,
  type AdvertisementMediaType,
} from './constants/advertisement.constants';
import { CreateAdvertisementDto } from './dto/create-advertisement.dto';
import { FindAdvertisementsQueryDto } from './dto/find-advertisements-query.dto';
import { UpdateAdvertisementDto } from './dto/update-advertisement.dto';
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
    dto: CreateAdvertisementDto,
    file?: Express.Multer.File,
  ): Promise<AdvertisementResponse> {
    this.validateSchedule(dto.startsAt ?? null, dto.endsAt ?? null);

    const { mediaType } = dto;
    const normalizedTextContent = this.normalizeTextContent(dto.textContent);

    let filePath: string | null = null;
    let mimeType: string | null = null;
    let fileSize: number | null = null;

    if (mediaType === 'TEXT') {
      if (file)
        await this.safeDeletePhysicalFile(
          this.toUploadRelativePath(file.filename),
        );

      if (!normalizedTextContent) {
        throw new BadRequestException(
          'textContent es obligatorio cuando mediaType es TEXT',
        );
      }
    } else {
      if (normalizedTextContent !== null) {
        if (file)
          await this.safeDeletePhysicalFile(
            this.toUploadRelativePath(file.filename),
          );
        throw new BadRequestException(
          'textContent solo aplica cuando mediaType es TEXT',
        );
      }

      if (!file) {
        throw new BadRequestException('Debe enviar una imagen o video');
      }

      const inferredMediaType = this.resolveMediaTypeFromMime(file.mimetype);
      if (!inferredMediaType) {
        await this.safeDeletePhysicalFile(
          this.toUploadRelativePath(file.filename),
        );
        throw new BadRequestException('Tipo de archivo no permitido');
      }

      if (inferredMediaType !== mediaType) {
        await this.safeDeletePhysicalFile(
          this.toUploadRelativePath(file.filename),
        );
        throw new BadRequestException(
          `El archivo no coincide con mediaType=${mediaType}`,
        );
      }

      filePath = this.toUploadRelativePath(file.filename);
      mimeType = file.mimetype;
      fileSize = file.size;
    }

    try {
      const [advertisement] = await this.db
        .insert(schema.advertisements)
        .values({
          title: dto.title.trim(),
          mediaType,
          filePath,
          mimeType,
          fileSize,
          textContent: mediaType === 'TEXT' ? normalizedTextContent : null,
          displayMode: dto.displayMode ?? ADVERTISEMENT_DEFAULT_DISPLAY_MODE,
          isActive: dto.isActive ?? true,
          startsAt: dto.startsAt ?? null,
          endsAt: dto.endsAt ?? null,
        })
        .returning();

      return this.toResponse(advertisement);
    } catch (error) {
      if (filePath) await this.safeDeletePhysicalFile(filePath);
      throw error;
    }
  }

  async findAll(query: FindAdvertisementsQueryDto) {
    const { page, limit } = this.validatePaginationParams(query);
    const skip = this.calculateSkip(page, limit);
    const where = this.buildFindWhere(query);

    const [rows, [{ value: total }]] = await Promise.all([
      this.db.query.advertisements.findMany({
        where,
        limit,
        offset: skip,
        orderBy: (advertisements, { desc }) => [desc(advertisements.createdAt)],
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
    dto: UpdateAdvertisementDto,
  ): Promise<AdvertisementResponse> {
    const current = await this.validateAdvertisementId(id);

    if (dto.mediaType !== undefined && dto.mediaType !== current.mediaType) {
      throw new BadRequestException(
        'No se permite cambiar mediaType en la actualizacion',
      );
    }

    const startsAt =
      dto.startsAt === undefined ? current.startsAt : dto.startsAt;
    const endsAt = dto.endsAt === undefined ? current.endsAt : dto.endsAt;
    this.validateSchedule(startsAt ?? null, endsAt ?? null);

    const normalizedTextContent =
      dto.textContent === undefined
        ? undefined
        : this.normalizeTextContent(dto.textContent);

    if (current.mediaType === 'TEXT') {
      const next =
        normalizedTextContent === undefined
          ? current.textContent
          : normalizedTextContent;
      if (!next)
        throw new BadRequestException(
          'textContent es obligatorio cuando mediaType es TEXT',
        );
    } else if (
      normalizedTextContent !== undefined &&
      normalizedTextContent !== null
    ) {
      throw new BadRequestException(
        'textContent solo aplica cuando mediaType es TEXT',
      );
    }

    const values = {
      ...(dto.title !== undefined && { title: dto.title.trim() }),
      ...(normalizedTextContent !== undefined && {
        textContent: normalizedTextContent,
      }),
      ...(dto.displayMode !== undefined && { displayMode: dto.displayMode }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.startsAt !== undefined && { startsAt: dto.startsAt ?? null }),
      ...(dto.endsAt !== undefined && { endsAt: dto.endsAt ?? null }),
      updatedAt: sql`now()`,
    };

    if (Object.keys(values).length === 1) return this.toResponse(current);

    const [updated] = await this.db
      .update(schema.advertisements)
      .set(values)
      .where(eq(schema.advertisements.id, id))
      .returning();

    return this.toResponse(updated);
  }

  async remove(id: string) {
    await this.validateAdvertisementId(id);

    const [advertisement] = await this.db
      .delete(schema.advertisements)
      .where(eq(schema.advertisements.id, id))
      .returning({
        id: schema.advertisements.id,
        title: schema.advertisements.title,
        filePath: schema.advertisements.filePath,
      });

    if (advertisement.filePath) {
      await this.safeDeletePhysicalFile(advertisement.filePath);
    }

    return advertisement;
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
      orderBy: [desc(schema.advertisements.createdAt)],
    });

    return rows.map((row) => this.toResponse(row, now));
  }

  getOptions() {
    return {
      mediaTypes: [...ADVERTISEMENT_MEDIA_TYPES],
      displayModes: [...ADVERTISEMENT_DISPLAY_MODES],
    };
  }

  private async validateAdvertisementId(id: string): Promise<AdvertisementRow> {
    const advertisement = await this.db.query.advertisements.findFirst({
      where: eq(schema.advertisements.id, id),
    });

    if (!advertisement)
      throw new NotFoundException(`Publicidad con id ${id} no encontrada`);
    return advertisement;
  }

  private buildFindWhere(
    query: FindAdvertisementsQueryDto,
  ): SQL<unknown> | undefined {
    const search = query.search?.trim();
    return this.combineWhere([
      search
        ? or(
            ilike(schema.advertisements.id, `%${search}%`),
            ilike(schema.advertisements.title, `%${search}%`),
            ilike(schema.advertisements.textContent, `%${search}%`),
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
  }

  private combineWhere(
    conditions: Array<SQL<unknown> | undefined>,
  ): SQL<unknown> | undefined {
    const valid = conditions.filter((c): c is SQL<unknown> => c !== undefined);
    return valid.length === 0 ? undefined : and(...valid);
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

  private normalizeTextContent(value?: string | null): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private resolveMediaTypeFromMime(
    mimeType: string,
  ): AdvertisementMediaType | null {
    if (
      (ADVERTISEMENT_ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(
        mimeType,
      )
    )
      return 'IMAGE';
    if (
      (ADVERTISEMENT_ALLOWED_VIDEO_MIME_TYPES as readonly string[]).includes(
        mimeType,
      )
    )
      return 'VIDEO';
    return null;
  }

  private toUploadRelativePath(fileName: string): string {
    return `${ADVERTISEMENT_UPLOAD_SUBDIRECTORY}/${fileName}`.replace(
      /\\/g,
      '/',
    );
  }

  private async safeDeletePhysicalFile(filePath: string): Promise<void> {
    for (const absolutePath of this.resolveDeleteCandidates(filePath)) {
      try {
        await unlink(absolutePath);
        return;
      } catch (error) {
        if (!this.isErrnoCode(error, 'ENOENT')) return;
      }
    }
  }

  private resolveDeleteCandidates(filePath: string): string[] {
    const normalized = filePath.replace(/\\/g, '/').trim();
    if (!normalized) return [];

    const clean = normalized.replace(/^\/+/, '');
    const withoutUploads = clean.startsWith('uploads/')
      ? clean.slice('uploads/'.length)
      : clean;

    const candidates = new Set<string>();
    const safeRelative = this.sanitizeRelativePath(withoutUploads);
    const safeFromRoot = this.sanitizeRelativePath(clean);
    const absoluteNorm = normalize(filePath);

    if (safeRelative) candidates.add(join(this.uploadsRootDir, safeRelative));
    if (safeFromRoot) candidates.add(join(process.cwd(), safeFromRoot));
    if (isAbsolute(absoluteNorm)) candidates.add(absoluteNorm);

    return [...candidates];
  }

  private sanitizeRelativePath(path: string): string {
    return path
      .split('/')
      .map((s) => s.trim())
      .filter((s) => s && s !== '.' && s !== '..')
      .join('/');
  }

  private isErrnoCode(error: unknown, code: string): boolean {
    return (
      !!error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === code
    );
  }

  private toResponse(
    row: AdvertisementRow,
    now: Date = new Date(),
  ): AdvertisementResponse {
    const normalizedPath =
      row.filePath?.replace(/\\/g, '/').replace(/^\/+/, '') ?? null;

    return {
      id: row.id,
      title: row.title,
      mediaType: row.mediaType,
      displayMode: row.displayMode,
      fileUrl: normalizedPath ? `/uploads/${normalizedPath}` : null,
      mimeType: row.mimeType,
      fileSize: row.fileSize,
      textContent: row.textContent,
      isActive: row.isActive,
      isVisibleNow: this.isVisibleNow(row, now),
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private isVisibleNow(row: AdvertisementRow, now: Date): boolean {
    if (!row.isActive) return false;
    if (row.startsAt && row.startsAt > now) return false;
    if (row.endsAt && row.endsAt < now) return false;
    return true;
  }
}
