import { IsNotEmpty, IsString, Length } from 'class-validator';

export class RejectBatchDto {
  @IsString()
  @IsNotEmpty()
  @Length(5, 500)
  reason!: string;
}
