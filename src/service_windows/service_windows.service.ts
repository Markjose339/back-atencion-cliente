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
  constructor(
    @Inject(DB_CONN)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {
    super();
  }
  async create(createServiceWindowDto: CreateServiceWindowDto) {
    await this.validatedServiceWindowName(createServiceWindowDto.name);

    const [serviceWindow] = await this.db
      .insert(schema.serviceWindows)
      .values(createServiceWindowDto)
      .returning({
        id: schema.serviceWindows.id,
        name: schema.serviceWindows.name,
        createdAt: schema.serviceWindows.createdAt,
      });
    return serviceWindow;
  }

  async findAll(paginationDto: PaginationDto) {
    const { page, limit } = this.validatePaginationParams(paginationDto);
    const { search } = paginationDto;
    const skip = this.calulateSkip(page, limit);

    const where = search
      ? or(
          ilike(schema.serviceWindows.id, `%${search}%`),
          ilike(schema.serviceWindows.name, `%${search}%`),
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
          createdAt: true,
        },
        orderBy: (serviceWindows, { desc }) => desc(serviceWindows.createdAt),
      }),
      this.db
        .select({ value: count() })
        .from(schema.serviceWindows)
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
        this.validatedServiceWindowName(updateServiceWindowDto.name, id),
      );
    }

    await Promise.all(validations);

    const [serviceWindow] = await this.db
      .update(schema.serviceWindows)
      .set(updateServiceWindowDto)
      .where(eq(schema.serviceWindows.id, id))
      .returning({
        id: schema.serviceWindows.id,
        name: schema.serviceWindows.name,
        createdAt: schema.serviceWindows.createdAt,
      });

    return serviceWindow;
  }

  async remove(id: string) {
    await this.validatedServiceWindowId(id);

    const [serviceWindow] = await this.db
      .delete(schema.serviceWindows)
      .where(eq(schema.serviceWindows.id, id))
      .returning({
        id: schema.serviceWindows.id,
        name: schema.serviceWindows.name,
        createdAt: schema.serviceWindows.createdAt,
      });
    return serviceWindow;
  }

  async validatedServiceWindowId(id: string) {
    const serviceWindow = await this.db.query.serviceWindows.findFirst({
      where: eq(schema.serviceWindows.id, id),
    });

    if (!serviceWindow)
      throw new NotFoundException(`Ventanilla con el id ${id} no encontrado`);

    return serviceWindow;
  }

  async validatedServiceWindowName(name: string, excludeId?: string) {
    const where = excludeId
      ? and(
          eq(schema.serviceWindows.name, name),
          ne(schema.serviceWindows.id, excludeId),
        )
      : eq(schema.serviceWindows.name, name);

    const permission = await this.db.query.serviceWindows.findFirst({
      where,
    });

    if (permission)
      throw new ConflictException(
        `Ventanilla con el nombre "${name}" ya existe`,
      );
  }
}
