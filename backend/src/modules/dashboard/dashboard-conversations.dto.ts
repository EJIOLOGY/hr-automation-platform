import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SendHrMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content!: string;
}
