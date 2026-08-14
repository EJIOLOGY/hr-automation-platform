import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmployeeModule } from '../employee/employee.module';
import { EmployeeService } from '../employee/employee.service';
import { LEAVE_BALANCE_REPOSITORY } from './leave-balance.repository';
import { EMPLOYEE_PHONE_LOOKUP, LeaveService } from './leave.service';
import {
  LEAVE_BALANCE_SPREADSHEET_PATH,
  SpreadsheetLeaveBalanceRepository,
} from './spreadsheet-leave-balance.repository';

@Module({
  imports: [EmployeeModule],
  providers: [
    LeaveService,
    {
      provide: EMPLOYEE_PHONE_LOOKUP,
      useExisting: EmployeeService,
    },
    {
      provide: LEAVE_BALANCE_SPREADSHEET_PATH,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        configService.get<string>('LEAVE_BALANCE_SPREADSHEET_PATH'),
    },
    {
      provide: LEAVE_BALANCE_REPOSITORY,
      useClass: SpreadsheetLeaveBalanceRepository,
    },
  ],
  exports: [LeaveService],
})
export class LeaveModule {}
