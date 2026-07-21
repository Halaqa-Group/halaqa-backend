import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Achievement } from './achievement.entity';
import { AchievementPositionError } from './achievement-position-error.entity';

/**
 * A verse-range position recited/tested within an achievement's range.
 *
 * - `recitation_method = 'full'` → exactly one row spanning the whole achievement range.
 * - `recitation_method = 'test'` → one row per tested position, each within the range.
 *
 * The count columns are a denormalized roll-up of the position's `errors` per
 * `error_type`; the achievement's own counts are the SUM across its positions.
 * Ranges are descriptive metadata only — they do NOT affect `percentage_score`
 * or reconciliation.
 */
@Entity('achievement_recitation_positions')
@Index('idx_recitation_position_achievement', ['achievementId'])
export class AchievementRecitationPosition {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ name: 'achievement_id', type: 'bigint' })
  achievementId!: number;

  @Column({ name: 'start_surah', type: 'smallint', unsigned: true })
  startSurah!: number;

  @Column({ name: 'start_verse', type: 'smallint', unsigned: true })
  startVerse!: number;

  @Column({ name: 'end_surah', type: 'smallint', unsigned: true })
  endSurah!: number;

  @Column({ name: 'end_verse', type: 'smallint', unsigned: true })
  endVerse!: number;

  @Column({ name: 'mistakes_count', type: 'int', unsigned: true, default: 0 })
  mistakesCount!: number;

  @Column({ name: 'warnings_count', type: 'int', unsigned: true, default: 0 })
  warningsCount!: number;

  @Column({
    name: 'tajweed_errors_count',
    type: 'int',
    unsigned: true,
    default: 0,
  })
  tajweedErrorsCount!: number;

  @Column({
    name: 'harakat_errors_count',
    type: 'int',
    unsigned: true,
    default: 0,
  })
  harakatErrorsCount!: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @ManyToOne(() => Achievement, (a) => a.recitationPositions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'achievement_id' })
  achievement!: Relation<Achievement>;

  @OneToMany(() => AchievementPositionError, (e) => e.position)
  errors!: Relation<AchievementPositionError[]>;
}
