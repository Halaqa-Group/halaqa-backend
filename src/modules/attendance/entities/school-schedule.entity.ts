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
import { School } from '../../tenant/school.entity';

/**
 * Which weekdays the school operates, effective-dated so the timetable can
 * change over time. A day is a "school day" when a row exists whose
 * `[effective_from, effective_to]` window covers the date.
 *
 * Day convention: 0 = Saturday … 6 = Friday (Arab calendar order).
 * WEEKDAY(d) → this convention: (WEEKDAY(d) + 2) % 7.
 */
@Entity('school_schedules')
@Index('idx_ss_school_eff', ['schoolId', 'effectiveFrom', 'effectiveTo'])
@Index('idx_ss_day', ['schoolId', 'dayOfWeek'])
export class SchoolSchedule {
  @PrimaryGeneratedColumn({ type: 'int' })
  id!: number;

  @Column({ name: 'school_id', type: 'int' })
  schoolId!: number;

  @Column({ name: 'day_of_week', type: 'tinyint' })
  dayOfWeek!: number;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom!: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo!: string | null;

  @Column({ name: 'created_by', type: 'int', nullable: true })
  createdBy!: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  notes!: string | null;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'school_id' })
  school!: Relation<School>;
}
