import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { DailyHalaqaReport } from './daily-halaqa-report.entity';
import type {
  CalculationDetails,
  SystemAlert,
  TrackReconciliation,
} from '../types/report-json';

/**
 * `missing_attendance` is a report-derived state (no attendance row existed) —
 * it is NOT a value of `student_attendances.status`, which stays
 * present/absent/excused/late. Only the report captures it.
 */
export type EvaluationAttendanceStatus =
  | 'present'
  | 'late'
  | 'absent'
  | 'excused'
  | 'missing_attendance';

/**
 * One saved evaluation row per (report, student) (§26). All numeric per-track
 * fields are stored so weekly/monthly aggregates read plain columns instead of
 * digging into JSON; the JSON columns hold the audit detail (§31).
 *
 * DECIMAL columns are returned as strings by the MySQL driver — convert with
 * Number() before arithmetic. `total_score`, `ethics_*`, and
 * `overall_plan_completion_rate` are nullable to represent `missing_attendance`
 * (total_score = NULL, excluded from averages — §20.2).
 */
@Entity('daily_student_evaluations')
@Index('uk_daily_report_student', ['dailyReportId', 'studentId'], {
  unique: true,
})
@Index('idx_daily_eval_student', ['studentId', 'dailyReportId'])
@Index('idx_daily_eval_total', ['dailyReportId', 'totalScore'])
export class DailyStudentEvaluation {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ name: 'daily_report_id', type: 'bigint' })
  dailyReportId!: number;

  @Column({ name: 'student_id', type: 'int' })
  studentId!: number;

  @Column({
    name: 'attendance_status',
    type: 'enum',
    enum: ['present', 'late', 'absent', 'excused', 'missing_attendance'],
  })
  attendanceStatus!: EvaluationAttendanceStatus;

  @Column({ name: 'teacher_note', type: 'text', nullable: true })
  teacherNote!: string | null;

  @Column({ name: 'system_alerts', type: 'json', nullable: true })
  systemAlerts!: SystemAlert[] | null;

  @Column({ name: 'calculation_details', type: 'json' })
  calculationDetails!: CalculationDetails;

  // ─── Hifz (§26.2) ──────────────────────────────────────────────────────────
  @Column({ name: 'hifz_base_weight', type: 'decimal', precision: 5, scale: 2 })
  hifzBaseWeight!: number;
  @Column({
    name: 'hifz_effective_weight',
    type: 'decimal',
    precision: 5,
    scale: 2,
  })
  hifzEffectiveWeight!: number;
  @Column({
    name: 'hifz_planned_pages',
    type: 'decimal',
    precision: 8,
    scale: 4,
  })
  hifzPlannedPages!: number;
  @Column({
    name: 'hifz_achieved_pages',
    type: 'decimal',
    precision: 8,
    scale: 4,
  })
  hifzAchievedPages!: number;
  @Column({
    name: 'hifz_completion_rate',
    type: 'decimal',
    precision: 5,
    scale: 2,
  })
  hifzCompletionRate!: number;
  @Column({
    name: 'hifz_quality_rate',
    type: 'decimal',
    precision: 5,
    scale: 2,
  })
  hifzQualityRate!: number;
  @Column({ name: 'hifz_score', type: 'decimal', precision: 6, scale: 2 })
  hifzScore!: number;
  @Column({ name: 'hifz_reconciliation', type: 'json', nullable: true })
  hifzReconciliation!: TrackReconciliation | null;

  // ─── Near review (§26.3) ────────────────────────────────────────────────────
  @Column({ name: 'near_base_weight', type: 'decimal', precision: 5, scale: 2 })
  nearBaseWeight!: number;
  @Column({
    name: 'near_effective_weight',
    type: 'decimal',
    precision: 5,
    scale: 2,
  })
  nearEffectiveWeight!: number;
  @Column({
    name: 'near_planned_pages',
    type: 'decimal',
    precision: 8,
    scale: 4,
  })
  nearPlannedPages!: number;
  @Column({
    name: 'near_achieved_pages',
    type: 'decimal',
    precision: 8,
    scale: 4,
  })
  nearAchievedPages!: number;
  @Column({
    name: 'near_completion_rate',
    type: 'decimal',
    precision: 5,
    scale: 2,
  })
  nearCompletionRate!: number;
  @Column({
    name: 'near_quality_rate',
    type: 'decimal',
    precision: 5,
    scale: 2,
  })
  nearQualityRate!: number;
  @Column({ name: 'near_score', type: 'decimal', precision: 6, scale: 2 })
  nearScore!: number;
  @Column({ name: 'near_reconciliation', type: 'json', nullable: true })
  nearReconciliation!: TrackReconciliation | null;

  // ─── Far review (§26.4) ─────────────────────────────────────────────────────
  @Column({ name: 'far_base_weight', type: 'decimal', precision: 5, scale: 2 })
  farBaseWeight!: number;
  @Column({
    name: 'far_effective_weight',
    type: 'decimal',
    precision: 5,
    scale: 2,
  })
  farEffectiveWeight!: number;
  @Column({
    name: 'far_planned_pages',
    type: 'decimal',
    precision: 8,
    scale: 4,
  })
  farPlannedPages!: number;
  @Column({
    name: 'far_achieved_pages',
    type: 'decimal',
    precision: 8,
    scale: 4,
  })
  farAchievedPages!: number;
  @Column({
    name: 'far_completion_rate',
    type: 'decimal',
    precision: 5,
    scale: 2,
  })
  farCompletionRate!: number;
  @Column({ name: 'far_quality_rate', type: 'decimal', precision: 5, scale: 2 })
  farQualityRate!: number;
  @Column({ name: 'far_score', type: 'decimal', precision: 6, scale: 2 })
  farScore!: number;
  @Column({ name: 'far_reconciliation', type: 'json', nullable: true })
  farReconciliation!: TrackReconciliation | null;

  // ─── Ethics & totals (§26.5) ────────────────────────────────────────────────
  @Column({
    name: 'ethics_rating',
    type: 'tinyint',
    unsigned: true,
    nullable: true,
  })
  ethicsRating!: number | null;

  @Column({
    name: 'ethics_score',
    type: 'decimal',
    precision: 6,
    scale: 2,
    nullable: true,
  })
  ethicsScore!: number | null;

  @Column({
    name: 'overall_plan_completion_rate',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  overallPlanCompletionRate!: number | null;

  @Column({
    name: 'total_score',
    type: 'decimal',
    precision: 6,
    scale: 2,
    nullable: true,
  })
  totalScore!: number | null;

  @ManyToOne(() => DailyHalaqaReport, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'daily_report_id' })
  report!: Relation<DailyHalaqaReport>;
}
