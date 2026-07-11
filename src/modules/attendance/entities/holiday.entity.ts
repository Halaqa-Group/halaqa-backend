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
 * School-wide holidays. A date with a holiday row is never a "school day", so
 * the seeding cron skips it and no attendance is expected.
 */
@Entity('holidays')
@Index('uk_holiday_school_date', ['schoolId', 'holidayDate'], { unique: true })
export class Holiday {
  @PrimaryGeneratedColumn({ type: 'int' })
  id!: number;

  @Column({ name: 'school_id', type: 'int' })
  schoolId!: number;

  @Column({ name: 'holiday_date', type: 'date' })
  holidayDate!: string;

  @Column({ type: 'varchar', length: 200 })
  description!: string;

  @Column({ name: 'created_by', type: 'int', nullable: true })
  createdBy!: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'school_id' })
  school!: Relation<School>;
}
