import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { schema } from '@/database/schema';
import { count, eq, ilike, ne, or } from 'drizzle-orm';
import * as argon2 from 'argon2';
import { DB_CONN } from '@/database/db.conn';
import { PaginationService } from '@/pagination/pagination.service';
import { RolesService } from '@/roles/roles.service';
import { and } from 'drizzle-orm';
import { PaginationDto } from '@/pagination/dto/pagination.dto';

@Injectable()
export class UsersService extends PaginationService {
  constructor(
    @Inject(DB_CONN)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly rolesService: RolesService,
  ) {
    super();
  }
  async create(createUserDto: CreateUserDto) {
    const { name, email, password, address, phone, isActive, roleIds } =
      createUserDto;

    await Promise.all([
      this.validatedUserEmail(email),
      this.rolesService.validatedRoleIds(roleIds),
    ]);

    const hashPassword = await this.hashPassword(password);

    return await this.db.transaction(async (tx) => {
      const [user] = await tx
        .insert(schema.users)
        .values({
          name,
          email,
          password: hashPassword,
          address,
          phone,
          isActive,
        })
        .returning({
          id: schema.users.id,
        });

      await tx.insert(schema.userRoles).values(
        roleIds.map((roleId) => ({
          userId: user.id,
          roleId,
        })),
      );

      return await this.getUserWithRoles(user.id, tx);
    });
  }
  async findAll(paginationDto: PaginationDto) {
    const { page, limit } = this.validatePaginationParams(paginationDto);
    const { search } = paginationDto;
    const skip = this.calulateSkip(page, limit);

    const where = search
      ? or(
          ilike(schema.users.id, `%${search}%`),
          ilike(schema.users.name, `%${search}%`),
          ilike(schema.users.email, `%${search}%`),
        )
      : undefined;

    const [users, [{ value: total }]] = await Promise.all([
      this.db.query.users.findMany({
        where,
        limit,
        offset: skip,
        columns: {
          id: true,
          name: true,
          email: true,
          address: true,
          phone: true,
          isActive: true,
          createdAt: true,
        },
        with: {
          userRoles: {
            with: {
              role: {
                columns: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
        orderBy: (users, { desc }) => desc(users.createdAt),
      }),
      this.db.select({ value: count() }).from(schema.users).where(where),
    ]);

    const data = users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      address: user.address,
      phone: user.phone,
      isActive: user.isActive,
      createdAt: user.createdAt,
      roles: user.userRoles.map((ur) => ur.role),
    }));

    const meta = this.builPaginationMeta(total, page, limit, data.length);
    return { data, meta };
  }

  async findOne(id: string) {
    return await this.validatedUserId(id);
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const { email, password, roleIds, ...restData } = updateUserDto;

    const validations: Promise<void>[] = [
      this.validatedUserId(id).then(() => undefined),
    ];

    if (email) {
      validations.push(this.validatedUserEmail(email, id));
    }

    if (roleIds) {
      validations.push(this.rolesService.validatedRoleIds(roleIds));
    }

    await Promise.all(validations);

    const updateData: Partial<UpdateUserDto> = { ...restData };

    if (email) {
      updateData.email = email;
    }

    if (password) {
      updateData.password = await this.hashPassword(password);
    }

    return this.db.transaction(async (tx) => {
      if (Object.keys(updateData).length > 0) {
        await tx
          .update(schema.users)
          .set(updateData)
          .where(eq(schema.users.id, id));
      }

      if (roleIds) {
        await tx
          .delete(schema.userRoles)
          .where(eq(schema.userRoles.userId, id));

        if (roleIds.length > 0) {
          await tx.insert(schema.userRoles).values(
            roleIds.map((roleId) => ({
              userId: id,
              roleId,
            })),
          );
        }
      }

      return await this.getUserWithRoles(id, tx);
    });
  }

  async remove(id: string) {
    await this.validatedUserId(id);

    return this.db.transaction(async (tx) => {
      await tx.delete(schema.userRoles).where(eq(schema.userRoles.userId, id));

      const [user] = await tx
        .delete(schema.users)
        .where(eq(schema.users.id, id))
        .returning({
          id: schema.users.id,
          name: schema.users.name,
          email: schema.users.email,
        });

      return user;
    });
  }

  private async hashPassword(password: string): Promise<string> {
    return await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16,
      timeCost: 3,
      parallelism: 1,
      hashLength: 32,
    });
  }

  async validatedUserId(id: string) {
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.id, id),
      columns: {
        id: true,
        name: true,
        email: true,
        address: true,
        phone: true,
        isActive: true,
        createdAt: true,
      },
      with: {
        userRoles: {
          with: {
            role: {
              columns: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`Usuario con el id ${id} no encontrado`);
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      address: user.address,
      phone: user.phone,
      isActive: user.isActive,
      createdAt: user.createdAt,
      roles: user.userRoles.map((ur) => ur.role),
    };
  }

  async validatedUserEmail(email: string, excludeId?: string) {
    const where = excludeId
      ? and(eq(schema.users.email, email), ne(schema.users.id, excludeId))
      : eq(schema.users.email, email);

    const user = await this.db.query.users.findFirst({
      where,
      columns: {
        id: true,
      },
    });

    if (user) {
      throw new ConflictException(
        `Usuario con el correo electrónico ${email} ya existe`,
      );
    }
  }

  private async getUserWithRoles(
    id: string,
    tx: NodePgDatabase<typeof schema>,
  ) {
    const user = await tx.query.users.findFirst({
      where: eq(schema.users.id, id),
      columns: {
        id: true,
        name: true,
        email: true,
        address: true,
        phone: true,
        isActive: true,
        createdAt: true,
      },
      with: {
        userRoles: {
          with: {
            role: {
              columns: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`Usuario con el id ${id} no encontrado`);
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      address: user.address,
      phone: user.phone,
      isActive: user.isActive,
      createdAt: user.createdAt,
      roles: user.userRoles.map((ur) => ur.role),
    };
  }
}
