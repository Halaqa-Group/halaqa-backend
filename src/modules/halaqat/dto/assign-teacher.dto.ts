import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class AssignTeacherDto {
  @ApiProperty({
    example: 12,
    description: 'Must be a user in this school with the teacher role.',
  })
  @IsInt()
  @IsPositive()
  teacher_user_id!: number;

  @ApiProperty({
    enum: ['main', 'assistant'],
    example: 'main',
    description:
      "Use the acting-substitute endpoint to create a 'substitute' row.",
  })
  @IsEnum(['main', 'assistant'])
  role!: 'main' | 'assistant';

  @ApiProperty({
    format: 'date',
    example: '2026-05-08',
    description: 'Must be <= today.',
  })
  @IsDateString()
  start_date!: string;

  @ApiProperty({
    required: false,
    example: 'Replacing the previous main teacher',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;
}
