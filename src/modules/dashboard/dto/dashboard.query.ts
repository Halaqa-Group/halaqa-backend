import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import type { TrackType } from '../../achievements/entities/achievement.entity';
import type { Period } from '../services/period.util';

/** Shared reporting-window query for every dashboard endpoint. */
export class DashboardQuery {
  @ApiProperty({
    required: false,
    enum: ['week', 'month'],
    example: 'week',
    description:
      'Reporting window. Defaults to the current school week (starts Saturday). ' +
      'Ignored when both `from` and `to` are supplied.',
  })
  @IsOptional()
  @IsEnum(['week', 'month'])
  period?: Period;

  @ApiProperty({
    required: false,
    format: 'date',
    example: '2026-07-01',
    description: 'Explicit range start (inclusive). Requires `to`.',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiProperty({
    required: false,
    format: 'date',
    example: '2026-07-25',
    description: 'Explicit range end (inclusive). Requires `from`.',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiProperty({
    required: false,
    example: true,
    description:
      'When true, `overview` also returns the same KPIs for the immediately-preceding window (for ▲/▼ trend deltas).',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  compare?: boolean;

  @ApiProperty({
    required: false,
    example: 12,
    description:
      'Narrow every figure to a single halaqa. Intersected with the caller’s ' +
      'scope: an id outside their access yields empty/zero results, never a leak. ' +
      'Omit for the caller’s full scope.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  halaqa_id?: number;
}

export class AlertsQuery extends DashboardQuery {
  @ApiProperty({
    required: false,
    example: 7,
    minimum: 1,
    maximum: 90,
    description:
      'A student with no approved achievement in this many days is "stalled". Defaults to 7.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  stalled_days?: number;

  @ApiProperty({
    required: false,
    example: 2,
    minimum: 1,
    maximum: 90,
    description:
      'A teacher with at least this many absent days in the period is flagged. Defaults to 2.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  absence_threshold?: number;
}

export class TopStudentsQuery extends DashboardQuery {
  @ApiProperty({
    required: false,
    enum: ['Hifz', 'Near', 'Far'],
    example: 'Hifz',
    description:
      'Which track to rank by. Defaults to `Hifz` (الحفظ الجديد). ' +
      '`Near`/`Far` rank by review volume.',
  })
  @IsOptional()
  @IsEnum(['Hifz', 'Near', 'Far'])
  track?: TrackType;

  @ApiProperty({
    required: false,
    example: 10,
    minimum: 1,
    maximum: 50,
    description: 'How many students to return. Defaults to 10, capped at 50.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
