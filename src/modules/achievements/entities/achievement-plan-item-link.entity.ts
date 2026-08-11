import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { TrackType } from './achievement.entity';

/**
 * The materialized settlement between an approved achievement and the plan item
 * it credited — the single source of truth for "which achievement covered which
 * part of which plan item".
 *
 * Rows are written wholesale by `PlanReconciliationService.reconcilePlan`: every
 * run deletes the plan's rows and re-inserts them, so editing a plan item (even
 * moving it to another day) reshapes the week's links instead of leaving
 * achievements bound to the item's old range. The daily report only ever *reads*
 * these rows; it does not re-match ranges.
 *
 * `weeklyPlanItemId` is NULL for the portion of an achievement that fell outside
 * every plan item of its track in that week ("outside plan" recitation).
 *
 * Segments of one (plan item, achievement) pair are disjoint, so `creditedVerses`
 * and `creditedPages` sum exactly across rows with no double counting.
 */
@Entity('achievement_plan_item_links')
@Index('idx_apil_plan', ['weeklyPlanId'])
@Index('idx_apil_item', ['weeklyPlanItemId'])
@Index('idx_apil_achievement', ['achievementId'])
@Index('idx_apil_student_date', ['studentId', 'achievementDate'])
export class AchievementPlanItemLink {
  // Types mirror the referenced primary keys exactly — weekly_plans.id and
  // weekly_plan_items.id are INT UNSIGNED, achievements.id is BIGINT UNSIGNED.
  // MySQL refuses the foreign keys otherwise.
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: number;

  @Column({ name: 'weekly_plan_id', type: 'int', unsigned: true })
  weeklyPlanId!: number;

  /** NULL = this segment fell outside every plan item of the track that week. */
  @Column({
    name: 'weekly_plan_item_id',
    type: 'int',
    unsigned: true,
    nullable: true,
  })
  weeklyPlanItemId!: number | null;

  @Column({ name: 'achievement_id', type: 'bigint', unsigned: true })
  achievementId!: number;

  @Column({ name: 'student_id', type: 'int' })
  studentId!: number;

  @Column({ name: 'track_type', type: 'enum', enum: ['Hifz', 'Near', 'Far'] })
  trackType!: TrackType;

  /** The achievement's own date — may differ from the item's planned day. */
  @Column({ name: 'achievement_date', type: 'date' })
  achievementDate!: string;

  /** Day of the credited plan item (0 = Saturday). NULL for outside-plan rows. */
  @Column({
    name: 'plan_day_of_week',
    type: 'tinyint',
    unsigned: true,
    nullable: true,
  })
  planDayOfWeek!: number | null;

  @Column({ name: 'start_global_ayah', type: 'int', unsigned: true })
  startGlobalAyah!: number;

  @Column({ name: 'end_global_ayah', type: 'int', unsigned: true })
  endGlobalAyah!: number;

  @Column({ name: 'credited_verses', type: 'int', unsigned: true })
  creditedVerses!: number;

  @Column({
    name: 'credited_pages',
    type: 'decimal',
    precision: 8,
    scale: 4,
    default: 0,
  })
  creditedPages!: number;

  /** The crediting achievement's `percentage_score`, denormalized for quality math. */
  @Column({
    name: 'percentage_score',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
  })
  percentageScore!: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;
}
