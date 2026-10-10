import { IsNotEmpty, IsUUID } from 'class-validator';

export class ApplyWorkbookDto {
  @IsUUID()
  @IsNotEmpty()
  previewId!: string;
}
