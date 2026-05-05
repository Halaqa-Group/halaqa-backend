import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Student } from '../../students/entities/student.entity';
import { Halaqa } from './halaqa.entity';

@Entity('student_halaqa')
export class StudentHalaqa {
  @PrimaryColumn({ name: 'student_id', type: 'int' })
  studentId!: number;

  @PrimaryColumn({ name: 'halaqa_id', type: 'int' })
  halaqaId!: number;

  @Column({ name: 'assigned_at', type: 'datetime', precision: 6 })
  assignedAt!: Date;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student!: Student;

  @ManyToOne(() => Halaqa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'halaqa_id' })
  halaqa!: Halaqa;
}
