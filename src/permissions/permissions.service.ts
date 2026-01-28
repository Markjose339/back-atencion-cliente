import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { PaginationService } from '@/pagination/pagination.service';
import { DB_CONN } from '@/database/db.conn';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { schema } from '@/database/schema';
import { and, count, eq, ilike, inArray, ne, or } from 'drizzle-orm';
import { PaginationDto } from '@/pagination/dto/pagination.dto';

@Injectable()
export class PermissionsService extends PaginationService {
  constructor(
    @Inject(DB_CONN)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {
    super();
  }

  async create(createPermissionDto: CreatePermissionDto) {
    await this.validatedPermissionName(createPermissionDto.name);

    const [permission] = await this.db
      .insert(schema.permissions)
      .values(createPermissionDto)
      .returning({
        id: schema.permissions.id,
        name: schema.permissions.name,
        createdAt: schema.permissions.createdAt,
      });
    return permission;
  }

  async findAll(paginationDto: PaginationDto) {
    const { page, limit } = this.validatePaginationParams(paginationDto);
    const { search } = paginationDto;
    const skip = this.calulateSkip(page, limit);

    const where = search
      ? or(
          ilike(schema.permissions.id, `%${search}%`),
          ilike(schema.permissions.name, `%${search}%`),
        )
      : undefined;

    const [data, [{ value: total }]] = await Promise.all([
      this.db.query.permissions.findMany({
        where,
        limit,
        offset: skip,
        columns: {
          id: true,
          name: true,
          createdAt: true,
        },
        orderBy: (permissions, { desc }) => desc(permissions.createdAt),
      }),
      this.db.select({ value: count() }).from(schema.permissions).where(where),
    ]);

    const meta = this.builPaginationMeta(total, page, limit, data.length);

    return { data, meta };
  }

  async findOne(id: string) {
    return await this.validatedPermissionId(id);
  }

  async update(id: string, updatePermissionDto: UpdatePermissionDto) {
    const validations: Promise<void>[] = [
      this.validatedPermissionId(id).then(() => undefined),
    ];

    if (updatePermissionDto.name) {
      validations.push(
        this.validatedPermissionName(updatePermissionDto.name, id),
      );
    }

    await Promise.all(validations);

    const [permission] = await this.db
      .update(schema.permissions)
      .set(updatePermissionDto)
      .where(eq(schema.permissions.id, id))
      .returning({
        id: schema.permissions.id,
        name: schema.permissions.name,
        createdAt: schema.permissions.createdAt,
      });

    return permission;
  }

  async remove(id: string) {
    await this.validatedPermissionId(id);

    const [permission] = await this.db
      .delete(schema.permissions)
      .where(eq(schema.permissions.id, id))
      .returning({
        id: schema.permissions.id,
        name: schema.permissions.name,
        createdAt: schema.permissions.createdAt,
      });
    return permission;
  }

  async validatedPermissionId(id: string) {
    const permission = await this.db.query.permissions.findFirst({
      where: eq(schema.permissions.id, id),
    });

    if (!permission)
      throw new NotFoundException(`Permiso con el id ${id} no encontrado`);

    return permission;
  }

  async validatedPermissionIds(permissionIds: string[]) {
    const permissions = await this.db
      .select({ id: schema.permissions.id })
      .from(schema.permissions)
      .where(inArray(schema.permissions.id, permissionIds));

    if (permissions.length !== permissionIds.length)
      throw new NotFoundException('Uno o más permisos no existen');
  }

  async validatedPermissionName(name: string, excludeId?: string) {
    const where = excludeId
      ? and(
          eq(schema.permissions.name, name),
          ne(schema.permissions.id, excludeId),
        )
      : eq(schema.permissions.name, name);

    const permission = await this.db.query.permissions.findFirst({
      where,
    });

    if (permission)
      throw new ConflictException(`Permiso con el nombre "${name}" ya existe`);
  }
}
