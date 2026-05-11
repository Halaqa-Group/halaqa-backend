import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { TrackType } from '../entities/achievement.entity';

export class UpdateAchievementDto {
  @ApiProperty({ required: false, enum: ['Hifz', 'Near', 'Far'], example: 'Hifz' })
  @IsOptional()
  @IsEnum(['Hifz', 'Near', 'Far'])
  track_type?: TrackType;

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

  @ApiProperty({ required: false, example: 2, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  mistakes_count?: number;

  @ApiProperty({ required: false, example: 1, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  warnings_count?: number;

  @ApiProperty({ required: false, example: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  tajweed_errors_count?: number;

  @ApiProperty({ required: false, nullable: true, example: null, maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  teacher_notes?: string | null;
}
