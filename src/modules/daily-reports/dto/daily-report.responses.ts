import { ApiProperty } from '@nestjs/swagger';
import type {
  DayStatus,
  ReportStatus,
} from '../entities/daily-halaqa-report.entity';
import type { EvaluationAttendanceStatus } from '../entities/daily-student-evaluation.entity';
import type { SystemAlert, TrackReconciliation } from '../types/report-json';

/** Effective (snapshot) weights returned with a report; the four sum to 100. */
export class ReportWeightsSummary {
  @ApiProperty({ example: 40 }) hifz!: number;
  @ApiProperty({ example: 25 }) near!: number;
  @ApiProperty({ example: 30 }) far!: number;
  @ApiProperty({ example: 5 }) ethics!: number;
}

/** One student row in the summary report (§29.1). All rates/scores 2 decimals. */
export class StudentReportRow {
  @ApiProperty({ example: 55 }) student_id!: number;
  @ApiProperty({ example: 'محمد علي' }) student_name!: string;
  @ApiProperty({
    enum: ['present', 'late', 'absent', 'excused', 'missing_attendance'],
    example: 'present',
  })
  attendance_status!: EvaluationAttendanceStatus;
  @ApiProperty({ example: 36.0 }) hifz_score!: number;
  @ApiProperty({ example: 20.0 }) near_score!: number;
  @ApiProperty({ example: 25.5 }) far_score!: number;
  @ApiProperty({ nullable: true, example: 5.0 }) ethics_score!: number | null;
  @ApiProperty({ nullable: true, example: 92.5 }) plan_completion_rate!:
    | number
    | null;
  @ApiProperty({
    nullable: true,
    example: 86.5,
    description: 'NULL when attendance is missing.',
  })
  total_score!: number | null;
  @ApiProperty({ nullable: true, example: 'ما شاء الله أداء متقن' })
  teacher_note!: string | null;
  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    example: [
      { code: 'NO_APPROVED_PLAN', severity: 'warning', message: '...' },
    ],
  })
  system_alerts!: SystemAlert[];
}

/** GET /halaqat/:halaqaId/daily-report?date=… — summary (§29.1). */
export class DailyReportResponse {
  @ApiProperty({ example: 10 }) halaqa_id!: number;
  @ApiProperty({ example: '2026-07-20' }) date!: string;
  @ApiProperty({
    enum: ['live', 'snapshot'],
    description: 'live = computed now (current week); snapshot = saved report.',
  })
  source!: 'live' | 'snapshot';
  @ApiProperty({ enum: ['working_day', 'non_working_day'] })
  day_status!: DayStatus;
  @ApiProperty({ enum: ['complete', 'partial', 'failed'] })
  report_status!: ReportStatus;
  @ApiProperty({ type: ReportWeightsSummary }) weights!: ReportWeightsSummary;
  @ApiProperty({ type: [StudentReportRow] }) students!: StudentReportRow[];
}

/** Per-track detail for one student (§29.2). */
export class StudentTrackDetail {
  @ApiProperty({ example: 40 }) base_weight!: number;
  @ApiProperty({ example: 40 }) effective_weight!: number;
  @ApiProperty({ example: 2.5 }) planned_pages!: number;
  @ApiProperty({ example: 2.0 }) achieved_pages!: number;
  @ApiProperty({ example: 80 }) completion_rate!: number;
  @ApiProperty({ example: 93.5 }) quality_rate!: number;
  @ApiProperty({ example: 29.92 }) score!: number;
  @ApiProperty({
    nullable: true,
    type: 'object',
    additionalProperties: true,
    description:
      'Reconciliation audit blob (§12): plannedRanges, approvedSegments, gaps, ' +
      'outsidePlanSegments. Internal keys are camelCase (stored as-is).',
  })
  reconciliation!: TrackReconciliation | null;
}

/** GET /halaqat/:halaqaId/daily-report/:date/students/:studentId (§29.2). */
export class StudentDetailResponse {
  @ApiProperty({ example: 10 }) halaqa_id!: number;
  @ApiProperty({ example: '2026-07-20' }) date!: string;
  @ApiProperty({ example: 55 }) student_id!: number;
  @ApiProperty({ example: 'محمد علي' }) student_name!: string;
  @ApiProperty({ enum: ['live', 'snapshot'] }) source!: 'live' | 'snapshot';
  @ApiProperty({
    enum: ['present', 'late', 'absent', 'excused', 'missing_attendance'],
  })
  attendance_status!: EvaluationAttendanceStatus;
  @ApiProperty({ type: StudentTrackDetail }) hifz!: StudentTrackDetail;
  @ApiProperty({ type: StudentTrackDetail }) near!: StudentTrackDetail;
  @ApiProperty({ type: StudentTrackDetail }) far!: StudentTrackDetail;
  @ApiProperty({ nullable: true, example: 4 }) ethics_rating!: number | null;
  @ApiProperty({ nullable: true, example: 4.0 }) ethics_score!: number | null;
  @ApiProperty({ nullable: true, example: 92.5 }) plan_completion_rate!:
    | number
    | null;
  @ApiProperty({ nullable: true, example: 86.5 }) total_score!: number | null;
  @ApiProperty({ nullable: true }) teacher_note!: string | null;
  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
  })
  system_alerts!: SystemAlert[];
}
