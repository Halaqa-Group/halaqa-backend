import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsPositive } from 'class-validator';

export class EnrollStudentDto {
  @ApiProperty({
    example: 42,
    description: 'Must be an active student in this school.',
  })
  @IsInt()
  @IsPositive()
  student_id!: number;

  @ApiProperty({
    required: false,
    format: 'date',
    example: '2026-05-08',
    description: 'Defaults to today.',
  })
  @IsOptional()
  @IsDateString()
  enrollment_date?: string;
}
