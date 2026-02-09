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
import { and, eq, lt, or, SQL, InferSelectModel } from 'drizzle-orm';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { User } from '@/users/interfaces/user.interface';
import * as argon2 from 'argon2';
import { AUTH_CONSTANTS } from './constants/auth.constant';
import * as crypto from 'crypto';

type DbUser = InferSelectModel<typeof schema.users>;

type UserBase = Pick<DbUser, 'id' | 'name' | 'email'> & {
  password?: DbUser['password'];
  isActive?: DbUser['isActive'];
};

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

    const userBase = await this.findUserBase(eq(schema.users.email, email), {
      includePassword: true,
      includeIsActive: true,
    });

    if (!userBase?.isActive || !userBase.password) return null;

    const ok = await argon2.verify(userBase.password, password);
    if (!ok) return null;

    const fullUser = await this.attachRolesAndPermissions(userBase);
    const tokens = await this.generateTokens(fullUser);

    return { ...tokens, user: fullUser };
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

  async validateUser(payload: JwtPayload): Promise<User> {
    const userBase = await this.findUserBase(eq(schema.users.id, payload.sub), {
      includeIsActive: true,
    });

    if (!userBase?.isActive) throw new UnauthorizedException();

    return this.attachRolesAndPermissions(userBase);
  }

  async refreshTokens(refreshToken: string): Promise<AuthResult> {
    try {
      await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido');
    }

    const refreshTokenHash = this.hashToken(refreshToken);

    const storedToken = await this.db.query.sessions.findFirst({
      where: eq(schema.sessions.refreshToken, refreshTokenHash),
      with: { user: { columns: { id: true } } },
    });

    if (
      !storedToken ||
      storedToken.status === 'revoked' ||
      storedToken.expiresAt < new Date()
    ) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    const userBase = await this.findUserBase(
      eq(schema.users.id, storedToken.user.id),
    );
    if (!userBase) throw new NotFoundException('Usuario no encontrado');

    const fullUser = await this.attachRolesAndPermissions(userBase);
    const tokens = await this.generateTokens(fullUser);

    await this.db
      .update(schema.sessions)
      .set({ status: 'revoked' })
      .where(eq(schema.sessions.id, storedToken.id));

    return { ...tokens, user: fullUser };
  }

  async validatedAccessToken(token: string): Promise<JwtPayload> {
    try {
      return await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Token de acceso inválido');
    }
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async findUserBase(
    condition: SQL,
    options: FindUserOptions = {},
  ): Promise<UserBase | null> {
    const { includePassword = false, includeIsActive = false } = options;

    type UserBaseSelect = Pick<DbUser, 'id' | 'name' | 'email'> &
      Partial<Pick<DbUser, 'password' | 'isActive'>>;

    const user = (await this.db.query.users.findFirst({
      where: condition,
      columns: {
        id: true,
        name: true,
        email: true,
        password: includePassword,
        isActive: includeIsActive,
      },
    })) as UserBaseSelect | null;

    if (!user) return null;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      ...(includePassword ? { password: user.password } : {}),
      ...(includeIsActive ? { isActive: user.isActive } : {}),
    };
  }

  private async attachRolesAndPermissions(userBase: UserBase): Promise<User> {
    const roleRows = await this.db
      .select({ roleName: schema.roles.name })
      .from(schema.userRoles)
      .innerJoin(schema.roles, eq(schema.userRoles.roleId, schema.roles.id))
      .where(eq(schema.userRoles.userId, userBase.id));

    const roles = roleRows.map((r) => r.roleName);

    const permRows = await this.db
      .select({ permName: schema.permissions.name })
      .from(schema.userRoles)
      .innerJoin(schema.roles, eq(schema.userRoles.roleId, schema.roles.id))
      .innerJoin(
        schema.rolePermissions,
        eq(schema.rolePermissions.roleId, schema.roles.id),
      )
      .innerJoin(
        schema.permissions,
        eq(schema.rolePermissions.permissionId, schema.permissions.id),
      )
      .where(eq(schema.userRoles.userId, userBase.id));

    const permissions = Array.from(new Set(permRows.map((p) => p.permName)));

    return {
      id: userBase.id,
      name: userBase.name,
      email: userBase.email,
      roles,
      permissions,
    };
  }

  private async generateTokens(user: User) {
    const payload: JwtPayload = { sub: user.id };

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

    const expiresAt = new Date(
      Date.now() + AUTH_CONSTANTS.COOKIE_MAX_AGE.REFRESH,
    );

    const refreshTokenHash = this.hashToken(refreshToken);

    await this.db.insert(schema.sessions).values({
      refreshToken: refreshTokenHash,
      userId: user.id,
      expiresAt,
    });

    return { accessToken, refreshToken };
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
