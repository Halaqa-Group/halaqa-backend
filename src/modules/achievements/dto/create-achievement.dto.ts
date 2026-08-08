import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
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
  ValidateNested,
} from 'class-validator';
import type {
  CompletionMethod,
  RecitationMethod,
  TrackType,
} from '../entities/achievement.entity';
import { AchievementErrorCountsDto } from './achievement-error-counts.dto';
import { AchievementTestPositionDto } from './achievement-test-position.dto';
import { PositionErrorDto } from './position-error.dto';

export class CreateAchievementDto {
  @ApiProperty({
    example: 42,
    description: "Student ID. Must belong to the caller's school.",
  })
  @Type(() => Number)
  @IsInt()
  student_id!: number;

  @ApiProperty({
    example: 3,
    description: 'Halaqa ID. Caller must have scope on this halaqa.',
  })
  @Type(() => Number)
  @IsInt()
  halaqa_id!: number;

  @ApiProperty({ format: 'date', example: '2026-05-11' })
  @IsDateString()
  date!: string;

  @ApiProperty({ enum: ['Hifz', 'Near', 'Far'], example: 'Hifz' })
  @IsEnum(['Hifz', 'Near', 'Far'])
  track_type!: TrackType;

  @ApiProperty({
    required: false,
    enum: ['quick', 'mushaf'],
    default: 'quick',
    description: 'How the achievement was entered. Defaults to `quick`.',
  })
  @IsOptional()
  @IsEnum(['quick', 'mushaf'])
  completion_method?: CompletionMethod;

  @ApiProperty({
    required: false,
    enum: ['full', 'test', 'untracked'],
    default: 'full',
    description:
      'How it was recited. `full` auto-creates one position spanning the whole range. ' +
      '`test` requires `test_positions` (each within the achievement range). ' +
      '`untracked` records no positions at all — for a quick review evaluation where the ' +
      'teacher has no time to document where; send aggregate `error_counts` instead of ' +
      'itemized errors. Review tracks only: Hifz must be `full`. Defaults to `full`.',
  })
  @IsOptional()
  @IsEnum(['full', 'test', 'untracked'])
  recitation_method?: RecitationMethod;

  @ApiProperty({
    required: false,
    type: [AchievementTestPositionDto],
    description:
      'Required (>=1) when `recitation_method = test`. Rejected for `full`. Each position must fall ' +
      'within the achievement range and carries its own error counts; the achievement-level counts ' +
      'are their sum.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AchievementTestPositionDto)
  test_positions?: AchievementTestPositionDto[];

  @ApiProperty({
    example: 1,
    minimum: 1,
    maximum: 114,
    description: 'Starting surah (1–114).',
  })
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

  @ApiProperty({
    example: 1,
    minimum: 1,
    maximum: 114,
    description: 'Ending surah. Must be >= start_surah.',
  })
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

  @ApiProperty({
    required: false,
    type: [PositionErrorDto],
    description:
      'Errors for `recitation_method = full` only — they attach to the single auto-created position. ' +
      'Rejected for `test` (send errors inside each `test_positions` entry). ' +
      'Each error must fall within the achievement range. The per-type counts are derived from this list.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PositionErrorDto)
  errors?: PositionErrorDto[];

  @ApiProperty({
    required: false,
    type: AchievementErrorCountsDto,
    description:
      'Aggregate error counts for `recitation_method = untracked` only — how many errors, ' +
      'without where. Rejected for `full` and `test`, whose counts are derived from the ' +
      'itemized errors. Omitted types count as zero.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AchievementErrorCountsDto)
  error_counts?: AchievementErrorCountsDto;

  @ApiProperty({
    example: 92.5,
    minimum: 0,
    maximum: 100,
    description:
      'Computed on the frontend from raw counts and the halaqa evaluation settings. Stored as-is.',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  percentage_score!: number;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 1.5,
    minimum: 0,
    description:
      'Total pages of the whole range (الصفحات الكلية), computed on the frontend ' +
      'from the mushaf and stored as-is. **Optional**: when omitted the backend derives ' +
      'it from the verse range (same page math as the frontend), so it is never left ' +
      'empty — it is the volume metric the dashboards sum. For a `full` recitation it ' +
      "also becomes the single position's pages; for `test`, send per-position pages " +
      'inside `test_positions`.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  total_pages?: number | null;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'Strong on the last 3 verses.',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  teacher_notes?: string | null;

  @ApiProperty({
    required: false,
    default: false,
    description:
      'Approve in the same request. Caller must have halaqa scope. ' +
      'Lacks scope → 403 (never silently downgraded to unapproved).',
  })
  @IsOptional()
  @IsBoolean()
  approve?: boolean;
}
