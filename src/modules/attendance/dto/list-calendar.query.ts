import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class ListSchedulesQuery {
  @ApiProperty({
    required: false,
    format: 'date',
    example: '2026-09-15',
    description: 'If given, return only schedule rows effective on this date.',
  })
  @IsOptional()
  @IsDateString()
  on?: string;
}

export class ListHolidaysQuery {
  @ApiProperty({
    required: false,
    format: 'date',
    example: '2026-09-01',
    description: 'Range start (inclusive).',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiProperty({
    required: false,
    format: 'date',
    example: '2027-06-30',
    description: 'Range end (inclusive).',
  })
  @IsOptional()
  @IsDateString()
  to?: string;
}
