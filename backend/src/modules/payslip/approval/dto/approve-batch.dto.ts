import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class ApproveBatchDto {
  @IsInt()
  @Min(1)
  @IsNotEmpty()
  expectedVersion!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  confirmUnresolvedCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
