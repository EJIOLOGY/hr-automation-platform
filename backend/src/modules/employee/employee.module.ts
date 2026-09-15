import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { EmployeeController } from './employee.controller';
import { EmployeeImportService } from './employee-import.service';
import { EmployeeService } from './employee.service';
import { EmployeeImportReportService } from './employee-import-report.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [EmployeeController],
  providers: [
    EmployeeService,
    EmployeeImportService,
    EmployeeImportReportService,
  ],
  exports: [EmployeeService, EmployeeImportService],
})
export class EmployeeModule {}
