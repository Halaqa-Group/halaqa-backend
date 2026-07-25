import { ApiProperty } from '@nestjs/swagger';

export class DateRangeDto {
  @ApiProperty({ format: 'date', example: '2026-07-25' })
  from!: string;

  @ApiProperty({ format: 'date', example: '2026-07-25' })
  to!: string;
}

/** Same headline KPIs over the immediately-preceding window, for trend deltas. */
export class OverviewComparisonDto {
  @ApiProperty({ type: DateRangeDto })
  range!: DateRangeDto;

  @ApiProperty({ example: 0.9 })
  student_attendance_rate!: number;

  @ApiProperty({ nullable: true, example: 0.85 })
  teacher_attendance_rate!: number | null;

  @ApiProperty({ example: 4.9 })
  ethics_average!: number;

  @ApiProperty({ example: 11.0 })
  new_memorization_pages!: number;

  @ApiProperty({ example: 0.7 })
  plan_completion_rate!: number;

  @ApiProperty({ example: 83.0 })
  average_score!: number;
}

export class OverviewDto {
  @ApiProperty({ type: DateRangeDto })
  range!: DateRangeDto;

  @ApiProperty({
    example: 0.92,
    description:
      'Student attendance rate over the period: (present + late) / total obligated rows.',
  })
  student_attendance_rate!: number;

  @ApiProperty({
    nullable: true,
    example: 0.88,
    description:
      'Teacher attendance rate for teachers in scope. `null` for the teacher role (not authorized to see staff commitment).',
  })
  teacher_attendance_rate!: number | null;

  @ApiProperty({
    example: 1.0,
    description: 'Average ethics rating (تقييم الأخلاق), 1..5.',
  })
  ethics_average!: number;

  @ApiProperty({
    example: 12.5,
    description:
      'New-memorization volume: SUM of total_pages from approved Hifz achievements in the period (fractional pages).',
  })
  new_memorization_pages!: number;

  @ApiProperty({
    example: 0.75,
    description:
      'Plan-completion rate: completed items / total items in scope.',
  })
  plan_completion_rate!: number;

  @ApiProperty({
    example: 84.5,
    description: 'Average percentage_score (0..100).',
  })
  average_score!: number;

  @ApiProperty({
    example: 120,
    description: 'Distinct active students in scope.',
  })
  active_students!: number;

  @ApiProperty({ example: 8, description: 'Active halaqat in scope.' })
  active_halaqat!: number;

  @ApiProperty({
    type: OverviewComparisonDto,
    nullable: true,
    description:
      'The same KPIs over the immediately-preceding window. Present only when `?compare=true`; else null. Compute deltas client-side.',
  })
  previous!: OverviewComparisonDto | null;
}

export class TopStudentDto {
  @ApiProperty({ example: 42 })
  student_id!: number;

  @ApiProperty({ example: 'محمد أحمد علي الفلاني' })
  student_name!: string;

  @ApiProperty({
    example: 12.5,
    description: 'Total pages (الصفحات الكلية) memorized in the period.',
  })
  total_pages!: number;

  @ApiProperty({
    example: 12.5,
    description:
      'Pages actually recited (صفحات المواضع). Equals total_pages for full recitations.',
  })
  positions_pages!: number;

  @ApiProperty({
    example: 5,
    description: 'Number of approved achievements in the period.',
  })
  achievements_count!: number;

  @ApiProperty({
    example: 91.2,
    description: 'Average percentage_score across those achievements.',
  })
  average_score!: number;
}

export class TopStudentsDto {
  @ApiProperty({ type: DateRangeDto })
  range!: DateRangeDto;

  @ApiProperty({ enum: ['Hifz', 'Near', 'Far'], example: 'Hifz' })
  track!: string;

  @ApiProperty({ type: [TopStudentDto] })
  items!: TopStudentDto[];
}

export class HalaqaPerformanceDto {
  @ApiProperty({ example: 3 })
  halaqa_id!: number;

  @ApiProperty({ example: 'حلقة الفرقان' })
  halaqa_name!: string;

  @ApiProperty({ example: 18, description: 'Active students enrolled.' })
  students!: number;

