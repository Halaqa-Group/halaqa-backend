import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ATTENDANCE_STATUSES } from '../entities/student-attendance.entity';
import type { AttendanceStatus } from '../entities/student-attendance.entity';

export class SyncAttendanceEntryDto {
  @ApiProperty({ example: 42 })
  @IsInt()
  student_id!: number;

  @ApiProperty({ format: 'date', example: '2026-07-07' })
  @IsDateString()
  date!: string;

  @ApiProperty({ enum: ATTENDANCE_STATUSES, example: 'absent' })
  @IsEnum(ATTENDANCE_STATUSES)
  status!: AttendanceStatus;

  @ApiProperty({ required: false, nullable: true, example: 'مريض' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  excuse_note?: string;

  @ApiProperty({
    required: false,
    format: 'uuid',
    description: 'Client-generated id used for idempotent re-sync.',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @IsOptional()
  @IsUUID()
  client_uuid?: string;

  @ApiProperty({
    required: false,
    format: 'date-time',
    description: 'When the record was captured on the device.',
    example: '2026-07-07T08:15:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  client_recorded_at?: string;

  @ApiProperty({ required: false, maxLength: 64, example: 'ipad-lab-3' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  device_id?: string;
}

export class BulkSyncStudentAttendanceDto {
  @ApiProperty({ type: [SyncAttendanceEntryDto] })
  @Type(() => SyncAttendanceEntryDto)
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  records!: SyncAttendanceEntryDto[];
}
