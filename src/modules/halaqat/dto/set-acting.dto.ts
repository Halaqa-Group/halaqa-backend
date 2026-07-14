import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsAfterField } from '../../../common/validators/is-after-field.decorator';

export class SetActingDto {
  @ApiProperty({
    format: 'date',
    example: '2026-05-10',
    description:
      '>= today. If today, acting_as_primary is set immediately; if future, a cron flips it.',
  })
  @IsDateString()
  acting_starts_at!: string;

  @ApiProperty({
    format: 'date',
    example: '2026-05-20',
    description: '>= acting_starts_at.',
  })
  @IsDateString()
  @IsAfterField('acting_starts_at', {
    message: 'acting_ends_at must be after acting_starts_at',
  })
  acting_ends_at!: string;

  @ApiProperty({
    required: false,
    example: "Covering for sister halaqa during main's absence",
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;
}
