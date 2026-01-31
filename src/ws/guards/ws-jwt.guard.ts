import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '@/auth/auth.service';
import { Socket } from 'socket.io';
import { JwtPayload } from '@/auth/interfaces/jwt-payload.interface';

interface AuthenticatedSocket extends Socket {
  data: {
    user: JwtPayload;
  };
}

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient();

    const cookie = client.handshake.headers.cookie;
    if (!cookie) throw new UnauthorizedException('No cookies');

    const match = cookie.match(/accessToken=([^;]+)/);
    if (!match) throw new UnauthorizedException('Access token no encontrado');

    const payload = await this.authService.validatedAccessToken(match[1]);

    (client as AuthenticatedSocket).data.user = payload;
    return true;
  }
}
