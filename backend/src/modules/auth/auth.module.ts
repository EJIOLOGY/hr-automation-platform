import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { MailerModule } from '../../core/mailer/mailer.module';
import { AuditModule } from '../audit/audit.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RolesGuard } from './guards/roles.guard';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    MailerModule,
    PassportModule,
    JwtModule.register({}),
    ThrottlerModule.forRoot([
      {
        ttl: 900000,
        limit: 5,
      },
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RolesGuard, ThrottlerGuard],
  exports: [AuthService, JwtStrategy, RolesGuard],
})
export class AuthModule {}

