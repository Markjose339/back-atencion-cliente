import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { DB_CONN } from '@/database/db.conn';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { schema } from '@/database/schema';
import { PaginationService } from '@/pagination/pagination.service';
import { PaginationDto } from '@/pagination/dto/pagination.dto';
import { and, count, eq, ilike, ne, or, sql } from 'drizzle-orm';
import { AuditService } from '@/audit/audit.service';
import type { AuditContext } from '@/audit/interfaces/audit-log.interface';

@Injectable()
export class ServicesService extends PaginationService {
  constructor(
    @Inject(DB_CONN)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly auditService: AuditService,
  ) {
    super();
  }

  async create(
    createServiceDto: CreateServiceDto,
    auditContext?: AuditContext,
  ) {
    await Promise.all([
      this.validateServiceName(createServiceDto.name),
      this.validateServiceCode(createServiceDto.code),
    ]);

    const [service] = await this.db
      .insert(schema.services)
      .values(createServiceDto)
      .returning({
        id: schema.services.id,
        name: schema.services.name,
        code: schema.services.code,
        createdAt: schema.services.createdAt,
      });

    await this.auditService.registerAuditLog(
      {
        action: 'service_created',
        auditableType: 'Service',
        auditableId: service.id,
        description: `Servicio ${service.code} creado`,
      },
      auditContext,
    );

    return service;
  }

  async findAll(paginationDto: PaginationDto) {
    const { page, limit } = this.validatePaginationParams(paginationDto);
    const { search } = paginationDto;
    const skip = this.calulateSkip(page, limit);

    const where = search
      ? or(
          ilike(schema.services.id, `%${search}%`),
          ilike(schema.services.name, `%${search}%`),
          ilike(schema.services.code, `%${search}%`),
        )
      : undefined;

    const [data, [{ value: total }]] = await Promise.all([
      this.db.query.services.findMany({
        where,
        limit,
        offset: skip,
        columns: {
          id: true,
          name: true,
          abbreviation: true,
          code: true,
          createdAt: true,
        },
        orderBy: (services, { desc }) => desc(services.createdAt),
      }),
      this.db.select({ value: count() }).from(schema.services).where(where),
    ]);

    const meta = this.builPaginationMeta(total, page, limit, data.length);

    return { data, meta };
  }

  async findOne(id: string) {
    return this.validateServiceId(id);
  }

  async update(
    id: string,
    updateServiceDto: UpdateServiceDto,
    auditContext?: AuditContext,
  ) {
    const currentService = await this.validateServiceId(id);
    const validations: Promise<void>[] = [];

    if (updateServiceDto.name) {
      validations.push(this.validateServiceName(updateServiceDto.name, id));
    }

    if (updateServiceDto.code) {
      validations.push(this.validateServiceCode(updateServiceDto.code, id));
    }

    await Promise.all(validations);

    const [service] = await this.db
      .update(schema.services)
      .set({ ...updateServiceDto, updatedAt: sql`now()` })
      .where(eq(schema.services.id, id))
      .returning({
        id: schema.services.id,
        name: schema.services.name,
        abbreviation: schema.services.abbreviation,
        code: schema.services.code,
        isActive: schema.services.isActive,
        createdAt: schema.services.createdAt,
      });

    const oldValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};

    if (currentService.name !== service.name) {
      oldValues.name = currentService.name;
      newValues.name = service.name;
    }

    if (currentService.code !== service.code) {
      oldValues.code = currentService.code;
      newValues.code = service.code;
    }

    if (currentService.abbreviation !== service.abbreviation) {
      oldValues.abbreviation = currentService.abbreviation;
      newValues.abbreviation = service.abbreviation;
    }

    if (currentService.isActive !== service.isActive) {
      oldValues.isActive = currentService.isActive;
      newValues.isActive = service.isActive;
    }

    if (Object.keys(oldValues).length === 0 && Object.keys(newValues).length === 0) {
      return service;
    }

    await this.auditService.registerAuditLog(
      {
        action: 'service_updated',
        auditableType: 'Service',
        auditableId: service.id,
        oldValues: Object.keys(oldValues).length > 0 ? oldValues : null,
        newValues: Object.keys(newValues).length > 0 ? newValues : null,
        description: `Servicio ${service.code} actualizado`,
      },
      auditContext,
    );

    return service;
  }

  async remove(id: string, auditContext?: AuditContext) {
    const currentService = await this.validateServiceId(id);

    const [service] = await this.db
      .delete(schema.services)
      .where(eq(schema.services.id, id))
      .returning({
        id: schema.services.id,
        name: schema.services.name,
        code: schema.services.code,
        createdAt: schema.services.createdAt,
      });

    await this.auditService.registerAuditLog(
      {
        action: 'service_deleted',
        auditableType: 'Service',
        auditableId: service.id,
        oldValues: {
          name: currentService.name,
          code: currentService.code,
          abbreviation: currentService.abbreviation,
          isActive: currentService.isActive,
        },
        description: `Servicio ${currentService.code} eliminado`,
      },
      auditContext,
    );

    return service;
  }

  async validateServiceId(id: string) {
    const service = await this.db.query.services.findFirst({
      where: eq(schema.services.id, id),
    });

    if (!service)
      throw new NotFoundException(`Servicio con el id ${id} no encontrado`);

    return service;
  }

  async validateServiceName(name: string, excludeId?: string) {
    const where = excludeId
      ? and(eq(schema.services.name, name), ne(schema.services.id, excludeId))
      : eq(schema.services.name, name);

    const service = await this.db.query.services.findFirst({ where });

    if (service)
      throw new ConflictException(`Servicio con el nombre "${name}" ya existe`);
  }

  async validateServiceCode(code: string, excludeId?: string) {
    const where = excludeId
      ? and(eq(schema.services.code, code), ne(schema.services.id, excludeId))
      : eq(schema.services.code, code);

    const service = await this.db.query.services.findFirst({ where });

    if (service)
      throw new ConflictException(`Servicio con el código "${code}" ya existe`);
  }
}
