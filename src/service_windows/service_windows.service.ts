import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateServiceWindowDto } from './dto/create-service_window.dto';
import { UpdateServiceWindowDto } from './dto/update-service_window.dto';
import { DB_CONN } from '@/database/db.conn';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { PaginationDto } from '@/pagination/dto/pagination.dto';
import { schema } from '@/database/schema';
import { and, count, eq, ilike, ne, or } from 'drizzle-orm';
import { PaginationService } from '@/pagination/pagination.service';

@Injectable()
export class ServiceWindowsService extends PaginationService {
  private readonly serviceWindowsTable = schema.serviceWindows;
  private readonly returningColumns = {
    id: this.serviceWindowsTable.id,
    name: this.serviceWindowsTable.name,
    createdAt: this.serviceWindowsTable.createdAt,
  };

  constructor(
    @Inject(DB_CONN)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {
    super();
  }

  async create(createServiceWindowDto: CreateServiceWindowDto) {
    await Promise.all([
      this.validateUniqueField('name', createServiceWindowDto.name),
      this.validateUniqueField('code', createServiceWindowDto.code),
    ]);

    const [serviceWindow] = await this.db
      .insert(this.serviceWindowsTable)
      .values(createServiceWindowDto)
      .returning(this.returningColumns);

    return serviceWindow;
  }

  async findAll(paginationDto: PaginationDto) {
    const { page, limit } = this.validatePaginationParams(paginationDto);
    const { search } = paginationDto;
    const skip = this.calulateSkip(page, limit);

    const where = search
      ? or(
          ilike(this.serviceWindowsTable.id, `%${search}%`),
          ilike(this.serviceWindowsTable.name, `%${search}%`),
          ilike(this.serviceWindowsTable.code, `%${search}%`),
        )
      : undefined;

    const [data, [{ value: total }]] = await Promise.all([
      this.db.query.serviceWindows.findMany({
        where,
        limit,
        offset: skip,
        columns: {
          id: true,
          name: true,
          code: true,
          createdAt: true,
        },
        orderBy: (serviceWindows, { desc }) => desc(serviceWindows.createdAt),
      }),
      this.db
        .select({ value: count() })
        .from(this.serviceWindowsTable)
        .where(where),
    ]);

    const meta = this.builPaginationMeta(total, page, limit, data.length);

    return { data, meta };
  }

  async findOne(id: string) {
    return await this.validatedServiceWindowId(id);
  }

  async update(id: string, updateServiceWindowDto: UpdateServiceWindowDto) {
    const validations: Promise<void>[] = [
      this.validatedServiceWindowId(id).then(() => undefined),
    ];

    if (updateServiceWindowDto.name) {
      validations.push(
        this.validateUniqueField('name', updateServiceWindowDto.name, id),
      );
    }

    if (updateServiceWindowDto.code) {
      validations.push(
        this.validateUniqueField('code', updateServiceWindowDto.code, id),
      );
    }

    await Promise.all(validations);

    const [serviceWindow] = await this.db
      .update(this.serviceWindowsTable)
      .set(updateServiceWindowDto)
      .where(eq(this.serviceWindowsTable.id, id))
      .returning(this.returningColumns);

    return serviceWindow;
  }

  async remove(id: string) {
    await this.validatedServiceWindowId(id);

    const [serviceWindow] = await this.db
      .delete(this.serviceWindowsTable)
      .where(eq(this.serviceWindowsTable.id, id))
      .returning(this.returningColumns);

    return serviceWindow;
  }

  async validatedServiceWindowId(id: string) {
    const serviceWindow = await this.db.query.serviceWindows.findFirst({
      where: eq(this.serviceWindowsTable.id, id),
    });

    if (!serviceWindow) {
      throw new NotFoundException(`Ventanilla con el id ${id} no encontrado`);
    }

    return serviceWindow;
  }

  private async validateUniqueField(
    field: 'name' | 'code',
    value: string,
    excludeId?: string,
  ) {
    const where = excludeId
      ? and(
          eq(this.serviceWindowsTable[field], value),
          ne(this.serviceWindowsTable.id, excludeId),
        )
      : eq(this.serviceWindowsTable[field], value);

    const serviceWindow = await this.db.query.serviceWindows.findFirst({
      where,
    });

    if (serviceWindow) {
      const fieldName = field === 'name' ? 'nombre' : 'codigo';
      throw new ConflictException(
        `Ventanilla con el ${fieldName} "${value}" ya existe`,
      );
    }
  }
}
