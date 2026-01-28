import {
  Body,
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
import type { Request, Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { Public } from './decorators/public.decorator';
import { AUTH_CONSTANTS } from './constants/auth.constant';
import { ConfigService } from '@nestjs/config';
import { AuthResult } from './interfaces/auth.interface';
import { User } from '@/users/interfaces/user.interface';

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
  login(
    @Req() req: Request & { user: AuthResult },
    @Res({ passthrough: true }) res: Response,
  ) {
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
    @Req() req: Request & { user: User },
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = req.user;

    await this.authService.logout(user.id);

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

    if (!refreshToken) {
      throw new UnauthorizedException('No hay refreshToken');
    }

    const result = await this.authService.refreshTokens(refreshToken);

    if (!result) {
      this.clearAuthCookies(res);
      throw new UnauthorizedException('Tokens inválidos');
    }

    const { accessToken, refreshToken: newRefresh, user } = result;

    this.setAuthCookies(res, { accessToken, refreshToken: newRefresh });

    return { user };
  }

  @Get('me')
  @HttpCode(HttpStatus.OK)
  getCurrentUser(@Req() request: Request & { user: User }) {
    return {
      user: request.user,
    };
  }

  private setAuthCookies(
    res: Response,
    authResult: { accessToken: string; refreshToken: string },
  ): void {
    const cookieOptions = {
      httpOnly: true,
      secure: this.isProduction,
      sameSite: this.isProduction ? ('strict' as const) : ('lax' as const),
      path: '/',
    };

    res.cookie('accessToken', authResult.accessToken, {
      ...cookieOptions,
      maxAge: AUTH_CONSTANTS.COOKIE_MAX_AGE.ACCESS,
    });

    res.cookie('refreshToken', authResult.refreshToken, {
      ...cookieOptions,
      maxAge: AUTH_CONSTANTS.COOKIE_MAX_AGE.REFRESH,
    });

    res.cookie('IsAuthenticated', true, {
      ...cookieOptions,
      httpOnly: false,
      maxAge: AUTH_CONSTANTS.COOKIE_MAX_AGE.REFRESH,
    });
  }

  private clearAuthCookies(res: Response): void {
    const cookieOptions = {
      httpOnly: true,
      secure: this.isProduction,
      sameSite: this.isProduction ? ('strict' as const) : ('lax' as const),
      path: '/',
    };

    res.clearCookie('accessToken', cookieOptions);
    res.clearCookie('refreshToken', cookieOptions);
    res.clearCookie('IsAuthenticated', {
      ...cookieOptions,
      httpOnly: false,
    });
  }
}
