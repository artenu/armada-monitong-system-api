import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async register(file: Express.Multer.File, user: AuthUser) {
    // Nama asli dari browser dikirim sebagai latin1 oleh multer; kembalikan ke UTF-8
    const originalName = Buffer.from(file.originalname, 'latin1').toString(
      'utf8',
    );
    const saved = await this.prisma.fileUpload.create({
      data: {
        originalName,
        storedName: file.filename,
        mimeType: file.mimetype,
        size: file.size,
        uploadedById: user.id,
      },
    });
    await this.audit.record(user, 'file.upload', 'file', saved.id, {
      name: originalName,
      size: file.size,
    });
    return {
      url: `/uploads/${saved.storedName}`,
      name: originalName,
      size: file.size,
    };
  }
}
