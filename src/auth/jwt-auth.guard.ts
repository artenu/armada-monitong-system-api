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
import type { AuthUser } from './auth-user.js';

/**
 * Guard global: semua endpoint wajib login kecuali yang ditandai @Public().
 * User dimuat ulang dari database di setiap request, sehingga akun yang
 * dinonaktifkan atau diubah role-nya langsung berlaku.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
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
      .getRequest<Request & { user?: AuthUser }>();
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) {
      throw new UnauthorizedException();
    }

    let userId: string;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token);
      userId = payload.sub;
    } catch {
      throw new UnauthorizedException();
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        department: true,
        status: true,
      },
    });
    if (!user || user.status !== 'Aktif') {
      throw new UnauthorizedException(
        'Akun tidak aktif. Hubungi administrator.',
      );
    }

    const { status: _status, ...authUser } = user;
    req.user = authUser;
    return true;
  }
}
