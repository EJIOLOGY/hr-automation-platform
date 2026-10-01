import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../core/prisma/prisma.module';
import { AuditModule } from '../../audit/audit.module';
import { BillingRateController } from './billing-rate.controller';
import { BillingRateService } from './billing-rate.service';
import { BillingRateValidator } from './billing-rate.validator';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [BillingRateController],
  providers: [BillingRateService, BillingRateValidator],
  exports: [BillingRateService],
})
export class BillingRateModule {}
