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
import { and, count, eq, ilike, ne, or } from 'drizzle-orm';

@Injectable()
export class BranchesService extends PaginationService {
  constructor(
    @Inject(DB_CONN)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {
    super();
  }
  async create(createBranchDto: CreateBranchDto) {
    await this.validateBranchName(createBranchDto.name);

    const [branch] = await this.db
      .insert(schema.branches)
      .values(createBranchDto)
      .returning({
        id: schema.branches.id,
        name: schema.branches.name,
        createdAt: schema.branches.createdAt,
      });

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
          ilike(schema.branches.departmentName, `%${search}%`),
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

  async update(id: string, updateBranchDto: UpdateBranchDto) {
    const validations: Promise<void>[] = [
      this.validateBranchId(id).then(() => undefined),
    ];

    if (updateBranchDto.name) {
      validations.push(this.validateBranchName(updateBranchDto.name, id));
    }

    await Promise.all(validations);

    const [branch] = await this.db
      .update(schema.branches)
      .set(updateBranchDto)
      .where(eq(schema.branches.id, id))
      .returning({
        id: schema.branches.id,
        name: schema.branches.name,
        createdAt: schema.branches.createdAt,
      });

    return branch;
  }

  async remove(id: string) {
    await this.validateBranchId(id);

    const [branch] = await this.db
      .delete(schema.branches)
      .where(eq(schema.branches.id, id))
      .returning({
        id: schema.branches.id,
        name: schema.branches.name,
        createdAt: schema.branches.createdAt,
      });

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
