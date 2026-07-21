import { ApiProperty } from '@nestjs/swagger';
import type { WeeklyPlanItem } from '../entities/weekly-plan-item.entity';
import type { WeeklyPlan } from '../entities/weekly-plan.entity';

export class WeeklyPlanItemDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ enum: ['Hifz', 'Near', 'Far'], example: 'Hifz' })
  track_type!: string;

  @ApiProperty({ example: 2, description: '0=Saturday … 6=Friday.' })
  day_of_week!: number;

  @ApiProperty({
    example: 0,
    description:
      'Reconciliation priority within the same day + track (lower = first).',
  })
  order!: number;

  @ApiProperty({ example: 1 })
  start_surah!: number;

  @ApiProperty({ example: 1 })
  start_verse!: number;

  @ApiProperty({ example: 1 })
  end_surah!: number;

  @ApiProperty({ example: 7 })
  end_verse!: number;

  @ApiProperty({ example: 7 })
  total_verses!: number;

  @ApiProperty({ example: 4 })
  achieved_verses!: number;

  @ApiProperty({
    enum: ['due', 'overdue', 'partial', 'completed'],
    example: 'partial',
  })
  status!: string;

  @ApiProperty({
    example: false,
    description: 'True if range was edited after item creation.',
  })
  is_manual_override!: boolean;

  @ApiProperty({ example: '2026-05-11T10:00:00.000Z' })
  created_at!: string;

  static fromEntity(item: WeeklyPlanItem): WeeklyPlanItemDto {
    const dto = new WeeklyPlanItemDto();
    dto.id = item.id;
    dto.track_type = item.trackType;
    dto.day_of_week = item.dayOfWeek;
    dto.order = item.order;
    dto.start_surah = item.startSurah;
    dto.start_verse = item.startVerse;
    dto.end_surah = item.endSurah;
    dto.end_verse = item.endVerse;
    dto.total_verses = item.totalVerses;
    dto.achieved_verses = item.achievedVerses;
    dto.status = item.status;
    dto.is_manual_override = item.isManualOverride === 1;
    dto.created_at = item.createdAt.toISOString();
    return dto;
  }
}

export class WeeklyPlanDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 42 })
  student_id!: number;

  @ApiProperty({ example: 3 })
  halaqa_id!: number;

  @ApiProperty({ format: 'date', example: '2026-05-09' })
  week_start_date!: string;

  @ApiProperty({ enum: ['draft', 'approved'], example: 'draft' })
  status!: string;

  @ApiProperty({ nullable: true, example: 7 })
  approved_by!: number | null;

  @ApiProperty({ type: [WeeklyPlanItemDto] })
  items!: WeeklyPlanItemDto[];

  @ApiProperty({ example: '2026-05-09T10:00:00.000Z' })
  created_at!: string;

  static fromEntity(plan: WeeklyPlan): WeeklyPlanDto {
    const dto = new WeeklyPlanDto();
    dto.id = plan.id;
    dto.student_id = plan.studentId;
    dto.halaqa_id = plan.halaqaId;
    dto.week_start_date = plan.weekStartDate;
    dto.status = plan.status;
    dto.approved_by = plan.approvedBy;
    dto.items = (plan.items ?? []).map(WeeklyPlanItemDto.fromEntity);
    dto.created_at = plan.createdAt.toISOString();
    return dto;
  }
}

export class WeeklyPlanListData {
  @ApiProperty({ type: [WeeklyPlanDto] })
  items!: WeeklyPlanDto[];

  @ApiProperty({ example: 10 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;
}
