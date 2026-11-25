import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser } from './auth-user.js';
import type { LoginDto } from './dto/login.dto.js';
import { PasswordService } from './password.service.js';
import {
  type IssuedToken,
  RefreshTokenService,
} from './refresh-token.service.js';

export interface SessionResult {
  user: AuthUser;
  /** Access token (JWT), disimpan frontend di memori */
  token: string;
  /** Masa berlaku access token, mis. "15m" */
  expiresIn: string;
  /** Refresh token mentah: hanya untuk diset ke cookie httpOnly oleh controller */
  refreshToken: string;
}

const AUTH_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  department: true,
} as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly passwords: PasswordService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly audit: AuditService,
  ) {}

  async login(dto: LoginDto, userAgent?: string): Promise<SessionResult> {
    const email = dto.email.trim().toLowerCase();
    const found = await this.prisma.user.findUnique({ where: { email } });

    // Selalu verifikasi hash (dummy bila user tidak ada) agar waktu respons sama
    const valid = await this.passwords.verify(
      dto.password,
      found?.passwordHash,
    );
    if (!found || !valid) {
      throw new UnauthorizedException('Email atau password salah.');
    }
    if (found.status !== 'Aktif') {
      throw new ForbiddenException(
        'Akun Anda dinonaktifkan. Hubungi administrator.',
      );
    }

    await this.prisma.user.update({
      where: { id: found.id },
      data: { lastLoginAt: new Date() },
    });
    const user: AuthUser = {
      id: found.id,
      name: found.name,
      email: found.email,
      role: found.role,
      department: found.department,
    };
    await this.audit.record(user, 'auth.login', 'user', user.id);
    return this.createSession(
      user,
      await this.refreshTokens.issue(user.id, userAgent),
    );
  }

  async refresh(
    refreshToken: string | undefined,
    userAgent?: string,
  ): Promise<SessionResult> {
    const rotated = await this.refreshTokens.rotate(refreshToken, userAgent);
    const user = await this.prisma.user.findUnique({
      where: { id: rotated.userId },
      select: { ...AUTH_USER_SELECT, status: true },
    });
    if (!user || user.status !== 'Aktif') {
      await this.refreshTokens.revokeAllForUser(rotated.userId);
      throw new UnauthorizedException(
        'Akun tidak aktif. Hubungi administrator.',
      );
    }
    const { status: _status, ...authUser } = user;
    return this.createSession(authUser, rotated);
  }

  logout(refreshToken: string | undefined) {
    return this.refreshTokens.revoke(refreshToken);
  }

  /** Akhiri semua sesi user ini di semua perangkat */
  async logoutAll(user: AuthUser) {
    await this.refreshTokens.revokeAllForUser(user.id);
    await this.audit.record(user, 'auth.logout_all', 'user', user.id);
  }

  /** Access token membawa `sid` agar JwtAuthGuard bisa mengecek sesinya masih aktif */
  private async createSession(
    user: AuthUser,
    issued: IssuedToken,
  ): Promise<SessionResult> {
    const token = await this.jwt.signAsync({
      sub: user.id,
      sid: issued.sessionId,
    });
    return {
      user,
      token,
      expiresIn: this.config.getOrThrow<string>('JWT_ACCESS_TTL'),
      refreshToken: issued.token,
    };
  }
}
