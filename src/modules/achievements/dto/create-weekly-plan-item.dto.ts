import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { TrackType } from '../entities/achievement.entity';

export class CreateWeeklyPlanItemDto {
  @ApiProperty({ enum: ['Hifz', 'Near', 'Far'], example: 'Hifz' })
  @IsEnum(['Hifz', 'Near', 'Far'])
  track_type!: TrackType;

  @ApiProperty({ example: 2, minimum: 0, maximum: 6, description: '0=Saturday … 6=Friday.' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  day_of_week!: number;

  @ApiProperty({
    required: false,
    example: 0,
    minimum: 0,
    default: 0,
    description: 'Reconciliation priority within the same day + track (lower = first). Defaults to 0.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  order?: number;

  @ApiProperty({ example: 1, minimum: 1, maximum: 114 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(114)
  start_surah!: number;

  @ApiProperty({ example: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  start_verse!: number;

  @ApiProperty({ example: 1, minimum: 1, maximum: 114, description: 'Must be >= start_surah.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(114)
  end_surah!: number;

  @ApiProperty({ example: 7, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  end_verse!: number;
}
