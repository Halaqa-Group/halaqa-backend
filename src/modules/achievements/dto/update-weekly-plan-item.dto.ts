import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { TrackType } from '../entities/achievement.entity';

export class UpdateWeeklyPlanItemDto {
  @ApiProperty({ required: false, enum: ['Hifz', 'Near', 'Far'], example: 'Hifz' })
  @IsOptional()
  @IsEnum(['Hifz', 'Near', 'Far'])
  track_type?: TrackType;

  @ApiProperty({ required: false, example: 2, minimum: 0, maximum: 6, description: '0=Saturday … 6=Friday.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  day_of_week?: number;

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
}
