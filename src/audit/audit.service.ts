import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DB_CONN } from '@/database/db.conn';
import { schema } from '@/database/schema';
import {
  AuditContext,
  AuditLogInput,
} from '@/audit/interfaces/audit-log.interface';
import { PaginationService } from '@/pagination/pagination.service';
import { FindAuditLogsQueryDto } from './dto/find-audit-logs-query.dto';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  isNotNull,
  lte,
  or,
  SQL,
} from 'drizzle-orm';

@Injectable()
export class AuditService extends PaginationService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @Inject(DB_CONN)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {
    super();
  }

  async registerAuditLog(
    input: AuditLogInput,
    context: AuditContext = {},
  ): Promise<void> {
    try {
      await this.db.insert(schema.auditLogs).values({
        userId: this.trimNullableValue(context.userId, 24),
        action: this.trimValue(input.action, 150),
        auditableType: this.trimValue(input.auditableType, 50),
        auditableId: this.trimNullableValue(input.auditableId, 24),
        oldValues: input.oldValues ?? null,
        newValues: input.newValues ?? null,
        description: this.trimNullableValue(input.description, 1000),
        ipAddress: this.trimNullableValue(context.ipAddress, 64),
        userAgent: this.trimNullableValue(context.userAgent, 255),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`No se pudo registrar auditoria: ${message}`);
    }
  }

  async findAll(query: FindAuditLogsQueryDto) {
    const { page, limit } = this.validatePaginationParams(query);
    const skip = this.calculateSkip(page, limit);
    const where = this.buildFindWhere(query);

    const [rows, [{ value: total }]] = await Promise.all([
      this.db
        .select({
          id: schema.auditLogs.id,
          userId: schema.auditLogs.userId,
          action: schema.auditLogs.action,
          auditableType: schema.auditLogs.auditableType,
          auditableId: schema.auditLogs.auditableId,
          oldValues: schema.auditLogs.oldValues,
          newValues: schema.auditLogs.newValues,
          description: schema.auditLogs.description,
          ipAddress: schema.auditLogs.ipAddress,
          userAgent: schema.auditLogs.userAgent,
          createdAt: schema.auditLogs.createdAt,
          userName: schema.users.name,
          userEmail: schema.users.email,
        })
        .from(schema.auditLogs)
        .leftJoin(schema.users, eq(schema.auditLogs.userId, schema.users.id))
        .where(where)
        .orderBy(desc(schema.auditLogs.createdAt))
        .limit(limit)
        .offset(skip),
      this.db.select({ value: count() }).from(schema.auditLogs).where(where),
    ]);

    const data = rows.map((row) => this.mapAuditRow(row));
    const meta = this.buildPaginationMeta(total, page, limit, data.length);
    return { data, meta };
  }

  async findOne(id: string) {
    const [row] = await this.db
      .select({
        id: schema.auditLogs.id,
        userId: schema.auditLogs.userId,
        action: schema.auditLogs.action,
        auditableType: schema.auditLogs.auditableType,
        auditableId: schema.auditLogs.auditableId,
        oldValues: schema.auditLogs.oldValues,
        newValues: schema.auditLogs.newValues,
        description: schema.auditLogs.description,
        ipAddress: schema.auditLogs.ipAddress,
        userAgent: schema.auditLogs.userAgent,
        createdAt: schema.auditLogs.createdAt,
        userName: schema.users.name,
        userEmail: schema.users.email,
      })
      .from(schema.auditLogs)
      .leftJoin(schema.users, eq(schema.auditLogs.userId, schema.users.id))
      .where(eq(schema.auditLogs.id, id))
      .limit(1);

    if (!row) {
      throw new NotFoundException(`Registro de auditoria ${id} no encontrado`);
    }

    return this.mapAuditRow(row);
  }

  async getActionsCatalog() {
    const rows = await this.db
      .select({ value: schema.auditLogs.action })
      .from(schema.auditLogs)
      .groupBy(schema.auditLogs.action)
      .orderBy(asc(schema.auditLogs.action));

    return { data: rows.map((row) => row.value) };
  }

  async getAuditableTypesCatalog() {
    const rows = await this.db
      .select({ value: schema.auditLogs.auditableType })
      .from(schema.auditLogs)
      .groupBy(schema.auditLogs.auditableType)
      .orderBy(asc(schema.auditLogs.auditableType));

    return { data: rows.map((row) => row.value) };
  }

  async getUsersCatalog() {
    const rows = await this.db
      .select({
        id: schema.auditLogs.userId,
        name: schema.users.name,
        email: schema.users.email,
      })
      .from(schema.auditLogs)
      .leftJoin(schema.users, eq(schema.auditLogs.userId, schema.users.id))
      .where(isNotNull(schema.auditLogs.userId))
      .groupBy(schema.auditLogs.userId, schema.users.name, schema.users.email)
      .orderBy(asc(schema.users.name), asc(schema.auditLogs.userId));

    return {
      data: rows
        .filter((row): row is { id: string; name: string | null; email: string | null } => !!row.id)
        .map((row) => ({
          id: row.id,
          name: row.name,
          email: row.email,
        })),
    };
  }

  private buildFindWhere(query: FindAuditLogsQueryDto): SQL<unknown> | undefined {
    const search = query.search?.trim();
    const action = query.action?.trim();
    const auditableType = query.auditableType?.trim();
    const userId = query.userId?.trim();
    const from = this.parseDate(query.from, 'from');
    const to = this.parseDate(query.to, 'to');

    if (from && to && to < from) {
      throw new BadRequestException('"to" debe ser mayor o igual a "from"');
    }

    return and(
      action ? eq(schema.auditLogs.action, action) : undefined,
      auditableType
        ? eq(schema.auditLogs.auditableType, auditableType)
        : undefined,
      userId ? eq(schema.auditLogs.userId, userId) : undefined,
      from ? gte(schema.auditLogs.createdAt, from) : undefined,
      to ? lte(schema.auditLogs.createdAt, to) : undefined,
      search
        ? or(
            ilike(schema.auditLogs.action, `%${search}%`),
            ilike(schema.auditLogs.auditableType, `%${search}%`),
            ilike(schema.auditLogs.auditableId, `%${search}%`),
            ilike(schema.auditLogs.description, `%${search}%`),
            ilike(schema.auditLogs.userId, `%${search}%`),
          )
        : undefined,
    );
  }

  private parseDate(value: string | undefined, field: 'from' | 'to') {
    if (!value) return undefined;

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`"${field}" no es una fecha valida`);
    }

    if (field === 'to' && value.length === 10) {
      parsed.setHours(23, 59, 59, 999);
    }

    return parsed;
  }

  private mapAuditRow(row: {
    id: string;
    userId: string | null;
    action: string;
    auditableType: string;
    auditableId: string | null;
    oldValues: Record<string, unknown> | null;
    newValues: Record<string, unknown> | null;
    description: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: Date;
    userName: string | null;
    userEmail: string | null;
  }) {
    return {
      id: row.id,
      action: row.action,
      auditableType: row.auditableType,
      auditableId: row.auditableId,
      oldValues: row.oldValues,
      newValues: row.newValues,
      description: row.description,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      createdAt: row.createdAt,
      user: row.userId
        ? {
            id: row.userId,
            name: row.userName,
            email: row.userEmail,
          }
        : null,
    };
  }

  private trimValue(value: string | null | undefined, maxLength: number): string {
    const normalized = value ?? '';
    if (normalized.length <= maxLength) return normalized;
    return normalized.slice(0, maxLength);
  }

  private trimNullableValue(
    value: string | null | undefined,
    maxLength: number,
  ): string | null {
    if (!value) return null;
    if (value.length <= maxLength) return value;
    return value.slice(0, maxLength);
  }
}
