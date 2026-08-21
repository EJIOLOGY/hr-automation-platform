import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './core/prisma/prisma.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { BenefitsModule } from './modules/benefits/benefits.module';
import { ConversationModule } from './modules/chat/chat.module';
import { EmployeeModule } from './modules/employee/employee.module';
import { EscalationModule } from './modules/escalation/escalation.module';
import { HealthModule } from './modules/health/health.module';
import { LeaveModule } from './modules/leave/leave.module';
import { PolicyModule } from './modules/policy/policy.module';
import { VerificationModule } from './modules/verification/verification.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    WhatsappModule,
    ConversationModule,
    EmployeeModule,
    LeaveModule,
    PolicyModule,
    BenefitsModule,
    VerificationModule,
    EscalationModule,
    AuditModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
