import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Student } from '../../students/entities/student.entity';
import { User } from '../../users/entities/user.entity';
import { Halaqa } from './halaqa.entity';

export type HalaqaActivityAction =
  | 'halaqa_created'
  | 'halaqa_updated'
  | 'halaqa_archived'
  | 'halaqa_completed'
  | 'halaqa_restored'
  | 'teacher_assigned'
  | 'teacher_unassigned'
  | 'teacher_role_changed'
  | 'acting_started'
  | 'acting_extended'
  | 'acting_ended'
  | 'student_enrolled'
  | 'student_re_enrolled'
  | 'student_unenrolled'
  | 'student_transferred_in'
  | 'student_transferred_out'
  | 'student_completed'
  | 'supervisor_assigned'
  | 'supervisor_unassigned'
  | 'schedule_updated';

@Entity('halaqa_activity_logs')
@Index('idx_hal_school_time', ['schoolId', 'createdAt'])
@Index('idx_hal_halaqa_time', ['halaqaId', 'createdAt'])
@Index('idx_hal_student_time', ['targetStudentId', 'createdAt'])
@Index('idx_hal_action_time', ['action', 'createdAt'])
export class HalaqaActivityLog {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'school_id', type: 'int' })
  schoolId!: number;

  @Column({ name: 'halaqa_id', type: 'int', nullable: true })
  halaqaId!: number | null;

  @Column({
    type: 'enum',
    enum: [
      'halaqa_created',
      'halaqa_updated',
      'halaqa_archived',
      'halaqa_completed',
      'halaqa_restored',
      'teacher_assigned',
      'teacher_unassigned',
      'teacher_role_changed',
      'acting_started',
      'acting_extended',
      'acting_ended',
      'student_enrolled',
      'student_re_enrolled',
      'student_unenrolled',
      'student_transferred_in',
      'student_transferred_out',
      'student_completed',
      'supervisor_assigned',
      'supervisor_unassigned',
      'schedule_updated',
    ],
  })
  action!: HalaqaActivityAction;

  @Column({ name: 'actor_user_id', type: 'int', nullable: true })
  actorUserId!: number | null;

  @Column({ name: 'target_user_id', type: 'int', nullable: true })
  targetUserId!: number | null;

  @Column({ name: 'target_student_id', type: 'int', nullable: true })
  targetStudentId!: number | null;

  @Column({ name: 'from_halaqa_id', type: 'int', nullable: true })
  fromHalaqaId!: number | null;

  @Column({ name: 'to_halaqa_id', type: 'int', nullable: true })
  toHalaqaId!: number | null;

  @Column({ type: 'json', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @ManyToOne(() => Halaqa, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'halaqa_id' })
  halaqa!: Halaqa | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'actor_user_id' })
  actor!: User | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'target_user_id' })
  targetUser!: User | null;

  @ManyToOne(() => Student, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'target_student_id' })
  targetStudent!: Student | null;

  @ManyToOne(() => Halaqa, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'from_halaqa_id' })
  fromHalaqa!: Halaqa | null;

  @ManyToOne(() => Halaqa, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'to_halaqa_id' })
  toHalaqa!: Halaqa | null;
}
