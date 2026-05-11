import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import type { EndReason } from '../entities/halaqa-teacher.entity';

export class EndAssignmentDto {
  @ApiProperty({ format: 'date', example: '2026-05-15', description: '>= start_date and <= today + 30 days.' })
  @IsDateString()
  end_date!: string;

  @ApiProperty({ enum: ['reassigned', 'left_school', 'vacation', 'retired', 'other'], example: 'vacation' })
  @IsEnum(['reassigned', 'left_school', 'vacation', 'retired', 'other'])
  end_reason!: EndReason;

  @ApiProperty({ required: false, example: 'On Hajj leave', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;
}
