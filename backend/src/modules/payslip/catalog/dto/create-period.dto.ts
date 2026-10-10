import { Type } from 'class-transformer';
import { IsDate, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class CreatePeriodDto {
  @IsUUID()
  @IsNotEmpty()
  accountingCompanyId!: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  name!: string;

  @Type(() => Date)
  @IsDate()
  @IsNotEmpty()
  startDate!: Date;

  @Type(() => Date)
  @IsDate()
  @IsNotEmpty()
  endDate!: Date;

  @IsOptional()
  @IsString()
  month?: string;

  @IsOptional()
  @IsInt()
  year?: number;
}
