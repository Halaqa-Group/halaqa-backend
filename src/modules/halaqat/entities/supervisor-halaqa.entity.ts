import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Halaqa } from './halaqa.entity';

@Entity('supervisor_halaqat')
export class SupervisorHalaqa {
  @PrimaryColumn({ name: 'supervisor_user_id', type: 'int' })
  supervisorUserId!: number;

  @PrimaryColumn({ name: 'halaqa_id', type: 'int' })
  halaqaId!: number;

  @ManyToOne(() => Halaqa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'halaqa_id' })
  halaqa!: Halaqa;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'supervisor_user_id' })
  supervisor!: User;
}
