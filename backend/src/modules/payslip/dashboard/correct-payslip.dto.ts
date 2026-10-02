import { IsNumber, IsOptional, IsObject } from 'class-validator';

export class CorrectPayslipDto {
  @IsOptional() @IsNumber() baseFee?: number;
  @IsOptional() @IsNumber() daysWorked?: number;
  @IsOptional() @IsNumber() daysAbsent?: number;
  @IsOptional() @IsNumber() totalDays?: number;
  @IsOptional() @IsNumber() otherDeduction?: number;
  @IsOptional() @IsObject() allowances?: Record<string, number>;
}
