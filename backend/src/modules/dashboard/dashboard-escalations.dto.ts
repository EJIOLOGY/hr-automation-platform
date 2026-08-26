import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { EscalationStatus } from '../../generated/prisma/enums';

export class EscalationListQueryDto {
  @IsOptional()
  @IsEnum(EscalationStatus)
  status?: EscalationStatus;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  documentType?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class EscalationActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolutionNote?: string;
}
