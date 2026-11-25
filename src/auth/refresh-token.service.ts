import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

type Db = PrismaService | Prisma.TransactionClient;

export interface IssuedToken {
  /** Refresh token mentah, hanya untuk cookie httpOnly */
  token: string;
  /** ID sesi (family refresh token), dicantumkan di access token sebagai `sid` */
  sessionId: string;
}

/**
 * Sesi login = satu "family" refresh token (satu login di satu perangkat).
 *
 * Refresh token: acak 48 byte, disimpan sebagai hash SHA-256, dirotasi setiap dipakai.
 * Token yang sudah dipakai lalu dipakai lagi = indikasi pencurian,
 * sehingga seluruh family token dicabut dan user harus login ulang.
 *
 * Sesi dianggap aktif selama family-nya masih punya token yang belum dicabut
 * dan belum kedaluwarsa. JwtAuthGuard mengecek ini di setiap request, sehingga
 * logout / ganti password / nonaktif langsung mematikan access token juga.
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
    sessionId: string = randomUUID(),
    db: Db = this.prisma,
  ): Promise<IssuedToken> {
    const token = randomBytes(48).toString('base64url');
    await db.refreshToken.create({
      data: {
        userId,
        familyId: sessionId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + this.ttlMs),
        userAgent: userAgent?.slice(0, 255),
      },
    });
    return { token, sessionId };
  }

  /** Tukar refresh token lama dengan yang baru dalam sesi yang sama. */
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

    // Cabut token lama + terbitkan token baru dalam satu transaksi: request lain
    // selalu melihat sesi tetap aktif (tidak ada jeda tanpa token aktif), dan
    // dua refresh bersamaan tidak bisa sama-sama lolos.
    const next = await this.prisma.$transaction(async (tx) => {
      const spent = await tx.refreshToken.updateMany({
        where: { id: found.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (spent.count === 0) {
        return null;
      }
      return this.issue(found.userId, userAgent, found.familyId, tx);
    });
    if (!next) {
      await this.revokeFamily(found.familyId);
      throw new UnauthorizedException();
    }
    return { userId: found.userId, ...next };
  }

  /** Apakah sesi ini masih aktif untuk user tersebut */
  async isActive(userId: string, sessionId: string): Promise<boolean> {
    const active = await this.prisma.refreshToken.count({
      where: {
        userId,
        familyId: sessionId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    return active > 0;
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

  /**
   * Cabut semua sesi user (nonaktif / dihapus / ganti password / logout semua perangkat).
   * `keepSessionId`: sesi yang tetap dipertahankan, mis. sesi yang sedang dipakai
   * user saat mengganti password-nya sendiri.
   */
  revokeAllForUser(userId: string, keepSessionId?: string) {
    return this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(keepSessionId ? { familyId: { not: keepSessionId } } : {}),
      },
      data: { revokedAt: new Date() },
    });
  }
}
