import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export type ReviewDecisionType = 'REVIEWED' | 'HOLD' | 'REJECT' | 'RESET';

export class ReviewDecisionItemDto {
  @IsUUID()
  @IsNotEmpty()
  payslipId!: string;

  @IsIn(['REVIEWED', 'HOLD', 'REJECT', 'RESET'])
  @IsNotEmpty()
  decision!: ReviewDecisionType;

  @IsOptional()
  @IsString()
  note?: string;
}

export class ReviewDecisionsDto {
  @IsInt()
  @Min(1)
  @IsNotEmpty()
  expectedVersion!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(700)
  @ValidateNested({ each: true })
  @Type(() => ReviewDecisionItemDto)
  decisions!: ReviewDecisionItemDto[];
}
