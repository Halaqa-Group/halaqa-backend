import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateSchoolScheduleDto {
  @ApiProperty({
    minimum: 0,
    maximum: 6,
    example: 0,
    description: '0=Saturday … 6=Friday.',
  })
  @IsInt()
  @Min(0)
  @Max(6)
  day_of_week!: number;

  @ApiProperty({ format: 'date', example: '2026-09-01' })
  @IsDateString()
  effective_from!: string;

  @ApiProperty({
    required: false,
    nullable: true,
    format: 'date',
    example: '2027-06-30',
    description: 'NULL = open-ended (current period).',
  })
  @IsOptional()
  @IsDateString()
  effective_to?: string;

  @ApiProperty({
    required: false,
    nullable: true,
    maxLength: 255,
    example: 'دوام صباحي',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;
}
