import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { DB_CONN } from '@/database/db.conn';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { schema } from '@/database/schema';
import { PaginationService } from '@/pagination/pagination.service';
import { PaginationDto } from '@/pagination/dto/pagination.dto';
import { and, count, eq, ilike, ne, or, sql } from 'drizzle-orm';
import { AuditService } from '@/audit/audit.service';
import type { AuditContext } from '@/audit/interfaces/audit-log.interface';

@Injectable()
export class BranchesService extends PaginationService {
  constructor(
    @Inject(DB_CONN)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly auditService: AuditService,
  ) {
    super();
  }
  async create(createBranchDto: CreateBranchDto, auditContext?: AuditContext) {
    await this.validateBranchName(createBranchDto.name);

    const [branch] = await this.db
      .insert(schema.branches)
      .values(createBranchDto)
      .returning({
        id: schema.branches.id,
        name: schema.branches.name,
        createdAt: schema.branches.createdAt,
      });

    await this.auditService.registerAuditLog(
      {
        action: 'branch_created',
        auditableType: 'Branch',
        auditableId: branch.id,
        description: `Sucursal ${branch.name} creada`,
      },
      auditContext,
    );

    return branch;
  }

  async findAll(paginationDto: PaginationDto) {
    const { page, limit } = this.validatePaginationParams(paginationDto);
    const { search } = paginationDto;
    const skip = this.calulateSkip(page, limit);

    const where = search
      ? or(
          ilike(schema.branches.id, `%${search}%`),
          ilike(schema.branches.name, `%${search}%`),
        )
      : undefined;

    const [data, [{ value: total }]] = await Promise.all([
      this.db.query.branches.findMany({
        where,
        limit,
        offset: skip,
        columns: {
          id: true,
          name: true,
          address: true,
          departmentName: true,
          createdAt: true,
        },
        orderBy: (branches, { desc }) => desc(branches.createdAt),
      }),
      this.db.select({ value: count() }).from(schema.branches).where(where),
    ]);

    const meta = this.builPaginationMeta(total, page, limit, data.length);

    return { data, meta };
  }

  async findOne(id: string) {
    return await this.validateBranchId(id);
  }

  async update(
    id: string,
    updateBranchDto: UpdateBranchDto,
    auditContext?: AuditContext,
  ) {
    const currentBranch = await this.validateBranchId(id);
    const validations: Promise<void>[] = [];

    if (updateBranchDto.name) {
      validations.push(this.validateBranchName(updateBranchDto.name, id));
    }

    await Promise.all(validations);

    const [branch] = await this.db
      .update(schema.branches)
      .set({ ...updateBranchDto, updatedAt: sql`now()` })
      .where(eq(schema.branches.id, id))
      .returning({
        id: schema.branches.id,
        name: schema.branches.name,
        address: schema.branches.address,
        departmentName: schema.branches.departmentName,
        createdAt: schema.branches.createdAt,
      });

    const oldValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};

    if (currentBranch.name !== branch.name) {
      oldValues.name = currentBranch.name;
      newValues.name = branch.name;
    }

    if (currentBranch.address !== branch.address) {
      oldValues.address = currentBranch.address;
      newValues.address = branch.address;
    }

    if (currentBranch.departmentName !== branch.departmentName) {
      oldValues.departmentName = currentBranch.departmentName;
      newValues.departmentName = branch.departmentName;
    }

    if (Object.keys(oldValues).length > 0 || Object.keys(newValues).length > 0) {
      await this.auditService.registerAuditLog(
        {
          action: 'branch_updated',
          auditableType: 'Branch',
          auditableId: branch.id,
          oldValues,
          newValues,
          description: `Sucursal ${branch.name} actualizada`,
        },
        auditContext,
      );
    }

    return branch;
  }

  async remove(id: string, auditContext?: AuditContext) {
    const currentBranch = await this.validateBranchId(id);

    const [branch] = await this.db
      .delete(schema.branches)
      .where(eq(schema.branches.id, id))
      .returning({
        id: schema.branches.id,
        name: schema.branches.name,
        createdAt: schema.branches.createdAt,
      });

    await this.auditService.registerAuditLog(
      {
        action: 'branch_deleted',
        auditableType: 'Branch',
        auditableId: branch.id,
        oldValues: {
          name: currentBranch.name,
          address: currentBranch.address,
          departmentName: currentBranch.departmentName,
        },
        description: `Sucursal ${currentBranch.name} eliminada`,
      },
      auditContext,
    );

    return branch;
  }

  async validateBranchId(id: string) {
    const branch = await this.db.query.branches.findFirst({
      where: eq(schema.branches.id, id),
    });

    if (!branch)
      throw new NotFoundException(`Sucursal con el id ${id} no encontrada`);

    return branch;
  }

  async validateBranchName(name: string, excludeId?: string) {
    const where = excludeId
      ? and(eq(schema.branches.name, name), ne(schema.branches.id, excludeId))
      : eq(schema.branches.name, name);

    const branch = await this.db.query.branches.findFirst({ where });

    if (branch)
      throw new ConflictException(`Sucursal con el nombre "${name}" ya existe`);
  }
}
