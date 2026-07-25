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
import { Halaqa } from '../../halaqat/entities/halaqa.entity';
import { School } from '../../tenant/school.entity';

export type DayStatus = 'working_day' | 'non_working_day';
export type ReportStatus = 'complete' | 'partial' | 'failed';

/**
 * Header row of a saved daily evaluation report — one per (halaqa, date) (§25).
 * Recalculation replaces this row in place; it never creates a second version
 * (§28.4). A snapshot of the weights used at calculation time is stored here so
 * historical reports stay reproducible even if the halaqa weights change later.
 */
@Entity('daily_halaqa_reports')
@Index('uk_daily_halaqa_report', ['halaqaId', 'reportDate'], { unique: true })
@Index('idx_daily_report_school_date', ['schoolId', 'reportDate'])
@Index('idx_daily_report_halaqa_date', ['halaqaId', 'reportDate'])
export class DailyHalaqaReport {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ name: 'school_id', type: 'int' })
  schoolId!: number;

  @Column({ name: 'halaqa_id', type: 'int' })
  halaqaId!: number;

  @Column({ name: 'report_date', type: 'date' })
  reportDate!: string;

  @Column({
    name: 'day_status',
    type: 'enum',
    enum: ['working_day', 'non_working_day'],
  })
  dayStatus!: DayStatus;

  @Column({
    name: 'report_status',
    type: 'enum',
    enum: ['complete', 'partial', 'failed'],
  })
  reportStatus!: ReportStatus;

  // Snapshot of the weights used at calculation time (DECIMAL → string on read).
  @Column({ name: 'hifz_weight', type: 'decimal', precision: 5, scale: 2 })
  hifzWeight!: number;

  @Column({ name: 'near_weight', type: 'decimal', precision: 5, scale: 2 })
  nearWeight!: number;

  @Column({ name: 'far_weight', type: 'decimal', precision: 5, scale: 2 })
  farWeight!: number;

  @Column({ name: 'ethics_weight', type: 'decimal', precision: 5, scale: 2 })
  ethicsWeight!: number;

  @Column({ name: 'academic_weight', type: 'decimal', precision: 5, scale: 2 })
  academicWeight!: number;

  @Column({ name: 'calculation_version', type: 'varchar', length: 30 })
  calculationVersion!: string;

  @Column({ name: 'generated_at', type: 'datetime', precision: 6 })
  generatedAt!: Date;

  @Column({ name: 'generated_by', type: 'int', nullable: true })
  generatedBy!: number | null;

  @Column({
    name: 'recalculated_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  recalculatedAt!: Date | null;

  @Column({ name: 'recalculated_by', type: 'int', nullable: true })
  recalculatedBy!: number | null;

  @Column({
    name: 'recalculation_reason',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  recalculationReason!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt!: Date;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'school_id' })
  school!: Relation<School>;

  @ManyToOne(() => Halaqa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'halaqa_id' })
  halaqa!: Relation<Halaqa>;
}
