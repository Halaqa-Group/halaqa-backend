/**
 * Body for POST /students/:id/graduate (principal / vice_principal).
 * Both fields are passed to the audit log newValues only — they have no effect on the student record
 * beyond status=graduated. Graduating an already-graduated student returns 400.
 */
import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class GraduateStudentDto {
  @ApiProperty({
    required: false,
    format: 'date',
    example: '2025-06-30',
    description:
      'Recorded in the audit log; does not update the student record directly.',
  })
  @IsOptional()
  @IsDateString()
  graduation_date?: string;

  @ApiProperty({
    required: false,
    example: 'Graduated with full Quran memorisation.',
    description: 'Recorded in the audit log.',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
