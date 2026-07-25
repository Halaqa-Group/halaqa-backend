import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class DailyReportQuery {
  @ApiProperty({
    format: 'date',
    example: '2026-07-20',
    description: 'Report date (YYYY-MM-DD).',
  })
  @IsDateString()
  date!: string;
}
