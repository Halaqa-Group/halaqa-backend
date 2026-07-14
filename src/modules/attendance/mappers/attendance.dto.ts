import { ApiProperty } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import {
  ATTENDANCE_STATUSES,
  StudentAttendance,
} from '../entities/student-attendance.entity';
import type { AttendanceStatus } from '../entities/student-attendance.entity';

function isParentOnly(actor: AuthenticatedUser): boolean {
  const isStaff = actor.roles.some(
    (r) =>
      r.slug === 'principal' ||
      r.slug === 'vice_principal' ||
      r.slug === 'supervisor' ||
      r.slug === 'teacher',
  );
  return !isStaff && actor.roles.some((r) => r.slug === 'parent');
}

/**
 * Role-aware serialization of a student attendance row. Parents get a stripped
 * view (no recorder/modifier/device/sync internals); staff get the full row.
 * Apply this everywhere an attendance row is serialized — never return the raw entity.
 */
export class AttendanceDto {
  @ApiProperty({ example: 1001 })
  id!: number;

  @ApiProperty({ example: 42 })
  student_id!: number;

  @ApiProperty({ format: 'date', example: '2026-07-07' })
  date!: string;

  @ApiProperty({ enum: ATTENDANCE_STATUSES, example: 'present' })
  status!: AttendanceStatus;

  @ApiProperty({ nullable: true, example: 'مريض' })
  excuse_note!: string | null;

  @ApiProperty({
    nullable: true,
    example: 7,
    description: 'NULL = auto-seeded by the system.',
  })
  recorded_by?: number | null;

  @ApiProperty({ nullable: true, example: 7 })
  modified_by?: number | null;

  @ApiProperty({ nullable: true, example: 'Marked present by mistake.' })
  modification_reason?: string | null;

  @ApiProperty({ nullable: true, example: 'present' })
  original_status?: string | null;

  @ApiProperty({ format: 'date-time' })
  created_at!: Date;

  static fromEntity(
    a: StudentAttendance,
    actor: AuthenticatedUser,
  ): AttendanceDto {
    const dto = new AttendanceDto();
    dto.id = a.id;
    dto.student_id = a.studentId;
    dto.date = a.attendanceDate;
    dto.status = a.status;
    dto.excuse_note = a.excuseNote;
    dto.created_at = a.createdAt;

    if (!isParentOnly(actor)) {
      dto.recorded_by = a.recordedBy;
      dto.modified_by = a.modifiedBy;
      dto.modification_reason = a.modificationReason;
      dto.original_status = a.originalStatus;
    }

    return dto;
  }
}

export class AttendanceListData {
  @ApiProperty({ type: [AttendanceDto] })
  items!: AttendanceDto[];

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;
}

// ─── Bulk sync result (documented shape) ──────────────────────────────────────

export class SyncResultRowDto {
  @ApiProperty({ example: 42 })
  student_id!: number;

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

  @ApiProperty({ nullable: true, example: 1001 })
  attendance_id!: number | null;
}

export class BulkSyncResultDto {
  @ApiProperty({ example: 3 })
  created!: number;

  @ApiProperty({ example: 5 })
  updated!: number;

  @ApiProperty({
    example: 2,
    description: 'Already applied on a previous sync.',
  })
  duplicate!: number;

  @ApiProperty({
    example: 1,
    description: 'Actor lacks scope over the student.',
  })
  forbidden!: number;

  @ApiProperty({ type: [SyncResultRowDto] })
  results!: SyncResultRowDto[];
}
