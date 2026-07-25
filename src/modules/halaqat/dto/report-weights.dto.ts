import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';
import { WeightsSumTo } from '../../../common/validators/weights-sum.decorator';

/**
 * Per-halaqa track weights for the daily evaluation report (§5 of the spec).
 *
 * The four weights must sum to exactly 100.00. Ethics is independent and is never
 * redistributed; the academic weight is `100 - ethics_weight`. All four are
 * required when the object is sent — there is no partial update, since a subset
 * cannot satisfy the sum constraint. Defaults are 40 / 25 / 30 / 5.
 */
export class ReportWeightsDto {
  @ApiProperty({ example: 40, minimum: 0, maximum: 100 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  @WeightsSumTo(100, [
    'hifz_weight',
    'near_weight',
    'far_weight',
    'ethics_weight',
  ])
  hifz_weight!: number;

  @ApiProperty({ example: 25, minimum: 0, maximum: 100 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  near_weight!: number;

  @ApiProperty({ example: 30, minimum: 0, maximum: 100 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  far_weight!: number;

  @ApiProperty({ example: 5, minimum: 0, maximum: 100 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  ethics_weight!: number;
}

export type ReportWeights = {
  hifz_weight: number;
  near_weight: number;
  far_weight: number;
  ethics_weight: number;
};

export const REPORT_WEIGHTS_DEFAULTS: ReportWeights = {
  hifz_weight: 40,
  near_weight: 25,
  far_weight: 30,
  ethics_weight: 5,
};
