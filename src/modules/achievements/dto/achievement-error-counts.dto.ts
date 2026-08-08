import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Aggregate error counts for an `untracked` recitation — the teacher knows how
 * many errors were made but did not document where. Accepted only when
 * `recitation_method = 'untracked'`; for `full` and `test` the counts are derived
 * from the itemized error rows and a client-set value would contradict them.
 *
 * Omitted types count as zero. The frontend still computes `percentage_score`
 * from these counts and the halaqa's `evaluation_settings`, exactly as it does
 * for a documented recitation.
 */
export class AchievementErrorCountsDto {
  @ApiProperty({ required: false, example: 3, minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  mistakes?: number;

  @ApiProperty({ required: false, example: 1, minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  warnings?: number;

  @ApiProperty({ required: false, example: 0, minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  tajweed?: number;

  @ApiProperty({ required: false, example: 2, minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  harakat?: number;
}
