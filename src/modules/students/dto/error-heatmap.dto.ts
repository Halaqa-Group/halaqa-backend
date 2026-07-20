import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Query params for the error-heatmap endpoint. */
export class ErrorHeatmapQuery {
  @ApiProperty({
    required: false,
    default: 56,
    minimum: 1,
    maximum: 365,
    description:
      'How many days back to aggregate errors over. Defaults to 56 (8 weeks).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;

  @ApiProperty({
    required: false,
    default: 20,
    minimum: 1,
    maximum: 100,
    description:
      'Max number of hotspots (worst ayat) to return. Defaults to 20.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/** One aggregated hotspot: a single ayah with the student's error tally there. */
export class HeatmapHotspotDto {
  @ApiProperty({ example: 2 })
  surah!: number;

  @ApiProperty({ example: 5 })
  ayah!: number;

  @ApiProperty({ example: 3 })
  mistakes_count!: number;

  @ApiProperty({ example: 1 })
  warnings_count!: number;

  @ApiProperty({ example: 0 })
  tajweed_errors_count!: number;

  @ApiProperty({ example: 2 })
  harakat_errors_count!: number;

  @ApiProperty({
    example: 6,
    description: 'Total errors at this ayah in the window.',
  })
  total!: number;
}

export class ErrorHeatmapResponse {
  @ApiProperty({ example: 42 })
  student_id!: number;

  @ApiProperty({
    example: 56,
    description: 'The window (in days) that was aggregated.',
  })
  days!: number;

  @ApiProperty({
    example: 37,
    description: 'Total error occurrences across all ayat in the window.',
  })
  total_errors!: number;

  @ApiProperty({
    type: [HeatmapHotspotDto],
    description: 'Worst ayat, most errors first (ties broken by mushaf order).',
  })
  hotspots!: HeatmapHotspotDto[];
}

export class ErrorHeatmapEnvelope {
  @ApiProperty({ example: 200 })
  code!: number;

  @ApiProperty({ type: ErrorHeatmapResponse })
  data!: ErrorHeatmapResponse;
}
