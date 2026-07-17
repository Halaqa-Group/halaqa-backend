import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, Max, Min } from 'class-validator';
import type { ErrorType } from '../entities/achievement-position-error.entity';

/**
 * A single error occurrence at a QUL word span. `surah/ayah/juz/hizb` are
 * supplied by the client from QUL at capture time (the backend has no QUL
 * dataset to resolve them). `school_id/student_id/date` are NOT sent — the
 * backend denormalizes them from the owning achievement.
 */
export class PositionErrorDto {
  @ApiProperty({
    enum: ['mistake', 'warning', 'tajweed', 'harakat'],
    example: 'mistake',
  })
  @IsEnum(['mistake', 'warning', 'tajweed', 'harakat'])
  error_type!: ErrorType;

  @ApiProperty({
    example: 152,
    minimum: 1,
    description: 'QUL word id (sequential in mushaf order).',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  start_word_id!: number;

  @ApiProperty({
    example: 154,
    minimum: 1,
    description: 'Must be >= start_word_id.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  end_word_id!: number;

  @ApiProperty({ example: 2, minimum: 1, maximum: 114 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(114)
  surah!: number;

  @ApiProperty({ example: 5, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  ayah!: number;

  @ApiProperty({ example: 1, minimum: 1, maximum: 30 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  juz!: number;

  @ApiProperty({ example: 1, minimum: 1, maximum: 60 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  hizb!: number;
}
