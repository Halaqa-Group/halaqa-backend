/**
 * Restricted PATCH body for teachers on PATCH /students/:id.
 * Only capacity fields, memorization direction and notes are writable by a teacher
 * who is primary on one of the student's halaqat.
 * Bio fields (name, gender, dob, join_date, status, photo_url) are rejected with 400 for teacher callers.
 */
import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { CAPACITY_LIMITS } from '../capacity.config';
import type { MemorizationDirection } from '../entities/student.entity';

export class UpdateStudentByTeacherDto {
  @ApiProperty({
    required: false,
    example: 1.0,
    minimum: CAPACITY_LIMITS.hifz.min,
    maximum: CAPACITY_LIMITS.hifz.max,
    description: 'Daily Hifz memorisation target (0–20 pages).',
  })
  @IsOptional()
  @IsNumber()
  @Min(CAPACITY_LIMITS.hifz.min)
  @Max(CAPACITY_LIMITS.hifz.max)
  daily_hifz_pages_capacity?: number;

  @ApiProperty({
    required: false,
    example: 2.0,
    minimum: CAPACITY_LIMITS.near.min,
    maximum: CAPACITY_LIMITS.near.max,
    description: 'Daily near-review target (0–50 pages).',
  })
  @IsOptional()
  @IsNumber()
  @Min(CAPACITY_LIMITS.near.min)
  @Max(CAPACITY_LIMITS.near.max)
  daily_near_pages_capacity?: number;

  @ApiProperty({
    required: false,
    example: 5.0,
    minimum: CAPACITY_LIMITS.far.min,
    maximum: CAPACITY_LIMITS.far.max,
    description: 'Daily far-review target (0–100 pages).',
  })
  @IsOptional()
  @IsNumber()
  @Min(CAPACITY_LIMITS.far.min)
  @Max(CAPACITY_LIMITS.far.max)
  daily_far_pages_capacity?: number;

  @ApiProperty({
    required: false,
    enum: ['ascending', 'descending'],
    example: 'descending',
    description:
      'اتجاه الحفظ — `descending` (تنازلي) starts at An-Nas and works backwards, ' +
      '`ascending` (تصاعدي) starts at Al-Fatihah.',
  })
  @IsOptional()
  @IsEnum(['ascending', 'descending'])
  memorization_direction?: MemorizationDirection;

  @ApiProperty({ required: false, example: 'Progressing well in Juz 29.' })
  @IsOptional()
  @IsString()
  notes?: string;
}