  @ApiProperty({ example: 0.94, description: 'Student attendance rate.' })
  attendance_rate!: number;

  @ApiProperty({
    example: 24.75,
    description:
      'New-memorization pages (SUM total_pages, Hifz) in the period.',
  })
  pages!: number;

  @ApiProperty({ example: 86.4, description: 'Average percentage_score.' })
  average_score!: number;

  @ApiProperty({ example: 0.8, description: 'Plan-completion rate.' })
  plan_completion_rate!: number;
}

export class HalaqatPerformanceDto {
  @ApiProperty({ type: DateRangeDto })
  range!: DateRangeDto;

  @ApiProperty({ type: [HalaqaPerformanceDto] })
  items!: HalaqaPerformanceDto[];
}

export class TeacherCommitmentDto {
  @ApiProperty({ example: 7 })
  teacher_id!: number;

  @ApiProperty({ example: 'خالد سعيد عمر الشمري' })
  teacher_name!: string;

  @ApiProperty({
    nullable: true,
    example: 0.96,
    description:
      "The teacher's own attendance rate over the period. `null` if they have no attendance rows.",
  })
  attendance_rate!: number | null;

  @ApiProperty({
    example: 2,
    description: 'Active halaqat they currently teach.',
  })
  halaqat!: number;

  @ApiProperty({
    example: 34,
    description: 'Distinct active students across those halaqat.',
  })
  students!: number;

  @ApiProperty({
    example: 0.9,
    description: "Their students' attendance rate.",
  })
  student_attendance_rate!: number;

  @ApiProperty({
    example: 42.5,
    description:
      "Their students' new-memorization pages (SUM total_pages, Hifz).",
  })
  student_pages!: number;
}

export class TeachersCommitmentDto {
  @ApiProperty({ type: DateRangeDto })
  range!: DateRangeDto;

  @ApiProperty({ type: [TeacherCommitmentDto] })
  items!: TeacherCommitmentDto[];
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

export class StalledStudentDto {
  @ApiProperty({ example: 42 })
  student_id!: number;

  @ApiProperty({ example: 'محمد أحمد علي الفلاني' })
  student_name!: string;

  @ApiProperty({
    nullable: true,
    format: 'date',
    example: '2026-07-10',
    description: 'Date of their last approved achievement, or null if never.',
  })
  last_achievement_date!: string | null;

  @ApiProperty({
    nullable: true,
    example: 15,
    description: 'Days since the last approved achievement; null if never.',
  })
  days_since!: number | null;
}

export class HalaqaWithoutTeacherDto {
  @ApiProperty({ example: 3 })
  halaqa_id!: number;

  @ApiProperty({ example: 'حلقة الفرقان' })
  halaqa_name!: string;
}

export class HighAbsenceTeacherDto {
  @ApiProperty({ example: 7 })
  teacher_id!: number;

  @ApiProperty({ example: 'خالد سعيد عمر الشمري' })
  teacher_name!: string;

  @ApiProperty({
    example: 3,
    description: 'Number of absent days in the period.',
  })
  absent_days!: number;

  @ApiProperty({
    example: 0.62,
    description: 'Attendance rate over the period.',
  })
  attendance_rate!: number;
}

export class AlertsDto {
  @ApiProperty({ type: DateRangeDto })
  range!: DateRangeDto;

  @ApiProperty({
    example: 7,
    description: 'The staleness window (days) used for stalled_students.',
  })
  stalled_days!: number;

  @ApiProperty({
    type: [StalledStudentDto],
    description:
      'Active students in scope with no approved achievement in the last `stalled_days` days.',
  })
  stalled_students!: StalledStudentDto[];

  @ApiProperty({
    type: [HalaqaWithoutTeacherDto],
    description: 'Active halaqat in scope with no active main teacher.',
  })
  halaqat_without_teacher!: HalaqaWithoutTeacherDto[];

  @ApiProperty({
    type: [HighAbsenceTeacherDto],
    description:
      'Teachers in scope with at least `absence_threshold` absent days in the period.',
  })
  high_absence_teachers!: HighAbsenceTeacherDto[];
}
