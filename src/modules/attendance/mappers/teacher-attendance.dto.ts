import { ApiProperty } from '@nestjs/swagger';
import { ATTENDANCE_STATUSES } from '../entities/student-attendance.entity';
import type { AttendanceStatus } from '../entities/student-attendance.entity';
import { TeacherAttendance } from '../entities/teacher-attendance.entity';

export class TeacherAttendanceDto {
  @ApiProperty({ example: 2001 })
  id!: number;

  @ApiProperty({ example: 7 })
  user_id!: number;

  @ApiProperty({
    nullable: true,
    example: 'أحمد محمد علي المدير',
    description: 'Full display name of the staff member (null if unavailable).',
  })
  user_name!: string | null;

  @ApiProperty({
    nullable: true,
    example: 'https://cdn.example.com/u/7.jpg',
    description: "Staff member's photo URL (null if none).",
  })
  user_photo_url!: string | null;

  @ApiProperty({
    example: false,
    description:
      'True when the staff member has since been deleted. Such rows are ' +
      'historical only (dates before the deletion) and cannot be corrected.',
  })
  user_is_deleted!: boolean;

  @ApiProperty({ format: 'date', example: '2026-07-07' })
  date!: string;

  @ApiProperty({ enum: ATTENDANCE_STATUSES, example: 'present' })
  status!: AttendanceStatus;

  @ApiProperty({ nullable: true, example: 'إجازة' })
  excuse_note!: string | null;

  @ApiProperty({
    nullable: true,
    example: 1,
    description: 'NULL = auto-seeded by the system.',
  })
  recorded_by!: number | null;

  @ApiProperty({ nullable: true, example: 1 })
  modified_by!: number | null;

  @ApiProperty({ nullable: true, example: 'Corrected after leave approval.' })
  modification_reason!: string | null;

  @ApiProperty({ nullable: true, example: 'present' })
  original_status!: string | null;

  @ApiProperty({ format: 'date-time' })
  created_at!: Date;

  static fromEntity(a: TeacherAttendance): TeacherAttendanceDto {
    const dto = new TeacherAttendanceDto();
    dto.id = a.id;
    dto.user_id = a.userId;
    // `user` is only populated when the caller joined it (the list query).
    // Fall back to null so the single-row PATCH response stays valid.
    dto.user_name = a.user?.name ?? null;
    dto.user_photo_url = a.user?.photoUrl ?? null;
    dto.user_is_deleted = a.user?.deletedAt != null;
    dto.date = a.attendanceDate;
    dto.status = a.status;
    dto.excuse_note = a.excuseNote;
    dto.recorded_by = a.recordedBy;
    dto.modified_by = a.modifiedBy;
    dto.modification_reason = a.modificationReason;
    dto.original_status = a.originalStatus;
    dto.created_at = a.createdAt;
    return dto;
  }
}

export class TeacherAttendanceListData {
  @ApiProperty({ type: [TeacherAttendanceDto] })
  items!: TeacherAttendanceDto[];

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;
}

export class TeacherSyncResultRowDto {
  @ApiProperty({ example: 7 })
  user_id!: number;

  @ApiProperty({ format: 'date', example: '2026-07-07' })
  date!: string;

  @ApiProperty({
    nullable: true,
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  client_uuid!: string | null;

  @ApiProperty({
    enum: ['created', 'updated', 'duplicate', 'forbidden'],
    example: 'updated',
  })
  outcome!: string;

  @ApiProperty({ nullable: true, example: 2001 })
  attendance_id!: number | null;
}

export class TeacherBulkSyncResultDto {
  @ApiProperty({ example: 3 })
  created!: number;

  @ApiProperty({ example: 5 })
  updated!: number;

  @ApiProperty({ example: 2 })
  duplicate!: number;

  @ApiProperty({ example: 1 })
  forbidden!: number;

  @ApiProperty({ type: [TeacherSyncResultRowDto] })
  results!: TeacherSyncResultRowDto[];
}
