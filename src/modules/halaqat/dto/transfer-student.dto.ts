import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class TransferStudentDto {
  @ApiProperty({
    example: 42,
    description: 'Student must be active in from_halaqa_id.',
  })
  @IsInt()
  @IsPositive()
  student_id!: number;

  @ApiProperty({
    example: 17,
    description: 'Student must be currently active here.',
  })
  @IsInt()
  @IsPositive()
  from_halaqa_id!: number;

  @ApiProperty({
    example: 19,
    description:
      'Must differ from from_halaqa_id; must be active and in the same school.',
  })
  @IsInt()
  @IsPositive()
  to_halaqa_id!: number;

  @ApiProperty({
    required: false,
    format: 'date',
    example: '2026-05-10',
    description: 'Defaults to today.',
  })
  @IsOptional()
  @IsDateString()
  transfer_date?: string;

  @ApiProperty({ example: 'Student moved to advanced level', maxLength: 255 })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  reason!: string;
}
