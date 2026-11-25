import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';

const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

/**
 * Refresh token: acak 48 byte, disimpan sebagai hash SHA-256, dirotasi setiap dipakai.
 * Token yang sudah dipakai lalu dipakai lagi = indikasi pencurian,
 * sehingga seluruh family token dicabut dan user harus login ulang.
 */
@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  get ttlMs(): number {
    return (
      this.config.getOrThrow<number>('REFRESH_TOKEN_TTL_DAYS') *
      24 *
      60 *
      60 *
      1000
    );
  }

  async issue(
    userId: string,
    userAgent?: string,
    familyId: string = randomUUID(),
  ) {
    const token = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + this.ttlMs),
        userAgent: userAgent?.slice(0, 255),
      },
    });
    return token;
  }

  /** Tukar refresh token lama dengan yang baru. Mengembalikan userId pemiliknya. */
  async rotate(token: string | undefined, userAgent?: string) {
    if (!token) {
      throw new UnauthorizedException();
    }
    const found = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!found) {
      throw new UnauthorizedException();
    }
    if (found.revokedAt) {
      // Dipakai ulang: cabut seluruh family
      await this.revokeFamily(found.familyId);
      throw new UnauthorizedException();
    }
    if (found.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException();
    }

    // Tandai terpakai secara atomik agar dua request bersamaan tidak sama-sama lolos
    const spent = await this.prisma.refreshToken.updateMany({
      where: { id: found.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (spent.count === 0) {
      await this.revokeFamily(found.familyId);
      throw new UnauthorizedException();
    }

    const next = await this.issue(found.userId, userAgent, found.familyId);
    return { userId: found.userId, token: next };
  }

  async revoke(token: string | undefined) {
    if (!token) {
      return;
    }
    const found = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (found) {
      await this.revokeFamily(found.familyId);
    }
  }

  revokeFamily(familyId: string) {
    return this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Dipakai saat user dinonaktifkan/dihapus/ganti password */
  revokeAllForUser(userId: string) {
    return this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
