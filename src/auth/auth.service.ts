import { DB_CONN } from '@/database/db.conn';
import { schema } from '@/database/schema';
import {
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { LoginDto } from './dto/login.dto';
import { AuthResult, FindUserOptions } from './interfaces/auth.interface';
import { and, eq, lt, or, SQL } from 'drizzle-orm';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { User } from '@/users/interfaces/user.interface';
import * as argon2 from 'argon2';
import { AUTH_CONSTANTS } from './constants/auth.constant';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB_CONN)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async validateUserCredentials(
    loginDto: LoginDto,
  ): Promise<AuthResult | null> {
    const { email, password } = loginDto;

    const user = await this.findUserWithRolesAndPermissions(
      eq(schema.users.email, email),
      {
        includePassword: true,
        includeIsActive: true,
      },
    );

    if (!user || !user.isActive || !user.password) return null;

    const isPasswordValid = await argon2.verify(user.password, password);
    if (!isPasswordValid) return null;

    const tokens = await this.generateTokens(user);

    return {
      ...tokens,
      user,
    };
  }

  async logout(userId: string): Promise<void> {
    await this.db
      .update(schema.sessions)
      .set({ status: 'revoked' })
      .where(
        and(
          eq(schema.sessions.userId, userId),
          eq(schema.sessions.status, 'active'),
        ),
      );
  }

  async validateUser(payload: JwtPayload) {
    const user = await this.findUserWithRolesAndPermissions(
      eq(schema.users.id, payload.sub),
      {
        includeIsActive: true,
      },
    );

    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }

    return user;
  }

  async refreshTokens(refreshToken: string): Promise<AuthResult> {
    await this.jwtService.verifyAsync(refreshToken, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
    });

    const storedToken = await this.db.query.sessions.findFirst({
      where: eq(schema.sessions.refreshToken, refreshToken),
      with: {
        user: {
          columns: {
            id: true,
          },
        },
      },
    });

    if (
      !storedToken ||
      storedToken.status === 'revoked' ||
      storedToken.expiresAt < new Date()
    ) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    const user = await this.findUserWithRolesAndPermissions(
      eq(schema.users.id, storedToken.user.id),
    );

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const tokens = await this.generateTokens(user);

    await this.db
      .update(schema.sessions)
      .set({ status: 'revoked' })
      .where(eq(schema.sessions.id, storedToken.id));

    return {
      ...tokens,
      user,
    };
  }

  async validatedAccessToken(token: string): Promise<JwtPayload> {
    const payload: JwtPayload = await this.jwtService.verifyAsync(token, {
      secret: this.configService.get<string>('JWT_SECRET'),
    });

    if (!payload) {
      throw new UnauthorizedException('Token de acceso inválido');
    }

    return payload;
  }

  private async findUserWithRolesAndPermissions(
    condition: SQL,
    options: FindUserOptions = {},
  ) {
    const { includePassword = false, includeIsActive = false } = options;

    const user = await this.db.query.users.findFirst({
      where: condition,
      columns: {
        id: true,
        name: true,
        email: true,
        password: includePassword,
        isActive: includeIsActive,
      },
      with: {
        userRoles: {
          with: {
            role: {
              columns: {
                id: true,
                name: true,
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
            },
          },
        },
      },
    });

    if (!user) return null;

    const roles = user.userRoles.map((ur) => ur.role.name);
    const permissions = [
      ...new Set(
        user.userRoles.flatMap((ur) =>
          ur.role.rolePermissions.map((rp) => rp.permission.name),
        ),
      ),
    ];

    type UserQueryResult = typeof user;
    const userWithDynamicFields = user as UserQueryResult & {
      password?: string;
      isActive?: boolean;
    };

    const result: User & { password?: string; isActive?: boolean } = {
      id: userWithDynamicFields.id,
      name: userWithDynamicFields.name,
      email: userWithDynamicFields.email,
      roles,
      permissions,
    };

    if (includePassword && userWithDynamicFields.password) {
      result.password = userWithDynamicFields.password;
    }

    if (includeIsActive && userWithDynamicFields.isActive) {
      result.isActive = userWithDynamicFields.isActive;
    }

    return result;
  }

  private async generateTokens(user: User) {
    const payload: JwtPayload = {
      sub: user.id,
      name: user.name,
      email: user.email,
      roles: user.roles,
      permissions: user.permissions,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        expiresIn: AUTH_CONSTANTS.ACCESS_TOKEN_EXPIRY,
      }),
      this.jwtService.signAsync(
        { sub: user.id },
        {
          secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
          expiresIn: AUTH_CONSTANTS.REFRESH_TOKEN_EXPIRY,
        },
      ),
    ]);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await Promise.all([
      this.db.insert(schema.sessions).values({
        refreshToken,
        userId: user.id,
        expiresAt,
      }),
      this.cleanupExpiredTokens(),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }

  private async cleanupExpiredTokens(): Promise<void> {
    await this.db
      .delete(schema.sessions)
      .where(
        or(
          lt(schema.sessions.expiresAt, new Date()),
          eq(schema.sessions.status, 'revoked'),
        ),
      );
  }
}
