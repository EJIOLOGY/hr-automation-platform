import { IsNotEmpty, IsUUID } from 'class-validator';

export class ReassignClaimDto {
  @IsUUID()
  @IsNotEmpty()
  officerId!: string;
}
