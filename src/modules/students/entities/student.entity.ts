import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { School } from '../../tenant/school.entity';

export type StudentStatus = 'active' | 'inactive' | 'graduated';
export type StudentGender = 'male' | 'female';

@Entity('students')
@Index('idx_student_school_status', ['schoolId', 'status'])
export class Student {
  @PrimaryGeneratedColumn({ type: 'int' })
  id!: number;

  @Column({ name: 'school_id', type: 'int' })
  schoolId!: number;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'enum', enum: ['male', 'female'] })
  gender!: StudentGender;

  @Column({ type: 'date', nullable: true })
  dob!: Date | null;

  @Column({ name: 'join_date', type: 'date' })
  joinDate!: Date;

  @Column({
    type: 'enum',
    enum: ['active', 'inactive', 'graduated'],
    default: 'active',
  })
  status!: StudentStatus;

  @Column({
    name: 'daily_hifz_pages_capacity',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 1,
  })
  dailyHifzPagesCapacity!: number;

  @Column({
    name: 'daily_near_pages_capacity',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 5,
  })
  dailyNearPagesCapacity!: number;

  @Column({
    name: 'daily_far_pages_capacity',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 10,
  })
  dailyFarPagesCapacity!: number;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'photo_url', type: 'text', nullable: true })
  photoUrl!: string | null;

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
  school!: School;
}
