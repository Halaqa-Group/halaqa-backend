import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { Student } from '../../students/entities/student.entity';
import { Halaqa } from './halaqa.entity';

export type EnrollmentStatus =
  | 'active'
  | 'transferred'
  | 'completed'
  | 'archived';

/**
 * Historical record of a student's membership in a halaqa over time (§8 of the
 * daily evaluation report spec). Unlike `student_halaqa` — which holds only the
 * CURRENT state under a composite `(student_id, halaqa_id)` PK — this table keeps
 * one row per membership *interval*, so a report for any past date can resolve
 * the halaqa the student actually belonged to on that day.
 *
 * Membership on `report_date` holds when:
 *   start_date <= report_date AND (end_date IS NULL OR end_date >= report_date)
 *
 * For the daily report this is the source of truth for historical membership;
 * ongoing enrollment operations in the halaqat module also write here.
 */
@Entity('student_halaqa_enrollments')
@Index('idx_she_student_start', ['studentId', 'startDate'])
@Index('idx_she_halaqa_start', ['halaqaId', 'startDate'])
export class StudentHalaqaEnrollment {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ name: 'student_id', type: 'int' })
  studentId!: number;

  @Column({ name: 'halaqa_id', type: 'int' })
  halaqaId!: number;

  @Column({ name: 'start_date', type: 'date' })
  startDate!: string;

  // NULL = still an open (current) membership interval.
  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate!: string | null;

  @Column({
    type: 'enum',
    enum: ['active', 'transferred', 'completed', 'archived'],
    default: 'active',
  })
  status!: EnrollmentStatus;

  @Column({ name: 'end_reason', type: 'varchar', length: 255, nullable: true })
  endReason!: string | null;

  @Column({ name: 'created_by', type: 'int', nullable: true })
  createdBy!: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt!: Date;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student!: Relation<Student>;

  @ManyToOne(() => Halaqa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'halaqa_id' })
  halaqa!: Relation<Halaqa>;
}
