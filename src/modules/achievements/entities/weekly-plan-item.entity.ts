import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import type { TrackType } from './achievement.entity';
import { WeeklyPlan } from './weekly-plan.entity';

export type PlanItemStatus = 'due' | 'overdue' | 'partial' | 'completed';

@Entity('weekly_plan_items')
export class WeeklyPlanItem {
  @PrimaryGeneratedColumn({ type: 'int' })
  id!: number;

  @Column({ name: 'weekly_plan_id', type: 'int' })
  weeklyPlanId!: number;

  @Column({
    name: 'track_type',
    type: 'enum',
    enum: ['Hifz', 'Near', 'Far'],
  })
  trackType!: TrackType;

  // 0 = Saturday … 6 = Friday (matches halaqa_schedules.day_of_week)
  @Column({ name: 'day_of_week', type: 'tinyint', unsigned: true })
  dayOfWeek!: number;

  // Reconciliation priority tie-breaker within the same day_of_week + track_type.
  // Lower value = higher priority (claims shared verses first). Defaults to 0.
  @Column({ name: 'order', type: 'int', unsigned: true, default: 0 })
  order!: number;

  @Column({ name: 'start_surah', type: 'smallint', unsigned: true })
  startSurah!: number;

  @Column({ name: 'start_verse', type: 'smallint', unsigned: true })
  startVerse!: number;

  @Column({ name: 'end_surah', type: 'smallint', unsigned: true })
  endSurah!: number;

  @Column({ name: 'end_verse', type: 'smallint', unsigned: true })
  endVerse!: number;

  @Column({ name: 'total_verses', type: 'int', unsigned: true })
  totalVerses!: number;

  @Column({ name: 'achieved_verses', type: 'int', unsigned: true, default: 0 })
  achievedVerses!: number;

  @Column({
    type: 'enum',
    enum: ['due', 'overdue', 'partial', 'completed'],
    default: 'due',
  })
  status!: PlanItemStatus;

  // Permanently set to 1 once a range edit is made after item creation.
  @Column({ name: 'is_manual_override', type: 'tinyint', width: 1, unsigned: true, default: 0 })
  isManualOverride!: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt!: Date;

  @ManyToOne(() => WeeklyPlan, (plan) => plan.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'weekly_plan_id' })
  weeklyPlan!: Relation<WeeklyPlan>;
}
