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
import { and, count, eq, ilike, ne, or } from 'drizzle-orm';

@Injectable()
export class WindowsService extends PaginationService {
  constructor(
    @Inject(DB_CONN)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {
    super();
  }

  async create(createWindowDto: CreateWindowDto) {
    await this.validateWindowName(createWindowDto.name);

    const [window] = await this.db
      .insert(schema.windows)
      .values(createWindowDto)
      .returning({
        id: schema.windows.id,
        name: schema.windows.name,
        createdAt: schema.windows.createdAt,
      });

    return window;
  }

  async findAll(paginationDto: PaginationDto) {
    const { page, limit } = this.validatePaginationParams(paginationDto);
    const { search } = paginationDto;
    const skip = this.calulateSkip(page, limit);

    const where = search
      ? or(
          ilike(schema.windows.id, `%${search}%`),
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
          name: true,
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

  async update(id: string, updateWindowDto: UpdateWindowDto) {
    const validations: Promise<void>[] = [
      this.validateWindowId(id).then(() => undefined),
    ];

    if (updateWindowDto.name) {
      validations.push(this.validateWindowName(updateWindowDto.name, id));
    }

    await Promise.all(validations);

    const [window] = await this.db
      .update(schema.windows)
      .set(updateWindowDto)
      .where(eq(schema.windows.id, id))
      .returning({
        id: schema.windows.id,
        name: schema.windows.name,
        createdAt: schema.windows.createdAt,
      });

    return window;
  }

  async remove(id: string) {
    await this.validateWindowId(id);

    const [window] = await this.db
      .delete(schema.windows)
      .where(eq(schema.windows.id, id))
      .returning({
        id: schema.windows.id,
        name: schema.windows.name,
        createdAt: schema.windows.createdAt,
      });

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
}
