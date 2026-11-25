import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ResponseMessage } from '../common/response.interceptor.js';
import { CurrentUser, Public } from './auth.decorators.js';
import type { AuthUser } from './auth-user.js';
import { AuthService, type SessionResult } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenService } from './refresh-token.service.js';

export const REFRESH_COOKIE = 'armada_refresh';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly config: ConfigService,
  ) {}

  /** Login: access token di body JSON, refresh token di cookie httpOnly */
  @Public()
  @Post('login')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ResponseMessage('Login berhasil')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.withCookie(
      res,
      await this.auth.login(dto, req.headers['user-agent']),
    );
  }

  /** Pulihkan sesi dari cookie refresh token (dipanggil frontend saat aplikasi dimuat & saat 401) */
  @Public()
  @Post('refresh')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ResponseMessage('Sesi diperbarui')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const session = await this.auth.refresh(
        req.cookies?.[REFRESH_COOKIE] as string | undefined,
        req.headers['user-agent'],
      );
      return this.withCookie(res, session);
    } catch (err) {
      this.clearCookie(res);
      throw err;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  @ResponseMessage('Logout berhasil')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE] as string | undefined);
    this.clearCookie(res);
    return null;
  }

  /** Logout dari semua perangkat: semua sesi user ini langsung tidak berlaku */
  @ApiBearerAuth()
  @Post('logout-all')
  @HttpCode(200)
  @ResponseMessage('Semua sesi telah diakhiri')
  async logoutAll(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logoutAll(user);
    this.clearCookie(res);
    return null;
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  private withCookie(res: Response, session: SessionResult) {
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      httpOnly: true,
      secure: this.config.get<boolean>('COOKIE_SECURE') ?? true,
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
      maxAge: this.refreshTokens.ttlMs,
    });
    const { refreshToken: _hidden, ...body } = session;
    return body;
  }

  private clearCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
  }
}
