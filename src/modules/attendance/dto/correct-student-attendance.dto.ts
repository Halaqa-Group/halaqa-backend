import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  ATTENDANCE_STATUSES,
  ETHICS_RATING_MAX,
  ETHICS_RATING_MIN,
} from '../entities/student-attendance.entity';
import type { AttendanceStatus } from '../entities/student-attendance.entity';

export class CorrectStudentAttendanceDto {
  @ApiProperty({
    required: false,
    enum: ATTENDANCE_STATUSES,
    example: 'excused',
    description:
      'Omit to leave the status untouched and only change the rating.',
  })
  @IsOptional()
  @IsEnum(ATTENDANCE_STATUSES)
  status?: AttendanceStatus;

  @ApiProperty({
    required: false,
    minimum: ETHICS_RATING_MIN,
    maximum: ETHICS_RATING_MAX,
    example: 4,
    description:
      'تقييم الأخلاق — behaviour score 1..5. Omit to leave unchanged.',
  })
  @IsOptional()
  @IsInt()
  @Min(ETHICS_RATING_MIN)
  @Max(ETHICS_RATING_MAX)
  ethics_rating?: number;

  @ApiProperty({ required: false, nullable: true, example: 'عذر طبي' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  excuse_note?: string;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'ما شاء الله أداء متقن',
    description:
      'ملاحظة المحفّظ اليومية — teacher note surfaced in the daily report (§22).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  daily_note?: string;

  @ApiProperty({ example: 'Marked present by mistake in the morning.' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  modification_reason!: string;
}
