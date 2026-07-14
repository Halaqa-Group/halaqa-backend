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

export class SyncTeacherAttendanceEntryDto {
  @ApiProperty({ example: 7, description: 'Staff user id.' })
  @IsInt()
  user_id!: number;

  @ApiProperty({ format: 'date', example: '2026-07-07' })
  @IsDateString()
  date!: string;

  @ApiProperty({ enum: ATTENDANCE_STATUSES, example: 'absent' })
  @IsEnum(ATTENDANCE_STATUSES)
  status!: AttendanceStatus;

  @ApiProperty({ required: false, nullable: true, example: 'إجازة' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  excuse_note?: string;

  @ApiProperty({ required: false, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  client_uuid?: string;

  @ApiProperty({ required: false, format: 'date-time' })
  @IsOptional()
  @IsDateString()
  client_recorded_at?: string;

  @ApiProperty({ required: false, maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  device_id?: string;
}

export class BulkSyncTeacherAttendanceDto {
  @ApiProperty({ type: [SyncTeacherAttendanceEntryDto] })
  @Type(() => SyncTeacherAttendanceEntryDto)
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  records!: SyncTeacherAttendanceEntryDto[];
}
