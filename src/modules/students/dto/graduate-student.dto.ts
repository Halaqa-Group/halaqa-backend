import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class GraduateStudentDto {
  @ApiPropertyOptional({
    example: '2025-06-30',
    format: 'date',
    description: 'Defaults to today when omitted.',
  })
  @IsOptional()
  @IsDateString()
  graduation_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
