import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { AchievementRecitationPosition } from './achievement-recitation-position.entity';

export type ErrorType = 'mistake' | 'warning' | 'tajweed' | 'harakat';

/**
 * A single error occurrence within a recitation position, located at a QUL word
 * span. `surah/ayah/juz/hizb` are denormalized from QUL (supplied by the client
 * at capture time) for cheap reporting; `school_id/student_id/date` are
 * denormalized from the owning achievement (never FK'd — they never change).
 *
 * The position's error counts are the roll-up of these rows per `error_type`.
 * Rows cascade-delete with their position (positions are delete-all-then-insert
 * on regeneration).
 */
@Entity('achievement_position_errors')
@Index('idx_position_error_position', ['positionId'])
@Index('idx_position_error_student', ['studentId', 'errorType', 'date'])
@Index('idx_position_error_location', ['schoolId', 'surah', 'ayah'])
@Index('idx_position_error_word', ['schoolId', 'startWordId'])
export class AchievementPositionError {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: number;

  @Column({ name: 'position_id', type: 'bigint', unsigned: true })
  positionId!: number;

  @Column({
    name: 'error_type',
    type: 'enum',
    enum: ['mistake', 'warning', 'tajweed', 'harakat'],
  })
  errorType!: ErrorType;

  @Column({ name: 'start_word_id', type: 'int', unsigned: true })
  startWordId!: number;

  @Column({ name: 'end_word_id', type: 'int', unsigned: true })
  endWordId!: number;

  @Column({ type: 'smallint', unsigned: true })
  surah!: number;

  @Column({ type: 'smallint', unsigned: true })
  ayah!: number;

  @Column({ type: 'smallint', unsigned: true })
  juz!: number;

  @Column({ type: 'smallint', unsigned: true })
  hizb!: number;

  // Denormalized from the owning achievement — constant, no FK.
  @Column({ name: 'school_id', type: 'int' })
  schoolId!: number;

  @Column({ name: 'student_id', type: 'int' })
  studentId!: number;

  @Column({ type: 'date' })
  date!: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @ManyToOne(() => AchievementRecitationPosition, (p) => p.errors, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'position_id' })
  position!: Relation<AchievementRecitationPosition>;
}
