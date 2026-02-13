import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { PaginationDto } from '@/pagination/dto/pagination.dto';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { PermissionsService } from '@/permissions/permissions.service';
import { DB_CONN } from '@/database/db.conn';
import { schema } from '@/database/schema';
import { and, count, eq, ilike, inArray, ne, or, sql } from 'drizzle-orm';
import { PaginationService } from '@/pagination/pagination.service';

@Injectable()
export class RolesService extends PaginationService {
  constructor(
    @Inject(DB_CONN)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly permissionsService: PermissionsService,
  ) {
    super();
  }

  async create(createRoleDto: CreateRoleDto) {
    const { name, permissionIds } = createRoleDto;

    await Promise.all([
      this.validatedRoleName(name),
      this.permissionsService.validatedPermissionIds(permissionIds),
    ]);

    return this.db.transaction(async (tx) => {
      const [role] = await tx.insert(schema.roles).values({ name }).returning({
        id: schema.roles.id,
      });

      await tx.insert(schema.rolePermissions).values(
        permissionIds.map((permissionId) => ({
          roleId: role.id,
          permissionId,
        })),
      );

      return await this.getRoleWithPermissions(role.id, tx);
    });
  }

  async findAll(paginationDto: PaginationDto) {
    const { page, limit } = this.validatePaginationParams(paginationDto);
    const { search } = paginationDto;
    const skip = this.calulateSkip(page, limit);

    const where = search
      ? or(
          ilike(schema.roles.id, `%${search}%`),
          ilike(schema.roles.name, `%${search}%`),
        )
      : undefined;

    const [roles, [{ value: total }]] = await Promise.all([
      this.db.query.roles.findMany({
        where,
        limit,
        offset: skip,
        columns: {
          id: true,
          name: true,
          createdAt: true,
        },
        with: {
          rolePermissions: {
            with: {
              permission: {
                columns: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
        orderBy: (roles, { desc }) => desc(roles.createdAt),
      }),
      this.db.select({ value: count() }).from(schema.roles).where(where),
    ]);

    const data = roles.map((role) => ({
      id: role.id,
      name: role.name,
      createdAt: role.createdAt,
      permissions: role.rolePermissions.map((rp) => rp.permission),
    }));

    const meta = this.builPaginationMeta(total, page, limit, data.length);

    return { data, meta };
  }

  async findOne(id: string) {
    return await this.validatedRoleId(id);
  }

  async update(id: string, updateRoleDto: UpdateRoleDto) {
    const { name, permissionIds } = updateRoleDto;

    const validations: Promise<void>[] = [
      this.validatedRoleId(id).then(() => undefined),
    ];

    if (name) {
      validations.push(this.validatedRoleName(name, id));
    }

    if (permissionIds) {
      validations.push(
        this.permissionsService.validatedPermissionIds(permissionIds),
      );
    }

    await Promise.all(validations);

    return this.db.transaction(async (tx) => {
      if (name) {
        await tx
          .update(schema.roles)
          .set({ name, updatedAt: sql`now()` })
          .where(eq(schema.roles.id, id));
      }

      if (permissionIds) {
        await tx
          .delete(schema.rolePermissions)
          .where(eq(schema.rolePermissions.roleId, id));

        if (permissionIds.length > 0) {
          await tx.insert(schema.rolePermissions).values(
            permissionIds.map((permissionId) => ({
              roleId: id,
              permissionId,
            })),
          );
        }
      }

      return await this.getRoleWithPermissions(id, tx);
    });
  }

  async remove(id: string) {
    await this.validatedRoleId(id);

    return this.db.transaction(async (tx) => {
      await tx
        .delete(schema.rolePermissions)
        .where(eq(schema.rolePermissions.roleId, id));

      const [role] = await tx
        .delete(schema.roles)
        .where(eq(schema.roles.id, id))
        .returning({
          id: schema.roles.id,
          name: schema.roles.name,
          createdAt: schema.roles.createdAt,
        });

      return role;
    });
  }

  async validatedRoleId(id: string) {
    const role = await this.db.query.roles.findFirst({
      where: eq(schema.roles.id, id),
      columns: {
        id: true,
        name: true,
        createdAt: true,
      },
      with: {
        rolePermissions: {
          with: {
            permission: {
              columns: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException(`Rol con el id ${id} no encontrado`);
    }

    return {
      id: role.id,
      name: role.name,
      createdAt: role.createdAt,
      permissions: role.rolePermissions.map((rp) => rp.permission),
    };
  }

  async validatedRoleIds(roleIds: string[]) {
    const roles = await this.db
      .select({ id: schema.roles.id })
      .from(schema.roles)
      .where(inArray(schema.roles.id, roleIds));

    if (roles.length !== roleIds.length) {
      throw new NotFoundException('Uno o más roles no existen');
    }
  }

  async validatedRoleName(name: string, excludeId?: string) {
    const where = excludeId
      ? and(eq(schema.roles.name, name), ne(schema.roles.id, excludeId))
      : eq(schema.roles.name, name);

    const role = await this.db.query.roles.findFirst({
      where,
      columns: {
        id: true,
      },
    });

    if (role) {
      throw new ConflictException(`Rol con el nombre ${name} ya existe`);
    }
  }

  private async getRoleWithPermissions(
    id: string,
    tx: NodePgDatabase<typeof schema>,
  ) {
    const role = await tx.query.roles.findFirst({
      where: eq(schema.roles.id, id),
      columns: {
        id: true,
        name: true,
        createdAt: true,
      },
      with: {
        rolePermissions: {
          with: {
            permission: {
              columns: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException(`Rol con el id ${id} no encontrado`);
    }

    return {
      id: role.id,
      name: role.name,
      createdAt: role.createdAt,
      permissions: role.rolePermissions.map((rp) => rp.permission),
    };
  }
}
