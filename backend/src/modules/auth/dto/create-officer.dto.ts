import {
  IsEmail,
  IsEnum,
  IsString,
  MinLength,
  MaxLength,
} from 'class-validator';
import { HrOfficerRole } from '../../../generated/prisma/enums';

export class CreateOfficerDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsEnum(HrOfficerRole)
  role!: HrOfficerRole;
}
