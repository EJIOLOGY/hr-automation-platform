// billing-rate.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../core/prisma/prisma.module';
import { AuditModule } from '../../audit/audit.module';
import { BillingRateController } from './billing-rate.controller';
import { BillingRateService } from './billing-rate.service';
import { BillingRateValidator } from './billing-rate.validator';
import { PayslipAuthorizationModule } from '../payslip-authorization.module';

@Module({
  imports: [PrismaModule, AuditModule, PayslipAuthorizationModule],
  controllers: [BillingRateController],
  providers: [BillingRateService, BillingRateValidator],
  exports: [BillingRateService],
})
export class BillingRateModule {}
