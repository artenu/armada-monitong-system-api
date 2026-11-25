import { Module, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { extname, resolve } from 'node:path';
import { diskStorage } from 'multer';
import { AuditModule } from '../audit/audit.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { FilesController } from './files.controller.js';
import { FilesService } from './files.service.js';

/** Jenis berkas yang boleh diunggah (dokumen operasional, invoice, NPWP, foto) */
export const ALLOWED_UPLOADS: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
  '.webp': ['image/webp'],
  '.doc': ['application/msword'],
  '.docx': [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  '.xls': ['application/vnd.ms-excel'],
  '.xlsx': [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
};

export const uploadDir = (config: ConfigService) =>
  resolve(process.cwd(), config.getOrThrow<string>('UPLOAD_DIR'));

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const dir = uploadDir(config);
        mkdirSync(dir, { recursive: true });
        return {
          storage: diskStorage({
            destination: dir,
            // Nama acak (UUID) agar URL tidak bisa ditebak; nama asli disimpan di database
            filename: (_req, file, cb) =>
              cb(
                null,
                `${randomUUID()}${extname(file.originalname).toLowerCase()}`,
              ),
          }),
          limits: {
            fileSize: config.getOrThrow<number>('MAX_UPLOAD_MB') * 1024 * 1024,
            files: 1,
          },
          fileFilter: (_req, file, cb) => {
            const ext = extname(file.originalname).toLowerCase();
            const mimes = ALLOWED_UPLOADS[ext];
            if (mimes?.includes(file.mimetype)) {
              cb(null, true);
              return;
            }
            cb(
              new UnprocessableEntityException({
                message: 'Jenis berkas tidak diizinkan',
                errors: [
                  {
                    field: 'file',
                    message: `Hanya ${Object.keys(ALLOWED_UPLOADS).join(', ')} yang diizinkan`,
                  },
                ],
              }),
              false,
            );
          },
        };
      },
    }),
  ],
  controllers: [FilesController],
  providers: [FilesService],
})
export class FilesModule {}
