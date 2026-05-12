import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import type { AchievementStatus, TrackType } from '../entities/achievement.entity';

export class ListAchievementsQuery {
  @ApiProperty({ required: false, example: 1, minimum: 1, description: 'Defaults to 1.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiProperty({ required: false, example: 20, minimum: 1, maximum: 100, description: 'Defaults to 20, capped at 100.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiProperty({ required: false, example: 42, description: 'Filter by student.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  student_id?: number;

  @ApiProperty({ required: false, example: 3, description: 'Filter by halaqa.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  halaqa_id?: number;

  @ApiProperty({ required: false, format: 'date', example: '2026-05-11', description: 'Filter by exact date.' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiProperty({ required: false, enum: ['Hifz', 'Near', 'Far'], example: 'Hifz' })
  @IsOptional()
  @IsEnum(['Hifz', 'Near', 'Far'])
  track_type?: TrackType;

  @ApiProperty({ required: false, enum: ['approved', 'unapproved'], example: 'approved' })
  @IsOptional()
  @IsEnum(['approved', 'unapproved'])
  status?: AchievementStatus;

  @ApiProperty({
    required: false,
    example: 7,
    description: 'Filter by recorder user ID. Not available for parent role (400).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  recorded_by?: number;

  @ApiProperty({
    required: false,
    example: 1,
    description: 'Filter by approver user ID. Not available for parent role (400).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  approved_by?: number;
}
