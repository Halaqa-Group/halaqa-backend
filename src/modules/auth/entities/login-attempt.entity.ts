import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { School } from '../../tenant/school.entity';
import { User } from '../../users/entities/user.entity';
import { DEVICE_TYPES, RefreshToken } from './refresh-token.entity';
import type { DeviceType } from './refresh-token.entity';

export type LoginAttemptStatus =
  | 'success'
  | 'wrong_password'
  | 'user_not_found'
  | 'account_locked'
  | 'account_inactive'
  | 'rate_limited';

export const LOGIN_ATTEMPT_STATUSES: LoginAttemptStatus[] = [
  'success',
  'wrong_password',
  'user_not_found',
  'account_locked',
  'account_inactive',
  'rate_limited',
];

@Entity('login_attempts')
@Index('idx_email_time', ['email', 'attemptedAt'])
@Index('idx_ip_time', ['ipAddress', 'attemptedAt'])
@Index('idx_user_time', ['userId', 'attemptedAt'])
export class LoginAttempt {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ name: 'user_id', type: 'int', nullable: true })
  userId!: number | null;

  @Column({ name: 'school_id', type: 'int', nullable: true })
  schoolId!: number | null;

  @Column({ type: 'enum', enum: LOGIN_ATTEMPT_STATUSES })
  status!: LoginAttemptStatus;

  @Column({
    name: 'failure_reason',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  failureReason!: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45 })
  ipAddress!: string;

  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true })
  userAgent!: string | null;

  @Column({
    name: 'device_type',
    type: 'enum',
    enum: DEVICE_TYPES,
    default: 'web',
  })
  deviceType!: DeviceType;

  @Column({ name: 'refresh_token_id', type: 'bigint', nullable: true })
  refreshTokenId!: string | null;

  @CreateDateColumn({ name: 'attempted_at', type: 'datetime', precision: 6 })
  attemptedAt!: Date;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user!: User | null;

  @ManyToOne(() => School, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'school_id' })
  school!: School | null;

  @ManyToOne(() => RefreshToken, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'refresh_token_id' })
  refreshToken!: RefreshToken | null;
}
