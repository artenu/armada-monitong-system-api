import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import {
  ContractRatesController,
  MasterController,
  PnbpRatesController,
} from './master.controllers.js';
import { MasterService } from './master.service.js';

@Module({
  imports: [PrismaModule, AuditModule],
  // Path statis lebih dulu, baru `master/:resource`
  controllers: [ContractRatesController, PnbpRatesController, MasterController],
  providers: [MasterService],
})
export class MasterModule {}
