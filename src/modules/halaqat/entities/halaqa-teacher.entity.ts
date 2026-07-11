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
import { User } from '../../users/entities/user.entity';
import { Halaqa } from './halaqa.entity';

export type TeacherRole = 'main' | 'assistant' | 'substitute';
export type EndReason =
  | 'reassigned'
  | 'left_school'
  | 'vacation'
  | 'retired'
  | 'other';

// idx_one_active_assignment, idx_one_main_per_halaqa, idx_one_acting_per_halaqa
// are UNIQUE indexes on virtual generated columns — managed by migration only.
@Entity('halaqa_teachers')
@Index('idx_ht_halaqa_active', ['halaqaId', 'endDate'])
@Index('idx_ht_teacher_active', ['teacherUserId', 'endDate'])
export class HalaqaTeacher {
  @PrimaryGeneratedColumn({ type: 'int' })
  id!: number;

  @Column({ name: 'halaqa_id', type: 'int' })
  halaqaId!: number;

  @Column({ name: 'teacher_user_id', type: 'int' })
  teacherUserId!: number;

  @Column({
    type: 'enum',
    enum: ['main', 'assistant', 'substitute'],
    default: 'main',
  })
  role!: TeacherRole;

  @Column({ name: 'acting_as_primary', type: 'boolean', default: false })
  actingAsPrimary!: boolean;

  // DATE columns are returned as 'YYYY-MM-DD' strings by the MySQL driver.
  @Column({ name: 'acting_starts_at', type: 'date', nullable: true })
  actingStartsAt!: string | null;

  @Column({ name: 'acting_ends_at', type: 'date', nullable: true })
  actingEndsAt!: string | null;

  @Column({ name: 'start_date', type: 'date' })
  startDate!: string;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate!: string | null;

  @Column({
    name: 'end_reason',
    type: 'enum',
    enum: ['reassigned', 'left_school', 'vacation', 'retired', 'other'],
    nullable: true,
  })
  endReason!: EndReason | null;

  // Scalar FK — use assignedBy for the integer, assigner for the relation.
  @Column({ name: 'assigned_by', type: 'int', nullable: true })
  assignedBy!: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt!: Date;

  @ManyToOne(() => Halaqa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'halaqa_id' })
  halaqa!: Relation<Halaqa>;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'teacher_user_id' })
  teacher!: Relation<User>;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'assigned_by' })
  assigner!: Relation<User> | null;
}
