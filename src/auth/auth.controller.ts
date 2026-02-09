import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import type { Request, Response, CookieOptions } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { Public } from './decorators/public.decorator';
import { AUTH_CONSTANTS } from './constants/auth.constant';
import { ConfigService } from '@nestjs/config';
import { AuthResult } from './interfaces/auth.interface';
import { User } from '@/users/interfaces/user.interface';

type AuthRequest = Request & { user: AuthResult };
type UserRequest = Request & { user: User };

@Controller('auth')
export class AuthController {
  private readonly isProduction: boolean;

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {
    this.isProduction = this.configService.get('NODE_ENV') === 'production';
  }

  @Post('login')
  @Public()
  @UseGuards(AuthGuard('local'))
  @HttpCode(HttpStatus.OK)
  login(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    const authResult = req.user;

    this.setAuthCookies(res, authResult);

    return {
      user: authResult.user,
      message: 'Login exitoso',
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: UserRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(req.user.id);
    this.clearAuthCookies(res);
    return { message: 'Logout exitoso' };
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  async verifyAndRefreshTokens(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.refreshToken as string | undefined;
    if (!refreshToken) throw new UnauthorizedException('No hay refreshToken');

    const {
      accessToken,
      refreshToken: newRefresh,
      user,
    } = await this.authService.refreshTokens(refreshToken);

    this.setAuthCookies(res, { accessToken, refreshToken: newRefresh });
    return { user };
  }

  @Get('me')
  @HttpCode(HttpStatus.OK)
  getCurrentUser(@Req() req: UserRequest) {
    return { user: req.user };
  }

  private baseCookieOptions(): CookieOptions {
    return {
      secure: this.isProduction,
      sameSite: 'lax',
      path: '/',
    };
  }

  private setAuthCookies(
    res: Response,
    authResult: { accessToken: string; refreshToken: string },
  ): void {
    const base = this.baseCookieOptions();

    res.cookie('accessToken', authResult.accessToken, {
      ...base,
      httpOnly: true,
      maxAge: AUTH_CONSTANTS.COOKIE_MAX_AGE.ACCESS,
    });

    res.cookie('refreshToken', authResult.refreshToken, {
      ...base,
      httpOnly: true,
      maxAge: AUTH_CONSTANTS.COOKIE_MAX_AGE.REFRESH,
    });

    res.cookie('IsAuthenticated', true, {
      ...base,
      httpOnly: false,
      maxAge: AUTH_CONSTANTS.COOKIE_MAX_AGE.REFRESH,
    });
  }

  private clearAuthCookies(res: Response): void {
    const base = this.baseCookieOptions();

    res.clearCookie('accessToken', { ...base, httpOnly: true });
    res.clearCookie('refreshToken', { ...base, httpOnly: true });
    res.clearCookie('IsAuthenticated', { ...base, httpOnly: false });
  }
}
