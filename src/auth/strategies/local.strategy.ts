import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import type { Request } from 'express';
import { AuthService } from '../auth.service';
import { AuthResult } from '../interfaces/auth.interface';
import { AuditService } from '@/audit/audit.service';
import { buildAuditContext } from '@/audit/utils/build-audit-context';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly authService: AuthService,
    private readonly auditService: AuditService,
  ) {
    super({
      usernameField: 'email',
      passwordField: 'password',
      passReqToCallback: true,
    });
  }

  async validate(
    req: Request,
    email: string,
    password: string,
  ): Promise<AuthResult> {
    const result = await this.authService.validateUserCredentials({
      email,
      password,
    });

    if (!result) {
      await this.auditService.registerAuditLog(
        {
          action: 'login_failed',
          auditableType: 'Auth',
          auditableId: null,
          description: `Login fallido para ${email}`,
        },
        buildAuditContext(req),
      );

      throw new UnauthorizedException('Credenciales invalidas');
    }

    return result;
  }
}
