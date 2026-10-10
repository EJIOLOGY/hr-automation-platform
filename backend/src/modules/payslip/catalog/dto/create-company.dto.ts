import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(2, 100)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z0-9_-]{2,20}$/, {
    message: 'code must be 2-20 uppercase alphanumeric characters, underscores, or dashes',
  })
  code!: string;
}
