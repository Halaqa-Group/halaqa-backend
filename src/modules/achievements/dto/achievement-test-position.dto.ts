import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { PositionErrorDto } from './position-error.dto';

/**
 * A single verse-range position within an achievement's range, with the errors
 * made at that position. Used when `recitation_method = 'test'` to record the
 * positions the student was tested on. The position's error counts are derived
 * from `errors` — they are not sent.
 */
export class AchievementTestPositionDto {
  @ApiProperty({ example: 2, minimum: 1, maximum: 114 })
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
    example: 2,
    minimum: 1,
    maximum: 114,
    description: 'Must be >= start_surah.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(114)
  end_surah!: number;

  @ApiProperty({ example: 5, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  end_verse!: number;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 1,
    minimum: 0,
    description:
      'Pages covered by this tested position (صفحات الموضع), computed on the ' +
      'frontend from the mushaf. Stored as-is; the achievement `positions_pages` is their sum.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  pages?: number | null;

  @ApiProperty({
    required: false,
    type: [PositionErrorDto],
    description:
      'Errors made at this position. Each must fall within the position range. ' +
      'Omit or send [] for a clean position. The per-type counts are derived from this list.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PositionErrorDto)
  errors?: PositionErrorDto[];
}
