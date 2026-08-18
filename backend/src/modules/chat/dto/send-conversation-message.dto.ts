import { IsNotEmpty, IsString } from 'class-validator';

export class SendConversationMessageDto {
  @IsString()
  @IsNotEmpty()
  phoneNumber!: string;

  @IsString()
  @IsNotEmpty()
  message!: string;
}
