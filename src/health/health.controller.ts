import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/auth.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Cek kesehatan untuk monitoring/healthcheck container (Standar v2.3 bagian 13.1) */
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('Database tidak dapat dihubungi.');
    }
    return { status: 'ok', database: 'ok', time: new Date().toISOString() };
  }
}
