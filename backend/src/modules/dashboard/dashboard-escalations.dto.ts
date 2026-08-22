import { IsOptional, IsString, MaxLength } from 'class-validator';

export class EscalationActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolutionNote?: string;
}
