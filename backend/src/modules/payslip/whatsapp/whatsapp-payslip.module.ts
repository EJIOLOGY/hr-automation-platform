import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../core/prisma/prisma.module';
import { WhatsAppPayslipService } from './whatsapp-payslip.service';

@Module({
  imports: [PrismaModule],
  providers: [WhatsAppPayslipService],
  exports: [WhatsAppPayslipService],
})
export class WhatsAppPayslipModule {}
