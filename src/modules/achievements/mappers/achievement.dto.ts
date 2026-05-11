import { ApiProperty } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { Achievement } from '../entities/achievement.entity';

export class AchievementDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 42 })
  student_id!: number;

  @ApiProperty({ example: 3 })
  halaqa_id!: number;

  @ApiProperty({ format: 'date', example: '2026-05-11' })
  date!: string;

  @ApiProperty({ enum: ['Hifz', 'Near', 'Far'], example: 'Hifz' })
  track_type!: string;

  @ApiProperty({ example: 1 })
  start_surah!: number;

  @ApiProperty({ example: 1 })
  start_verse!: number;

  @ApiProperty({ example: 2 })
  end_surah!: number;

  @ApiProperty({ example: 7 })
  end_verse!: number;

  @ApiProperty({ required: false, example: 2, nullable: true, description: 'Hidden for parent role.' })
  mistakes_count?: number | null;

  @ApiProperty({ required: false, example: 1, nullable: true, description: 'Hidden for parent role.' })
  warnings_count?: number | null;

  @ApiProperty({ required: false, example: 0, nullable: true, description: 'Hidden for parent role.' })
  tajweed_errors_count?: number | null;

  @ApiProperty({ example: '95.50', description: 'Computed percentage score (2 decimal places).' })
  percentage_score!: string;

  @ApiProperty({ enum: ['approved', 'unapproved'], example: 'unapproved' })
  status!: string;

  @ApiProperty({ required: false, nullable: true, example: 'Ahmad Ali', description: 'Hidden for parent role.' })
  recorded_by_name?: string | null;

  @ApiProperty({ required: false, nullable: true, example: 'Ahmad Ali', description: 'Hidden for parent role.' })
  approved_by_name?: string | null;

  @ApiProperty({ required: false, nullable: true, example: '2026-05-11T12:00:00.000Z', description: 'Hidden for parent role.' })
  approved_at?: string | null;

  @ApiProperty({ nullable: true, example: 'Strong on the last 3 verses.' })
  teacher_notes!: string | null;

  @ApiProperty({ example: '2026-05-11T10:00:00.000Z' })
  created_at!: string;

  static fromEntity(
    entity: Achievement,
    actor: AuthenticatedUser,
    userMap?: Map<number, string>,
  ): AchievementDto {
    const isParent =
      actor.roles.some((r) => r.slug === 'parent') &&
      !actor.roles.some((r) => r.slug === 'principal' || r.slug === 'vice_principal');

    const dto = new AchievementDto();
    dto.id = entity.id;
    dto.student_id = entity.studentId;
    dto.halaqa_id = entity.halaqaId;
    dto.date = entity.date;
    dto.track_type = entity.trackType;
    dto.start_surah = entity.startSurah;
    dto.start_verse = entity.startVerse;
    dto.end_surah = entity.endSurah;
    dto.end_verse = entity.endVerse;
    dto.percentage_score = Number(entity.percentageScore).toFixed(2);
    dto.status = entity.status;
    dto.teacher_notes = entity.teacherNotes;
    dto.created_at = entity.createdAt.toISOString();

    if (!isParent) {
      dto.mistakes_count = entity.mistakesCount;
      dto.warnings_count = entity.warningsCount;
      dto.tajweed_errors_count = entity.tajweedErrorsCount;
      dto.recorded_by_name = userMap?.get(entity.recordedBy) ?? null;
      dto.approved_by_name = entity.approvedBy ? (userMap?.get(entity.approvedBy) ?? null) : null;
      dto.approved_at = entity.approvedAt ? entity.approvedAt.toISOString() : null;
    }

    return dto;
  }
}

export class AchievementListData {
  @ApiProperty({ type: [AchievementDto] })
  items!: AchievementDto[];

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;
}
