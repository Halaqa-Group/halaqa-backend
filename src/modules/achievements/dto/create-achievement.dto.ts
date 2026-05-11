import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
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

export class CreateAchievementDto {
  @ApiProperty({ example: 42, description: "Student ID. Must belong to the caller's school." })
  @Type(() => Number)
  @IsInt()
  student_id!: number;

  @ApiProperty({ example: 3, description: 'Halaqa ID. Caller must have scope on this halaqa.' })
  @Type(() => Number)
  @IsInt()
  halaqa_id!: number;

  @ApiProperty({ format: 'date', example: '2026-05-11' })
  @IsDateString()
  date!: string;

  @ApiProperty({ enum: ['Hifz', 'Near', 'Far'], example: 'Hifz' })
  @IsEnum(['Hifz', 'Near', 'Far'])
  track_type!: TrackType;

  @ApiProperty({ example: 1, minimum: 1, maximum: 114, description: 'Starting surah (1–114).' })
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

  @ApiProperty({ example: 1, minimum: 1, maximum: 114, description: 'Ending surah. Must be >= start_surah.' })
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

  @ApiProperty({ required: false, example: 2, minimum: 0, description: 'Defaults to 0.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  mistakes_count?: number;

  @ApiProperty({ required: false, example: 1, minimum: 0, description: 'Defaults to 0.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  warnings_count?: number;

  @ApiProperty({ required: false, example: 0, minimum: 0, description: 'Defaults to 0.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  tajweed_errors_count?: number;

  @ApiProperty({ required: false, nullable: true, example: 'Strong on the last 3 verses.', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  teacher_notes?: string | null;

  @ApiProperty({
    required: false,
    default: false,
    description:
      'Approve in the same request. Caller must have approval authority. ' +
      'Lacks authority → 403 (never silently downgraded to unapproved).',
  })
  @IsOptional()
  @IsBoolean()
  approve?: boolean;
}
