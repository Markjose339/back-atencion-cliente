import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateWindowDto } from './dto/create-window.dto';
import { UpdateWindowDto } from './dto/update-window.dto';
import { DB_CONN } from '@/database/db.conn';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { schema } from '@/database/schema';
import { PaginationService } from '@/pagination/pagination.service';
import { PaginationDto } from '@/pagination/dto/pagination.dto';
import { and, count, eq, ilike, ne, or, sql } from 'drizzle-orm';
import { AuditService } from '@/audit/audit.service';
import type { AuditContext } from '@/audit/interfaces/audit-log.interface';

@Injectable()
export class WindowsService extends PaginationService {
  constructor(
    @Inject(DB_CONN)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly auditService: AuditService,
  ) {
    super();
  }

  async create(createWindowDto: CreateWindowDto, auditContext?: AuditContext) {
    await Promise.all([
      this.validateWindowName(createWindowDto.name),
      this.validateWindowCode(createWindowDto.code),
    ]);

    const [window] = await this.db
      .insert(schema.windows)
      .values(createWindowDto)
      .returning({
        id: schema.windows.id,
        code: schema.windows.code,
        name: schema.windows.name,
        isActive: schema.windows.isActive,
        createdAt: schema.windows.createdAt,
      });

    await this.auditService.registerAuditLog(
      {
        action: 'window_created',
        auditableType: 'Window',
        auditableId: window.id,
        description: `Ventanilla ${window.code} creada`,
      },
      auditContext,
    );

    return window;
  }

  async findAll(paginationDto: PaginationDto) {
    const { page, limit } = this.validatePaginationParams(paginationDto);
    const { search } = paginationDto;
    const skip = this.calulateSkip(page, limit);

    const where = search
      ? or(
          ilike(schema.windows.id, `%${search}%`),
          ilike(schema.windows.code, `%${search}%`),
          ilike(schema.windows.name, `%${search}%`),
        )
      : undefined;

    const [data, [{ value: total }]] = await Promise.all([
      this.db.query.windows.findMany({
        where,
        limit,
        offset: skip,
        columns: {
          id: true,
          code: true,
          name: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: (windows, { desc }) => desc(windows.createdAt),
      }),
      this.db.select({ value: count() }).from(schema.windows).where(where),
    ]);

    const meta = this.builPaginationMeta(total, page, limit, data.length);
    return { data, meta };
  }

  async findOne(id: string) {
    return await this.validateWindowId(id);
  }

  async update(
    id: string,
    updateWindowDto: UpdateWindowDto,
    auditContext?: AuditContext,
  ) {
    const currentWindow = await this.validateWindowId(id);
    const validations: Promise<void>[] = [];

    if (updateWindowDto.name) {
      validations.push(this.validateWindowName(updateWindowDto.name, id));
    }

    if (updateWindowDto.code) {
      validations.push(this.validateWindowCode(updateWindowDto.code, id));
    }

    await Promise.all(validations);

    const [window] = await this.db
      .update(schema.windows)
      .set({ ...updateWindowDto, updatedAt: sql`now()` })
      .where(eq(schema.windows.id, id))
      .returning({
        id: schema.windows.id,
        code: schema.windows.code,
        name: schema.windows.name,
        isActive: schema.windows.isActive,
        createdAt: schema.windows.createdAt,
      });

    const oldValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};

    if (currentWindow.name !== window.name) {
      oldValues.name = currentWindow.name;
      newValues.name = window.name;
    }

    if (currentWindow.code !== window.code) {
      oldValues.code = currentWindow.code;
      newValues.code = window.code;
    }

    if (currentWindow.isActive !== window.isActive) {
      oldValues.isActive = currentWindow.isActive;
      newValues.isActive = window.isActive;
    }

    if (
      Object.keys(oldValues).length === 0 &&
      Object.keys(newValues).length === 0
    ) {
      return window;
    }

    await this.auditService.registerAuditLog(
      {
        action: 'window_updated',
        auditableType: 'Window',
        auditableId: window.id,
        oldValues: Object.keys(oldValues).length > 0 ? oldValues : null,
        newValues: Object.keys(newValues).length > 0 ? newValues : null,
        description: `Ventanilla ${window.code} actualizada`,
      },
      auditContext,
    );

    return window;
  }

  async remove(id: string, auditContext?: AuditContext) {
    const currentWindow = await this.validateWindowId(id);

    const [window] = await this.db
      .delete(schema.windows)
      .where(eq(schema.windows.id, id))
      .returning({
        id: schema.windows.id,
        code: schema.windows.code,
        name: schema.windows.name,
        createdAt: schema.windows.createdAt,
      });

    await this.auditService.registerAuditLog(
      {
        action: 'window_deleted',
        auditableType: 'Window',
        auditableId: window.id,
        oldValues: {
          name: currentWindow.name,
          code: currentWindow.code,
          isActive: currentWindow.isActive,
        },
        description: `Ventanilla ${currentWindow.code} eliminada`,
      },
      auditContext,
    );

    return window;
  }

  async validateWindowId(id: string) {
    const window = await this.db.query.windows.findFirst({
      where: eq(schema.windows.id, id),
    });

    if (!window)
      throw new NotFoundException(`Ventana con el id ${id} no encontrada`);

    return window;
  }

  async validateWindowName(name: string, excludeId?: string) {
    const where = excludeId
      ? and(eq(schema.windows.name, name), ne(schema.windows.id, excludeId))
      : eq(schema.windows.name, name);

    const window = await this.db.query.windows.findFirst({ where });

    if (window)
      throw new ConflictException(`Ventana con el nombre "${name}" ya existe`);
  }

  async validateWindowCode(code: string, excludeId?: string) {
    const where = excludeId
      ? and(eq(schema.windows.code, code), ne(schema.windows.id, excludeId))
      : eq(schema.windows.code, code);

    const window = await this.db.query.windows.findFirst({ where });

    if (window)
      throw new ConflictException(`Ventana con el codigo "${code}" ya existe`);
  }
}
