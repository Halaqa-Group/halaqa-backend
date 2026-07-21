import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import type { WeeklyPlanStatus } from '../entities/weekly-plan.entity';

export class ListWeeklyPlansQuery {
  @ApiProperty({
    required: false,
    example: 1,
    minimum: 1,
    description: 'Defaults to 1.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({
    required: false,
    example: 20,
    minimum: 1,
    maximum: 100,
    description: 'Defaults to 20, capped at 100.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiProperty({
    required: false,
    example: 42,
    description: 'Filter by student.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  student_id?: number;

  @ApiProperty({
    required: false,
    example: 3,
    description: 'Filter by halaqa.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  halaqa_id?: number;

  @ApiProperty({
    required: false,
    format: 'date',
    example: '2026-05-09',
    description: 'Filter by week start date.',
  })
  @IsOptional()
  @IsDateString()
  week_start_date?: string;

  @ApiProperty({
    required: false,
    enum: ['draft', 'approved'],
    example: 'draft',
  })
  @IsOptional()
  @IsEnum(['draft', 'approved'])
  status?: WeeklyPlanStatus;
}
