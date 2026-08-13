import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { ConversationModule } from './modules/chat/chat.module';
import { EmployeeModule } from './modules/employee/employee.module';
import { LeaveModule } from './modules/leave/leave.module';
import { PolicyModule } from './modules/policy/policy.module';
import { BenefitsModule } from './modules/benefits/benefits.module';
import { VerificationModule } from './modules/verification/verification.module';
import { EscalationModule } from './modules/escalation/escalation.module';
import { AuditModule } from './modules/audit/audit.module';
import { PrismaModule } from './core/prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    WhatsappModule,
    ConversationModule,
    EmployeeModule,
    LeaveModule,
    PolicyModule,
    BenefitsModule,
    VerificationModule,
    EscalationModule,
    AuditModule,
    PrismaModule,
    HealthModule,
    ConfigModule.forRoot({ isGlobal: true }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
