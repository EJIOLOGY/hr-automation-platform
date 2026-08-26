import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { EscalationStatus } from '../../generated/prisma/enums';

export const HR_DOCUMENT_REQUEST_TYPES = [
  'employment_verification_letter',
  'salary_certificate',
  'no_objection_certificate',
  'other_hr_document',
] as const;

export class HrRequestListQueryDto {
  @IsOptional()
  @IsEnum(EscalationStatus)
  status?: EscalationStatus;

  @IsOptional()
  @IsIn(HR_DOCUMENT_REQUEST_TYPES)
  documentType?: (typeof HR_DOCUMENT_REQUEST_TYPES)[number];

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
