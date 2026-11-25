import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../generated/prisma/client.js';
import type { FieldError } from './validation.js';

const DEFAULT_MESSAGES: Record<number, string> = {
  400: 'Permintaan tidak valid.',
  401: 'Sesi login tidak valid atau sudah berakhir. Silakan login ulang.',
  403: 'Anda tidak memiliki hak akses untuk tindakan ini.',
  404: 'Data tidak ditemukan.',
  409: 'Data bentrok dengan kondisi saat ini.',
  413: 'Ukuran data atau berkas melebihi batas.',
  422: 'Validasi gagal',
  429: 'Terlalu banyak permintaan. Coba lagi beberapa saat lagi.',
};

/** Kode Prisma untuk database mati / tidak terjangkau / pool koneksi habis */
const DB_UNAVAILABLE_CODES = new Set([
  'P1001',
  'P1002',
  'P1008',
  'P1017',
  'P2024',
]);

const isDatabaseUnavailable = (exception: unknown): boolean => {
  if (exception instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }
  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    return (
      DB_UNAVAILABLE_CODES.has(exception.code) ||
      exception.message.includes("Can't reach database server")
    );
  }
  return false;
};

/**
 * Format error seragam sesuai kontrak & Standar v2.3 bagian 8:
 * { success: false, message, errors?: [{ field, message }] }
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      let message: string | undefined;
      let errors: FieldError[] | undefined;

      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const raw = (body as { message?: unknown }).message;
        message = Array.isArray(raw)
          ? raw.join('; ')
          : (raw as string | undefined);
        const rawErrors = (body as { errors?: unknown }).errors;
        if (Array.isArray(rawErrors)) {
          errors = rawErrors as FieldError[];
        }
      }

      // Pesan bawaan library (bahasa Inggris) diganti pesan standar
      if (
        !message ||
        status === 429 ||
        /^(Unauthorized|Forbidden|ThrottlerException)/.test(message)
      ) {
        message = DEFAULT_MESSAGES[status] ?? exception.message;
      }

      res
        .status(status)
        .json({ success: false, message, ...(errors ? { errors } : {}) });
      return;
    }

    if (isDatabaseUnavailable(exception)) {
      // Satu baris log (tanpa stack) agar mudah dikenali di log server
      this.logger.error(
        `Database tidak dapat dihubungi: ${(exception as Error).message.trim().split('\n').pop()}`,
      );
      res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        success: false,
        message: 'Database tidak dapat dihubungi. Hubungi administrator.',
      });
      return;
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        res.status(HttpStatus.CONFLICT).json({
          success: false,
          message: 'Data dengan nilai unik yang sama sudah ada.',
        });
        return;
      }
      if (exception.code === 'P2025') {
        res
          .status(HttpStatus.NOT_FOUND)
          .json({ success: false, message: DEFAULT_MESSAGES[404] });
        return;
      }
    }

    this.logger.error(exception instanceof Error ? exception.stack : exception);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Terjadi kesalahan pada server.',
    });
  }
}
