import { ApiProperty } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { AchievementPositionError } from '../entities/achievement-position-error.entity';
import type { AchievementRecitationPosition } from '../entities/achievement-recitation-position.entity';
import type { Achievement } from '../entities/achievement.entity';

export class PositionErrorDtoOut {
  @ApiProperty({
    enum: ['mistake', 'warning', 'tajweed', 'harakat'],
    example: 'mistake',
  })
  error_type!: string;

  @ApiProperty({ example: 152 })
  start_word_id!: number;

  @ApiProperty({ example: 154 })
  end_word_id!: number;

  @ApiProperty({ example: 2 })
  surah!: number;

  @ApiProperty({ example: 5 })
  ayah!: number;

  @ApiProperty({ example: 1 })
  juz!: number;

  @ApiProperty({ example: 1 })
  hizb!: number;

  static fromEntity(e: AchievementPositionError): PositionErrorDtoOut {
    const dto = new PositionErrorDtoOut();
    dto.error_type = e.errorType;
    dto.start_word_id = e.startWordId;
    dto.end_word_id = e.endWordId;
    dto.surah = e.surah;
    dto.ayah = e.ayah;
    dto.juz = e.juz;
    dto.hizb = e.hizb;
    return dto;
  }
}

export class RecitationPositionDto {
  @ApiProperty({ example: 2 })
  start_surah!: number;

  @ApiProperty({ example: 1 })
  start_verse!: number;

  @ApiProperty({ example: 2 })
  end_surah!: number;

  @ApiProperty({ example: 5 })
  end_verse!: number;

  @ApiProperty({
    required: false,
    example: 1,
    description: 'Derived from `errors`. Hidden for parent role.',
  })
  mistakes_count?: number;

  @ApiProperty({
    required: false,
    example: 1,
    description: 'Derived from `errors`. Hidden for parent role.',
  })
  warnings_count?: number;

  @ApiProperty({
    required: false,
    example: 0,
    description: 'Derived from `errors`. Hidden for parent role.',
  })
  tajweed_errors_count?: number;

  @ApiProperty({
    required: false,
    example: 2,
    description:
      'Harakat (حركات) errors, derived from `errors`. Hidden for parent role.',
  })
  harakat_errors_count?: number;

  @ApiProperty({
    required: false,
    type: [PositionErrorDtoOut],
    description: 'Itemized errors at this position. Hidden for parent role.',
  })
  errors?: PositionErrorDtoOut[];

  static fromEntity(
    p: AchievementRecitationPosition,
    isParent = false,
  ): RecitationPositionDto {
    const dto = new RecitationPositionDto();
    dto.start_surah = p.startSurah;
    dto.start_verse = p.startVerse;
    dto.end_surah = p.endSurah;
    dto.end_verse = p.endVerse;

    // Parents see where their child recited, not the error breakdown.
    if (!isParent) {
      dto.mistakes_count = p.mistakesCount;
      dto.warnings_count = p.warningsCount;
      dto.tajweed_errors_count = p.tajweedErrorsCount;
      dto.harakat_errors_count = p.harakatErrorsCount;
      dto.errors = (p.errors ?? []).map((e) =>
        PositionErrorDtoOut.fromEntity(e),
      );
    }

    return dto;
  }
}

export class AchievementDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 42 })
  student_id!: number;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'Yusuf Ahmad',
    description: "Student's name (denormalized for display).",
  })
  student_name?: string | null;

  @ApiProperty({ example: 3 })
  halaqa_id!: number;

  @ApiProperty({ format: 'date', example: '2026-05-11' })
  date!: string;

  @ApiProperty({ enum: ['Hifz', 'Near', 'Far'], example: 'Hifz' })
  track_type!: string;

  @ApiProperty({ enum: ['quick', 'mushaf'], example: 'quick' })
  completion_method!: string;

  @ApiProperty({ enum: ['full', 'test'], example: 'full' })
  recitation_method!: string;

  @ApiProperty({
    type: [RecitationPositionDto],
    description:
      'Recited/tested positions. One full-range row for `full`; one per tested position for `test`.',
  })
  recitation_positions!: RecitationPositionDto[];

  @ApiProperty({ example: 1 })
  start_surah!: number;

  @ApiProperty({ example: 1 })
  start_verse!: number;

  @ApiProperty({ example: 2 })
  end_surah!: number;

  @ApiProperty({ example: 7 })
  end_verse!: number;

  @ApiProperty({
    required: false,
    example: 2,
    nullable: true,
    description: 'Hidden for parent role.',
  })
  mistakes_count?: number | null;

  @ApiProperty({
    required: false,
    example: 1,
    nullable: true,
    description: 'Hidden for parent role.',
  })
  warnings_count?: number | null;

  @ApiProperty({
    required: false,
    example: 0,
    nullable: true,
    description: 'Hidden for parent role.',
  })
  tajweed_errors_count?: number | null;

  @ApiProperty({
    required: false,
    example: 3,
    nullable: true,
    description:
      'Total harakat (حركات) errors across all positions. Hidden for parent role.',
  })
  harakat_errors_count?: number | null;

  @ApiProperty({
    example: '95.50',
    description: 'Computed percentage score (2 decimal places).',
  })
  percentage_score!: string;

  @ApiProperty({ enum: ['approved', 'unapproved'], example: 'unapproved' })
  status!: string;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'Ahmad Ali',
    description: 'Hidden for parent role.',
  })
  recorded_by_name?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'Ahmad Ali',
    description: 'Hidden for parent role.',
  })
  approved_by_name?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    example: '2026-05-11T12:00:00.000Z',
    description: 'Hidden for parent role.',
  })
  approved_at?: string | null;

  @ApiProperty({ nullable: true, example: 'Strong on the last 3 verses.' })
  teacher_notes!: string | null;

  @ApiProperty({ example: '2026-05-11T10:00:00.000Z' })
  created_at!: string;

  static fromEntity(
    entity: Achievement,
    actor: AuthenticatedUser,
    userMap?: Map<number, string>,
    positions?: AchievementRecitationPosition[],
    studentMap?: Map<number, string>,
  ): AchievementDto {
    const isParent =
      actor.roles.some((r) => r.slug === 'parent') &&
      !actor.roles.some(
        (r) => r.slug === 'principal' || r.slug === 'vice_principal',
      );

    const dto = new AchievementDto();
    dto.id = entity.id;
    dto.student_id = entity.studentId;
    // Visible to every role (a parent sees their own child's name).
    dto.student_name = studentMap?.get(entity.studentId) ?? null;
    dto.halaqa_id = entity.halaqaId;
    dto.date = entity.date;
    dto.track_type = entity.trackType;
    dto.completion_method = entity.completionMethod;
    dto.recitation_method = entity.recitationMethod;
    dto.recitation_positions = (
      positions ??
      entity.recitationPositions ??
      []
    ).map((p) => RecitationPositionDto.fromEntity(p, isParent));
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
      dto.harakat_errors_count = entity.harakatErrorsCount;
      dto.recorded_by_name = userMap?.get(entity.recordedBy) ?? null;
      dto.approved_by_name = entity.approvedBy
        ? (userMap?.get(entity.approvedBy) ?? null)
        : null;
      dto.approved_at = entity.approvedAt
        ? entity.approvedAt.toISOString()
        : null;
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
