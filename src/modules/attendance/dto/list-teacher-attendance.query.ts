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

export class ListTeacherAttendanceQuery {
  @ApiProperty({ required: false, example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({ required: false, example: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiProperty({ required: false, example: 7 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  user_id?: number;

  @ApiProperty({ required: false, format: 'date', example: '2026-07-07' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiProperty({ required: false, format: 'date' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiProperty({ required: false, format: 'date' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiProperty({ required: false, enum: ATTENDANCE_STATUSES })
  @IsOptional()
  @IsEnum(ATTENDANCE_STATUSES)
  status?: AttendanceStatus;
}
