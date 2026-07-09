import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { ATTENDANCE_STATUSES } from '../entities/student-attendance.entity';
import type { AttendanceStatus } from '../entities/student-attendance.entity';

export class ListStudentAttendanceQuery {
  @ApiProperty({
    required: false,
    example: 1,
    minimum: 1,
    description: 'Defaults to 1.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({
    required: false,
    example: 20,
    minimum: 1,
    maximum: 100,
    description: 'Defaults to 20, capped at 100.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiProperty({ required: false, example: 42 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  student_id?: number;

  @ApiProperty({ required: false, format: 'date', example: '2026-07-07' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiProperty({
    required: false,
    format: 'date',
    example: '2026-07-01',
    description: 'Range start (inclusive).',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiProperty({
    required: false,
    format: 'date',
    example: '2026-07-31',
    description: 'Range end (inclusive).',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiProperty({
    required: false,
    enum: ATTENDANCE_STATUSES,
    example: 'absent',
  })
  @IsOptional()
  @IsEnum(ATTENDANCE_STATUSES)
  status?: AttendanceStatus;
}
