import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class RemoveStudentDto {
  @ApiProperty({
    enum: ['completed', 'unenrolled'],
    example: 'completed',
    description:
      "'completed' — student finished the halaqa; " +
      "'unenrolled' — dropped out or left without completing. " +
      'Both set student_halaqa.status; the activity log action distinguishes them.',
  })
  @IsEnum(['completed', 'unenrolled'])
  outcome!: 'completed' | 'unenrolled';

  @ApiProperty({
    required: false,
    example: 'Finished the assigned juz',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;
}
