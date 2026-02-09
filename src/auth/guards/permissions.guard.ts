import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '@/auth/decorators/permissions.decorator';
import { User } from '@/users/interfaces/user.interface';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }
    const { user } = context.switchToHttp().getRequest<{ user: User }>();

    if (!user || !Array.isArray(user.permissions)) return false;

    return requiredPermissions.every((p) => user.permissions.includes(p));
  }
}
