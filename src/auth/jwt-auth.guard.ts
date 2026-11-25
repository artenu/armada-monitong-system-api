import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import { IS_PUBLIC_KEY } from './auth.decorators.js';
import type { AuthenticatedRequest } from './auth-user.js';
import { RefreshTokenService } from './refresh-token.service.js';

export const SESSION_ENDED_MESSAGE = 'Sesi berakhir. Silakan login kembali.';

/**
 * Guard global: semua endpoint wajib login kecuali yang ditandai @Public().
 *
 * Di setiap request:
 * 1. tanda tangan & masa berlaku access token (JWT) dicek,
 * 2. sesi login (`sid`) harus masih aktif di database: logout, ganti password,
 *    atau "logout semua perangkat" langsung berlaku tanpa menunggu token kedaluwarsa,
 * 3. user dimuat ulang dari database: akun yang dinonaktifkan atau diubah
 *    role-nya langsung berlaku.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly sessions: RefreshTokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const req = context
      .switchToHttp()
      .getRequest<Request & Partial<AuthenticatedRequest>>();
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) {
      throw new UnauthorizedException();
    }

    let payload: { sub?: unknown; sid?: unknown };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException();
    }
    const { sub: userId, sid: sessionId } = payload;
    if (typeof userId !== 'string' || typeof sessionId !== 'string') {
      throw new UnauthorizedException();
    }

    const [user, sessionActive] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          department: true,
          status: true,
        },
      }),
      this.sessions.isActive(userId, sessionId),
    ]);
    if (!user || user.status !== 'Aktif') {
      throw new UnauthorizedException(
        'Akun tidak aktif. Hubungi administrator.',
      );
    }
    if (!sessionActive) {
      throw new UnauthorizedException(SESSION_ENDED_MESSAGE);
    }

    const { status: _status, ...authUser } = user;
    req.user = authUser;
    req.sessionId = sessionId;
    return true;
  }
}
