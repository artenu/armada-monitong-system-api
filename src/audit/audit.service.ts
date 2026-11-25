import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser } from '../auth/auth-user.js';

/** Catat aktivitas penting: siapa, kapan, apa (Standar v2.3 bagian 10.2) */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(
    user: Pick<AuthUser, 'id' | 'name'> | null,
    action: string,
    entity: string,
    entityId?: string,
    detail?: Record<string, unknown>,
  ) {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: user?.id ?? null,
          userName: user?.name ?? null,
          action,
          entity,
          entityId: entityId ?? null,
          detail: detail ? (detail as Prisma.InputJsonValue) : Prisma.DbNull,
        },
      });
    } catch (err) {
      // Gagal mencatat audit tidak boleh menggagalkan aksi utama
      this.logger.warn(`Gagal mencatat audit ${action}: ${String(err)}`);
    }
  }
}
