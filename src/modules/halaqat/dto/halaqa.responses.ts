import { ApiProperty } from '@nestjs/swagger';
import type { HalaqaStatus, HalaqaType } from '../entities/halaqa.entity';
import type { EndReason, TeacherRole } from '../entities/halaqa-teacher.entity';
import type { PrayerSlot } from '../entities/halaqa-schedule.entity';
import type { StudentHalaqaStatus } from '../entities/student-halaqa.entity';

// ─── Shared nested shapes ──────────────────────────────────────────────────

export class PrimaryTeacherSummary {
  @ApiProperty({ example: 12 }) user_id!: number;
  @ApiProperty({ example: 'أحمد المعلم' }) name!: string;
  @ApiProperty({ example: false }) is_acting!: boolean;
}

export class ScheduleEntryResponse {
  @ApiProperty({ example: 33 }) id!: number;
  @ApiProperty({ example: 0 }) day_of_week!: number;
  @ApiProperty({ nullable: true, enum: ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'], example: 'fajr' }) prayer_slot!: PrayerSlot | null;
  @ApiProperty({ nullable: true, example: '05:00:00' }) start_time!: string | null;
  @ApiProperty({ nullable: true, example: '06:00:00' }) end_time!: string | null;
}

export class TeacherAssignmentResponse {
  @ApiProperty({ example: 55 }) id!: number;
  @ApiProperty({ example: 12 }) teacher_user_id!: number;
  @ApiProperty({ example: 'أحمد المعلم' }) teacher_name!: string;
  @ApiProperty({ enum: ['main', 'assistant', 'substitute'], example: 'main' }) role!: TeacherRole;
  @ApiProperty({ example: false }) acting_as_primary!: boolean;
  @ApiProperty({ nullable: true, example: null }) acting_starts_at!: string | null;
  @ApiProperty({ nullable: true, example: null }) acting_ends_at!: string | null;
  @ApiProperty({ example: '2026-01-01' }) start_date!: string;
  @ApiProperty({ nullable: true, example: null }) end_date!: string | null;
  @ApiProperty({ nullable: true, enum: ['reassigned', 'left_school', 'vacation', 'retired', 'other'], example: null }) end_reason!: EndReason | null;
}

export class SupervisorSummaryResponse {
  @ApiProperty({ example: 5 }) user_id!: number;
  @ApiProperty({ example: 'محمد المشرف' }) name!: string;
  @ApiProperty({ example: '2026-01-01T08:00:00.000Z' }) assigned_at!: Date;
}

// ─── Top-level response shapes ─────────────────────────────────────────────

/** Returned by POST /halaqat */
export class HalaqaCreatedResponse {
  @ApiProperty({ example: 17 }) id!: number;
  @ApiProperty({ example: 1 }) school_id!: number;
  @ApiProperty({ example: 'حلقة الفجر للحفظ' }) name!: string;
  @ApiProperty({ enum: ['Memorization', 'Tajweed', 'Aqeedah'], example: 'Memorization' }) type!: HalaqaType;
  @ApiProperty({ nullable: true, example: null }) evaluation_settings!: Record<string, unknown> | null;
  @ApiProperty({ enum: ['active', 'archived', 'completed'], example: 'active' }) status!: HalaqaStatus;
  @ApiProperty({ example: '2026-05-08T05:00:00.000Z' }) created_at!: Date;
}

/** Single item in GET /halaqat list */
export class HalaqaListItem {
  @ApiProperty({ example: 17 }) id!: number;
  @ApiProperty({ example: 1 }) school_id!: number;
  @ApiProperty({ example: 'حلقة الفجر للحفظ' }) name!: string;
  @ApiProperty({ enum: ['Memorization', 'Tajweed', 'Aqeedah'], example: 'Memorization' }) type!: HalaqaType;
  @ApiProperty({ enum: ['active', 'archived', 'completed'], example: 'active' }) status!: HalaqaStatus;
  @ApiProperty({ nullable: true, type: PrimaryTeacherSummary }) primary_teacher!: PrimaryTeacherSummary | null;
  @ApiProperty({ example: 8 }) students_count!: number;
  @ApiProperty({ example: '2026-05-08T05:00:00.000Z' }) created_at!: Date;
}

/** GET /halaqat — paginated list */
export class HalaqaListData {
  @ApiProperty({ type: [HalaqaListItem] }) items!: HalaqaListItem[];
  @ApiProperty({ example: 42 }) total!: number;
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty({ example: 20 }) limit!: number;
}

/** GET /halaqat/:id and PATCH /halaqat/:id */
export class HalaqaDetailResponse {
  @ApiProperty({ example: 17 }) id!: number;
  @ApiProperty({ example: 1 }) school_id!: number;
  @ApiProperty({ example: 'حلقة الفجر للحفظ' }) name!: string;
  @ApiProperty({ enum: ['Memorization', 'Tajweed', 'Aqeedah'], example: 'Memorization' }) type!: HalaqaType;
  @ApiProperty({ nullable: true, example: null }) evaluation_settings!: Record<string, unknown> | null;
  @ApiProperty({ enum: ['active', 'archived', 'completed'], example: 'active' }) status!: HalaqaStatus;
  @ApiProperty({ type: [ScheduleEntryResponse] }) schedule!: ScheduleEntryResponse[];
  @ApiProperty({ type: [TeacherAssignmentResponse] }) teachers!: TeacherAssignmentResponse[];
  @ApiProperty({ type: [SupervisorSummaryResponse] }) supervisors!: SupervisorSummaryResponse[];
  @ApiProperty({ example: 8 }) students_count!: number;
  @ApiProperty({ example: '2026-05-08T05:00:00.000Z' }) created_at!: Date;
  @ApiProperty({ example: '2026-05-08T05:00:00.000Z' }) updated_at!: Date;
}

export class StudentEnrollmentResponse {
  @ApiProperty({ example: 42 }) student_id!: number;
  @ApiProperty({ example: 'محمد علي' }) student_name!: string;
  @ApiProperty({ example: '2026-05-09' }) enrollment_date!: string;
  @ApiProperty({ enum: ['active', 'transferred', 'completed', 'archived'], example: 'active' }) status!: StudentHalaqaStatus;
}

// ─── Reverse-lookup response shapes ───────────────────────────────────────────

export class TeacherHalaqaItem {
  @ApiProperty({ example: 17 }) halaqa_id!: number;
  @ApiProperty({ example: 'حلقة الفجر للحفظ' }) halaqa_name!: string;
  @ApiProperty({ enum: ['active', 'archived', 'completed'], example: 'active' }) halaqa_status!: HalaqaStatus;
  @ApiProperty({ enum: ['Memorization', 'Tajweed', 'Aqeedah'], example: 'Memorization' }) halaqa_type!: HalaqaType;
  @ApiProperty({ enum: ['main', 'assistant', 'substitute'], example: 'main' }) role!: TeacherRole;
  @ApiProperty({ example: '2026-01-01' }) start_date!: string;
}

export class SupervisorHalaqaItem {
  @ApiProperty({ example: 17 }) halaqa_id!: number;
  @ApiProperty({ example: 'حلقة الفجر للحفظ' }) halaqa_name!: string;
  @ApiProperty({ enum: ['active', 'archived', 'completed'], example: 'active' }) halaqa_status!: HalaqaStatus;
  @ApiProperty({ enum: ['Memorization', 'Tajweed', 'Aqeedah'], example: 'Memorization' }) halaqa_type!: HalaqaType;
  @ApiProperty({ example: '2026-01-01T08:00:00.000Z' }) assigned_at!: Date;
}

export class StudentHalaqaItem {
  @ApiProperty({ example: 17 }) halaqa_id!: number;
  @ApiProperty({ example: 'حلقة الفجر للحفظ' }) halaqa_name!: string;
  @ApiProperty({ enum: ['active', 'archived', 'completed'], example: 'active' }) halaqa_status!: HalaqaStatus;
  @ApiProperty({ enum: ['Memorization', 'Tajweed', 'Aqeedah'], example: 'Memorization' }) halaqa_type!: HalaqaType;
  @ApiProperty({ example: '2026-01-01' }) enrollment_date!: string;
  @ApiProperty({ enum: ['active', 'transferred', 'completed', 'archived'], example: 'active' }) enrollment_status!: StudentHalaqaStatus;
}

/** PUT /halaqat/:id/schedule */
export class SetScheduleResponse {
  @ApiProperty({ type: [ScheduleEntryResponse] }) schedule!: ScheduleEntryResponse[];
  @ApiProperty({ type: [String], example: [] }) warnings!: string[];
}
