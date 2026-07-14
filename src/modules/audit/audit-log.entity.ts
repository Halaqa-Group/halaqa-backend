import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { School } from '../tenant/school.entity';
import { User } from '../users/entities/user.entity';

@Entity('audit_logs')
@Index('idx_actor', ['actorUserId', 'createdAt'])
@Index('idx_entity', ['entityType', 'entityId', 'createdAt'])
@Index('idx_action', ['action', 'createdAt'])
@Index('idx_school_time', ['schoolId', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'actor_user_id', type: 'int', nullable: true })
  actorUserId!: number | null;

  @Column({ name: 'actor_role', type: 'varchar', length: 50, nullable: true })
  actorRole!: string | null;

  @Column({ name: 'school_id', type: 'int', nullable: true })
  schoolId!: number | null;

  @Column({ type: 'varchar', length: 100 })
  action!: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 50 })
  entityType!: string;

  @Column({ name: 'entity_id', type: 'bigint', nullable: true })
  entityId!: string | null;

  @Column({ name: 'old_values', type: 'json', nullable: true })
  oldValues!: Record<string, unknown> | null;

  @Column({ name: 'new_values', type: 'json', nullable: true })
  newValues!: Record<string, unknown> | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true })
  userAgent!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'actor_user_id' })
  actor!: Relation<User> | null;

  @ManyToOne(() => School, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'school_id' })
  school!: Relation<School> | null;
}
