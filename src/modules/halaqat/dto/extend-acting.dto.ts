import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class ExtendActingDto {
  @ApiProperty({
    format: 'date',
    example: '2026-05-30',
    description: '>= current acting_starts_at.',
  })
  @IsDateString()
  acting_ends_at!: string;
}
