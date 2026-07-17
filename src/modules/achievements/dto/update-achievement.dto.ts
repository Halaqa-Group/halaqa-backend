import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type { CompletionMethod, RecitationMethod, TrackType } from '../entities/achievement.entity';
import { AchievementTestPositionDto } from './achievement-test-position.dto';
import { PositionErrorDto } from './position-error.dto';

export class UpdateAchievementDto {
  @ApiProperty({ required: false, enum: ['Hifz', 'Near', 'Far'], example: 'Hifz' })
  @IsOptional()
  @IsEnum(['Hifz', 'Near', 'Far'])
  track_type?: TrackType;

  @ApiProperty({ required: false, enum: ['quick', 'mushaf'] })
  @IsOptional()
  @IsEnum(['quick', 'mushaf'])
  completion_method?: CompletionMethod;

  @ApiProperty({
    required: false,
    enum: ['full', 'test'],
    description:
      'Changing to `full` replaces positions with one full-range row. Changing to `test` requires `test_positions`.',
  })
  @IsOptional()
  @IsEnum(['full', 'test'])
  recitation_method?: RecitationMethod;

  @ApiProperty({
    required: false,
    type: [AchievementTestPositionDto],
    description: 'Replaces the achievement\'s positions. Required when setting `recitation_method = test`.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AchievementTestPositionDto)
  test_positions?: AchievementTestPositionDto[];

  @ApiProperty({ required: false, example: 1, minimum: 1, maximum: 114 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(114)
  start_surah?: number;

  @ApiProperty({ required: false, example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  start_verse?: number;

  @ApiProperty({ required: false, example: 1, minimum: 1, maximum: 114 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(114)
  end_surah?: number;

  @ApiProperty({ required: false, example: 7, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  end_verse?: number;

  @ApiProperty({
    required: false,
    type: [PositionErrorDto],
    description:
      'Errors for `recitation_method = full` only — replaces the single position\'s errors and the ' +
      'derived totals. Rejected for `test` (resend `test_positions` with their errors instead).',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PositionErrorDto)
  errors?: PositionErrorDto[];

  @ApiProperty({ required: false, example: 92.5, minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  percentage_score?: number;

  @ApiProperty({ required: false, nullable: true, example: null, maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  teacher_notes?: string | null;
}
