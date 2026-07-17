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
// How it was recited: the whole range in one go vs. tested at chosen positions.
export type RecitationMethod = 'full' | 'test';

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
    enum: ['full', 'test'],
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
  // columns below are the roll-up totals — always SUM(positions), never set directly.
  @Column({ name: 'mistakes_count', type: 'int', unsigned: true, default: 0 })
  mistakesCount!: number;

  @Column({ name: 'warnings_count', type: 'int', unsigned: true, default: 0 })
  warningsCount!: number;

  @Column({ name: 'tajweed_errors_count', type: 'int', unsigned: true, default: 0 })
  tajweedErrorsCount!: number;

  @Column({ name: 'harakat_errors_count', type: 'int', unsigned: true, default: 0 })
  harakatErrorsCount!: number;

  @Column({ name: 'percentage_score', type: 'decimal', precision: 5, scale: 2 })
  percentageScore!: number;

  @Column({
    type: 'enum',
    enum: ['approved', 'unapproved'],
    default: 'unapproved',
  })
  status!: AchievementStatus;

  @Column({ name: 'approved_by', type: 'int', nullable: true })
  approvedBy!: number | null;

  @Column({ name: 'approved_at', type: 'datetime', precision: 6, nullable: true })
  approvedAt!: Date | null;

  @Column({ name: 'teacher_notes', type: 'text', nullable: true })
  teacherNotes!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'datetime', precision: 6, nullable: true })
  deletedAt!: Date | null;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'school_id' })
  school!: Relation<School>;

  @OneToMany(() => AchievementRecitationPosition, (pos) => pos.achievement)
  recitationPositions!: Relation<AchievementRecitationPosition[]>;
}
