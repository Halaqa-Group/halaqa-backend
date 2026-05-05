import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Halaqa } from './halaqa.entity';

@Entity('halaqa_teachers')
export class HalaqaTeacher {
  @PrimaryColumn({ name: 'halaqa_id', type: 'int' })
  halaqaId!: number;

  @PrimaryColumn({ name: 'teacher_user_id', type: 'int' })
  teacherUserId!: number;

  @Column({ name: 'is_primary', type: 'tinyint', default: 0 })
  isPrimary!: boolean;

  @Column({ name: 'acting_as_primary', type: 'tinyint', default: 0 })
  actingAsPrimary!: boolean;

  @Column({ name: 'start_date', type: 'date' })
  startDate!: Date;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate!: Date | null;

  @ManyToOne(() => Halaqa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'halaqa_id' })
  halaqa!: Halaqa;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'teacher_user_id' })
  teacher!: User;
}
