import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';

/**
 * Per-halaqa weights for the Hifz evaluation. Each weight is the score deducted
 * per single error of that type. The frontend computes `percentage_score` from
 * the raw counts and these weights; the backend stores the result as-is.
 */
export class EvaluationSettingsDto {
  @ApiProperty({
    required: false,
    example: 4,
    minimum: 0,
    maximum: 100,
    description: 'Deduction per mistake. Default 4.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  mistake_weight?: number;

  @ApiProperty({
    required: false,
    example: 2,
    minimum: 0,
    maximum: 100,
    description: 'Deduction per warning. Default 2.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  warning_weight?: number;

  @ApiProperty({
    required: false,
    example: 1,
    minimum: 0,
    maximum: 100,
    description: 'Deduction per tajweed error. Default 1.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  tajweed_weight?: number;

  @ApiProperty({
    required: false,
    example: 2,
    minimum: 0,
    maximum: 100,
    description: 'Deduction per harakat error. Default 2.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  harakat_weight?: number;
}

export type EvaluationSettings = Required<EvaluationSettingsDto>;

export const EVALUATION_SETTINGS_DEFAULTS: EvaluationSettings = {
  mistake_weight: 4,
  warning_weight: 2,
  tajweed_weight: 1,
  harakat_weight: 2,
};

/**
 * Merges stored settings over the defaults so every read returns all four
 * weights, whether the halaqa was configured or not.
 */
export function resolveEvaluationSettings(
  stored: Partial<EvaluationSettings> | null | undefined,
): EvaluationSettings {
  const resolved = { ...EVALUATION_SETTINGS_DEFAULTS };
  if (!stored) return resolved;
  for (const key of Object.keys(
    EVALUATION_SETTINGS_DEFAULTS,
  ) as (keyof EvaluationSettings)[]) {
    const value = stored[key];
    if (typeof value === 'number' && Number.isFinite(value))
      resolved[key] = value;
  }
  return resolved;
}
