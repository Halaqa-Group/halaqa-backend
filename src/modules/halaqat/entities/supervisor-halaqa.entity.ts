import {
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Halaqa } from './halaqa.entity';

@Entity('supervisor_halaqat')
@Index('idx_sh_halaqa', ['halaqaId'])
export class SupervisorHalaqa {
  @PrimaryColumn({ name: 'supervisor_user_id', type: 'int' })
  supervisorUserId!: number;

  @PrimaryColumn({ name: 'halaqa_id', type: 'int' })
  halaqaId!: number;

  @CreateDateColumn({ name: 'assigned_at', type: 'datetime', precision: 6 })
  assignedAt!: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'supervisor_user_id' })
  supervisor!: User;

  @ManyToOne(() => Halaqa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'halaqa_id' })
  halaqa!: Halaqa;
}
