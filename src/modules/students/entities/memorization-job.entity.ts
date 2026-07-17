import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type MemorizationJobStatus =
  | 'pending'
  | 'processing'
  | 'done'
  | 'failed';

/**
 * A durable "recompute this student's memorization bitmap" job. One row per
 * student (unique `student_id`): enqueueing upserts the row back to `pending`,
 * so the table is bounded by the student count and coalesces bursts of
 * achievement changes into a single recompute.
 *
 * Drained by `MemorizationCron` (@nestjs/schedule). Survives restarts — the
 * "queue" is the table, not in-memory state.
 */
@Entity('memorization_jobs')
export class MemorizationJob {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: number;

  @Column({ name: 'student_id', type: 'int', unique: true })
  studentId!: number;

  @Column({
    type: 'enum',
    enum: ['pending', 'processing', 'done', 'failed'],
    default: 'pending',
  })
  status!: MemorizationJobStatus;

  @Column({ type: 'int', unsigned: true, default: 0 })
  attempts!: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt!: Date;

  @Column({
    name: 'processed_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  processedAt!: Date | null;
}
