import { ApiProperty } from '@nestjs/swagger';
import { globalToVerse } from '../../../quran/page-coverage';
import type { AchievementPlanItemLink } from '../entities/achievement-plan-item-link.entity';
import type { Achievement } from '../entities/achievement.entity';
import type { WeeklyPlanItem } from '../entities/weekly-plan-item.entity';

/**
 * The crediting achievement itself — its **own** recorded range, which is usually
 * wider than the credited span (the part that fell inside the plan item). Sent so
 * a client can show "recited X→Y, credited X→Z" without a second request, and
 * without ever inferring the link from ranges.
 */
export class LinkedAchievementDto {
  @ApiProperty({ example: 812 })
  id!: number;

  @ApiProperty({ format: 'date', example: '2026-08-03' })
  date!: string;

  @ApiProperty({ example: 58 })
  start_surah!: number;

  @ApiProperty({ example: 1 })
  start_verse!: number;

  @ApiProperty({ example: 66 })
  end_surah!: number;

  @ApiProperty({ example: 12 })
  end_verse!: number;

  @ApiProperty({ example: 100 })
  percentage_score!: number;

  static fromEntity(a: Achievement): LinkedAchievementDto {
    const dto = new LinkedAchievementDto();
    dto.id = a.id;
    dto.date = a.date;
    dto.start_surah = a.startSurah;
    dto.start_verse = a.startVerse;
    dto.end_surah = a.endSurah;
    dto.end_verse = a.endVerse;
    dto.percentage_score = Number(a.percentageScore);
    return dto;
  }
}

/**
 * One materialized settlement row: "this achievement credited this verse span of
 * this plan item". Written only by `PlanReconciliationService`; never derived by
 * a client. The verse fields describe the **credited span** — the intersection
 * that was actually counted — not the achievement's full range.
 */
export class PlanLinkDto {
  @ApiProperty({ example: 91 })
  id!: number;

  @ApiProperty({ example: 12 })
  weekly_plan_id!: number;

  @ApiProperty({
    nullable: true,
    example: 44,
    description:
      'NULL means the span was recited but planned by no item of that track ' +
      'in that week ("outside plan"). Never render such a row under an item.',
  })
  weekly_plan_item_id!: number | null;

  @ApiProperty({ enum: ['Hifz', 'Near', 'Far'], example: 'Far' })
  track_type!: string;

  @ApiProperty({
    nullable: true,
    example: 2,
    description: "The credited item's day (0=Saturday). NULL for outside-plan.",
  })
  plan_day_of_week!: number | null;

  @ApiProperty({ example: 812 })
  achievement_id!: number;

  @ApiProperty({
    format: 'date',
    example: '2026-08-03',
    description:
      "The achievement's own date — may differ from the item's planned day.",
  })
  achievement_date!: string;

  @ApiProperty({ example: 58, description: 'Credited span — start.' })
  start_surah!: number;

  @ApiProperty({ example: 1 })
  start_verse!: number;

  @ApiProperty({ example: 66, description: 'Credited span — end.' })
  end_surah!: number;

  @ApiProperty({ example: 12 })
  end_verse!: number;

  @ApiProperty({ example: 5127 })
  start_global_ayah!: number;

  @ApiProperty({ example: 5263 })
  end_global_ayah!: number;

  @ApiProperty({ example: 137 })
  credited_verses!: number;

  @ApiProperty({ example: 20.25 })
  credited_pages!: number;

  @ApiProperty({
    example: 100,
    description: "The crediting achievement's score at settlement time.",
  })
  percentage_score!: number;

  @ApiProperty({
    type: LinkedAchievementDto,
    nullable: true,
    description: 'NULL only if the achievement row has since vanished.',
  })
  achievement!: LinkedAchievementDto | null;

  static fromEntity(
    link: AchievementPlanItemLink,
    achievement?: Achievement,
  ): PlanLinkDto {
    const start = globalToVerse(link.startGlobalAyah);
    const end = globalToVerse(link.endGlobalAyah);

    const dto = new PlanLinkDto();
    dto.id = link.id;
    dto.weekly_plan_id = link.weeklyPlanId;
    dto.weekly_plan_item_id = link.weeklyPlanItemId;
    dto.track_type = link.trackType;
    dto.plan_day_of_week = link.planDayOfWeek;
    dto.achievement_id = link.achievementId;
    dto.achievement_date = link.achievementDate;
    dto.start_surah = start.surah;
    dto.start_verse = start.verse;
    dto.end_surah = end.surah;
    dto.end_verse = end.verse;
    dto.start_global_ayah = link.startGlobalAyah;
    dto.end_global_ayah = link.endGlobalAyah;
    dto.credited_verses = link.creditedVerses;
    dto.credited_pages = Number(link.creditedPages);
    dto.percentage_score = Number(link.percentageScore);
    dto.achievement = achievement
      ? LinkedAchievementDto.fromEntity(achievement)
      : null;
    return dto;
  }
}

/**
 * A whole plan's settlement, split so that outside-plan spans can't be rendered
 * under an item by accident — the one mistake a client deriving links makes.
 */
export class PlanLinksData {
  @ApiProperty({ example: 12 })
  weekly_plan_id!: number;

  @ApiProperty({
    type: [PlanLinkDto],
    description:
      'Rows credited to an item; `weekly_plan_item_id` is always set. ' +
      'Group by it to render per item.',
  })
  links!: PlanLinkDto[];

  @ApiProperty({
    type: [PlanLinkDto],
    description:
      'Recited but planned by no item that week; `weekly_plan_item_id` is ' +
      'always null. Belongs to the week, not to any single item or day.',
  })
  outside_plan!: PlanLinkDto[];
}

/** One item's settlement. `sum(links[].credited_verses) === achieved_verses`. */
export class PlanItemLinksData {
  @ApiProperty({ example: 44 })
  weekly_plan_item_id!: number;

  @ApiProperty({ example: 12 })
  weekly_plan_id!: number;

  @ApiProperty({ example: 137 })
  total_verses!: number;

  @ApiProperty({
    example: 137,
    description: 'Always equals the sum of `links[].credited_verses`.',
  })
  achieved_verses!: number;

  @ApiProperty({ enum: ['due', 'overdue', 'partial', 'completed'] })
  status!: string;

  @ApiProperty({ type: [PlanLinkDto] })
  links!: PlanLinkDto[];

  static fromEntity(
    item: WeeklyPlanItem,
    links: PlanLinkDto[],
  ): PlanItemLinksData {
    const dto = new PlanItemLinksData();
    dto.weekly_plan_item_id = item.id;
    dto.weekly_plan_id = item.weeklyPlanId;
    dto.total_verses = item.totalVerses;
    dto.achieved_verses = item.achievedVerses;
    dto.status = item.status;
    dto.links = links;
    return dto;
  }
}
