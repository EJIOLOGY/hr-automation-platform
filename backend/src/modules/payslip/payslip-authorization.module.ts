import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { PayslipAuthorizationService } from './payslip-authorization.service';

@Module({
  imports: [PrismaModule, AuditModule],
  providers: [PayslipAuthorizationService],
  exports: [PayslipAuthorizationService],
})
export class PayslipAuthorizationModule {}
