import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { PaginationService } from '@/pagination/pagination.service';
import { DB_CONN } from '@/database/db.conn';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { schema } from '@/database/schema';
import { and, count, eq, ilike, ne, or } from 'drizzle-orm';
import { PaginationDto } from '@/pagination/dto/pagination.dto';

@Injectable()
export class DepartmentsService extends PaginationService {
  constructor(
    @Inject(DB_CONN)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {
    super();
  }

  async create(createDepartmentDto: CreateDepartmentDto) {
    await this.validatedDepartmentName(createDepartmentDto.name);

    const [department] = await this.db
      .insert(schema.departments)
      .values(createDepartmentDto)
      .returning({
        id: schema.departments.id,
        name: schema.departments.name,
        createdAt: schema.departments.createdAt,
      });

    return department;
  }

  async findAll(paginationDto: PaginationDto) {
    const { page, limit } = this.validatePaginationParams(paginationDto);
    const { search } = paginationDto;
    const skip = this.calulateSkip(page, limit);

    const where = search
      ? or(
          ilike(schema.departments.id, `%${search}%`),
          ilike(schema.departments.name, `%${search}%`),
        )
      : undefined;

    const [data, [{ value: total }]] = await Promise.all([
      this.db.query.departments.findMany({
        where,
        limit,
        offset: skip,
        columns: {
          id: true,
          name: true,
          code: true,
          createdAt: true,
        },
        orderBy: (departments, { desc }) => desc(departments.createdAt),
      }),
      this.db.select({ value: count() }).from(schema.departments).where(where),
    ]);

    const meta = this.builPaginationMeta(total, page, limit, data.length);

    return { data, meta };
  }

  async findOne(id: string) {
    return await this.validatedDepartmentId(id);
  }

  async update(id: string, updateDepartmentDto: UpdateDepartmentDto) {
    const validations: Promise<void>[] = [
      this.validatedDepartmentId(id).then(() => undefined),
    ];

    if (updateDepartmentDto.name) {
      validations.push(
        this.validatedDepartmentName(updateDepartmentDto.name, id),
      );
    }

    await Promise.all(validations);

    const [department] = await this.db
      .update(schema.departments)
      .set(updateDepartmentDto)
      .where(eq(schema.departments.id, id))
      .returning({
        id: schema.departments.id,
        name: schema.departments.name,
        createdAt: schema.departments.createdAt,
      });

    return department;
  }

  async remove(id: string) {
    await this.validatedDepartmentId(id);

    const [department] = await this.db
      .delete(schema.departments)
      .where(eq(schema.departments.id, id))
      .returning({
        id: schema.departments.id,
        name: schema.departments.name,
        createdAt: schema.departments.createdAt,
      });

    return department;
  }

  async validatedDepartmentId(id: string) {
    const department = await this.db.query.departments.findFirst({
      where: eq(schema.departments.id, id),
    });

    if (!department)
      throw new NotFoundException(`Departamento con el id ${id} no encontrado`);

    return department;
  }

  async validatedDepartmentName(name: string, excludeId?: string) {
    const where = excludeId
      ? and(
          eq(schema.departments.name, name),
          ne(schema.departments.id, excludeId),
        )
      : eq(schema.departments.name, name);

    const department = await this.db.query.departments.findFirst({ where });

    if (department)
      throw new ConflictException(
        `Departamento con el nombre "${name}" ya existe`,
      );
  }
}
