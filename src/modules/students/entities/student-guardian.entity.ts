import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Student } from './student.entity';

export type GuardianRelation =
  | 'father'
  | 'mother'
  | 'grandfather'
  | 'grandmother'
  | 'uncle'
  | 'aunt'
  | 'sibling'
  | 'other';

@Entity('student_guardians')
@Index('idx_sg_guardian', ['guardianUserId'])
export class StudentGuardian {
  @PrimaryColumn({ name: 'student_id', type: 'int' })
  studentId!: number;

  @PrimaryColumn({ name: 'guardian_user_id', type: 'int' })
  guardianUserId!: number;

  @Column({
    type: 'enum',
    enum: [
      'father',
      'mother',
      'grandfather',
      'grandmother',
      'uncle',
      'aunt',
      'sibling',
      'other',
    ],
  })
  relation!: GuardianRelation;

  @Column({ name: 'is_primary', type: 'tinyint', default: 0 })
  isPrimary!: boolean;

  @Column({ name: 'can_pickup', type: 'tinyint', default: 1 })
  canPickup!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student!: Student;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'guardian_user_id' })
  guardian!: User;
}
