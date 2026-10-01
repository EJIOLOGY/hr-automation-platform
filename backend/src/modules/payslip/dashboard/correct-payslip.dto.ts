import { IsNumber, IsOptional, IsObject } from 'class-validator';

export class CorrectPayslipDto {
  @IsOptional() @IsNumber() baseFee?: number;
  @IsOptional() @IsNumber() daysWorked?: number;
  @IsOptional() @IsNumber() totalDays?: number;
  @IsOptional() @IsObject() allowances?: Record<string, number>;
}
