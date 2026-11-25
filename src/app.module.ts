import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { validateEnv } from './config/env.validation.js';
import { FilesModule } from './files/files.module.js';
import { HealthController } from './health/health.controller.js';
import { MasterModule } from './master/master.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      cache: true,
    }),
    // Dipakai hanya pada endpoint sensitif (login, refresh) lewat @UseGuards(ThrottlerGuard)
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    OrdersModule,
    MasterModule,
    FilesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
