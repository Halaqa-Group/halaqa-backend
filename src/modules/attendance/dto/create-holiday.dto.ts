import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateHolidayDto {
  @ApiProperty({ format: 'date', example: '2026-12-25' })
  @IsDateString()
  holiday_date!: string;

  @ApiProperty({ maxLength: 200, example: 'عطلة رسمية' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  description!: string;
}
