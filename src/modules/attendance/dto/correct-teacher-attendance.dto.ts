import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ATTENDANCE_STATUSES } from '../entities/student-attendance.entity';
import type { AttendanceStatus } from '../entities/student-attendance.entity';

/**
 * Staff attendance corrections. Unlike the student variant this has no
 * `ethics_rating` — the behaviour score is only tracked for students.
 */
export class CorrectTeacherAttendanceDto {
  @ApiProperty({ enum: ATTENDANCE_STATUSES, example: 'excused' })
  @IsEnum(ATTENDANCE_STATUSES)
  status!: AttendanceStatus;

  @ApiProperty({ required: false, nullable: true, example: 'عذر طبي' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  excuse_note?: string;

  @ApiProperty({ example: 'Marked present by mistake in the morning.' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  modification_reason!: string;
}
