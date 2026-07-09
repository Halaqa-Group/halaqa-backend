import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Student } from '../../students/entities/student.entity';
import { Halaqa } from './halaqa.entity';

export type StudentHalaqaStatus =
  | 'active'
  | 'transferred'
  | 'completed'
  | 'archived';

@Entity('student_halaqa')
@Index('idx_sh2_halaqa', ['halaqaId'])
export class StudentHalaqa {
  @PrimaryColumn({ name: 'student_id', type: 'int' })
  studentId!: number;

  @PrimaryColumn({ name: 'halaqa_id', type: 'int' })
  halaqaId!: number;

  // DATE column — returned as 'YYYY-MM-DD' string by the MySQL driver.
  @Column({ name: 'enrollment_date', type: 'date' })
  enrollmentDate!: string;

  @Column({
    type: 'enum',
    enum: ['active', 'transferred', 'completed', 'archived'],
    default: 'active',
  })
  status!: StudentHalaqaStatus;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student!: Student;

  @ManyToOne(() => Halaqa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'halaqa_id' })
  halaqa!: Halaqa;
}
