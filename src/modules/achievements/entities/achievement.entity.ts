import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { School } from '../../tenant/school.entity';
import { AchievementRecitationPosition } from './achievement-recitation-position.entity';

export type TrackType = 'Hifz' | 'Near' | 'Far';
export type AchievementStatus = 'approved' | 'unapproved';
// How the achievement was entered: a quick tap vs. picked on the mushaf.
export type CompletionMethod = 'quick' | 'mushaf';
// How it was recited: the whole range in one go, tested at chosen positions, or
// recited without documenting where (`untracked` — no positions, no error rows;
// the teacher supplies the four error counts directly).
export type RecitationMethod = 'full' | 'test' | 'untracked';

@Entity('achievements')
@Index('idx_achievement_lookup', ['studentId', 'halaqaId', 'date', 'trackType'])
export class Achievement {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ name: 'school_id', type: 'int' })
  schoolId!: number;

  @Column({ name: 'student_id', type: 'int' })
  studentId!: number;

  @Column({ name: 'halaqa_id', type: 'int' })
  halaqaId!: number;

  @Column({ name: 'recorded_by', type: 'int' })
  recordedBy!: number;

  @Column({ type: 'date' })
  date!: string;

  @Column({
    name: 'track_type',
    type: 'enum',
    enum: ['Hifz', 'Near', 'Far'],
  })
  trackType!: TrackType;

  @Column({
    name: 'completion_method',
    type: 'enum',
    enum: ['quick', 'mushaf'],
    default: 'quick',
  })
  completionMethod!: CompletionMethod;

  @Column({
    name: 'recitation_method',
    type: 'enum',
    enum: ['full', 'test', 'untracked'],
    default: 'full',
  })
  recitationMethod!: RecitationMethod;

  @Column({ name: 'start_surah', type: 'smallint', unsigned: true })
  startSurah!: number;

  @Column({ name: 'start_verse', type: 'smallint', unsigned: true })
  startVerse!: number;

  @Column({ name: 'end_surah', type: 'smallint', unsigned: true })
  endSurah!: number;

  @Column({ name: 'end_verse', type: 'smallint', unsigned: true })
  endVerse!: number;

  // Error counts are per-position (see AchievementRecitationPosition). The four
  // columns below are the roll-up totals — SUM(positions) for `full` and `test`.
  // The one exception is `untracked`: it has no positions and no error rows, so
  // the teacher's aggregate counts are stored here directly (the count is known,
  // the location is not). Any future backfill that re-derives these from
  // `achievement_position_errors` must exclude `untracked` rows or it zeroes them.
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

  @Column({ name: 'percentage_score', type: 'decimal', precision: 5, scale: 2 })
  percentageScore!: number;

  // `total_pages` is the breadth of the whole [start,end] range (الصفحات الكلية)
  // and is THE volume metric every dashboard KPI sums. The client's value wins;
  // when it sends none the backend derives it from the range via `pageCoverage`,
  // so it is never NULL on rows written after the backfill migration.
  //
  // `positions_pages` is the SUM of the recitation positions' `pages`
  // (صفحات المواضع) — documentation of what was actually recited, not a metric.
  // Equal to `total_pages` for `full`, the tested subset for `test`, and NULL for
  // `untracked` (no positions → genuinely unknown, and nothing reads it as zero).
  @Column({
    name: 'total_pages',
    type: 'decimal',
    precision: 8,
    scale: 4,
    nullable: true,
  })
  totalPages!: number | null;

  @Column({
    name: 'positions_pages',
    type: 'decimal',
    precision: 8,
    scale: 4,
    nullable: true,
  })
  positionsPages!: number | null;

  @Column({
    type: 'enum',
    enum: ['approved', 'unapproved'],
    default: 'unapproved',
  })
  status!: AchievementStatus;

  @Column({ name: 'approved_by', type: 'int', nullable: true })
  approvedBy!: number | null;

  @Column({
    name: 'approved_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  approvedAt!: Date | null;

  @Column({ name: 'teacher_notes', type: 'text', nullable: true })
  teacherNotes!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt!: Date;

  @DeleteDateColumn({
    name: 'deleted_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  deletedAt!: Date | null;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'school_id' })
  school!: Relation<School>;

  @OneToMany(() => AchievementRecitationPosition, (pos) => pos.achievement)
  recitationPositions!: Relation<AchievementRecitationPosition[]>;
}
