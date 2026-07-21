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
import { WeeklyPlanItem } from './weekly-plan-item.entity';

export type WeeklyPlanStatus = 'draft' | 'approved';

@Entity('weekly_plans')
@Index('idx_weekly_plan_unique', ['studentId', 'halaqaId', 'weekStartDate'], {
  unique: true,
})
export class WeeklyPlan {
  @PrimaryGeneratedColumn({ type: 'int' })
  id!: number;

  @Column({ name: 'school_id', type: 'int' })
  schoolId!: number;

  @Column({ name: 'student_id', type: 'int' })
  studentId!: number;

  @Column({ name: 'halaqa_id', type: 'int' })
  halaqaId!: number;

  @Column({ name: 'week_start_date', type: 'date' })
  weekStartDate!: string;

  @Column({
    type: 'enum',
    enum: ['draft', 'approved'],
    default: 'draft',
  })
  status!: WeeklyPlanStatus;

  @Column({ name: 'approved_by', type: 'int', nullable: true })
  approvedBy!: number | null;

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

  @OneToMany(() => WeeklyPlanItem, (item) => item.weeklyPlan, {
    cascade: ['insert'],
  })
  items!: WeeklyPlanItem[];
}
