import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { BillingService } from './billing.service.js';
import { OperationalService } from './operational.service.js';
import {
  BillingController,
  OperationalController,
  OrdersController,
} from './orders.controllers.js';
import { OrdersRepository } from './orders.repository.js';
import { OrdersService } from './orders.service.js';

/** Satu fitur = siklus hidup order (Sales -> Operasional -> Finance) */
@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [OrdersController, OperationalController, BillingController],
  providers: [
    OrdersRepository,
    OrdersService,
    OperationalService,
    BillingService,
  ],
})
export class OrdersModule {}
