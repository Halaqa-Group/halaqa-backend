import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export type DeviceType =
  | 'web'
  | 'mobile_ios'
  | 'mobile_android'
  | 'desktop'
  | 'other';

export type RevokedReason =
  | 'logout'
  | 'rotation'
  | 'password_change'
  | 'admin_action'
  | 'suspicious_activity'
  | 'expired';

export const DEVICE_TYPES: DeviceType[] = [
  'web',
  'mobile_ios',
  'mobile_android',
  'desktop',
  'other',
];

@Entity('refresh_tokens')
@Index('idx_user_active', ['userId', 'revokedAt', 'expiresAt'])
@Index('idx_family', ['familyId'])
@Index('idx_cleanup', ['expiresAt'])
export class RefreshToken {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'user_id', type: 'int' })
  userId!: number;

  @Index({ unique: true })
  @Column({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash!: string;

  @Column({ name: 'family_id', type: 'char', length: 36 })
  familyId!: string;

  @Column({ name: 'parent_id', type: 'bigint', nullable: true })
  parentId!: string | null;

  @Column({ name: 'device_name', type: 'varchar', length: 100, nullable: true })
  deviceName!: string | null;

  @Column({
    name: 'device_type',
    type: 'enum',
    enum: DEVICE_TYPES,
    default: 'web',
  })
  deviceType!: DeviceType;

  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true })
  userAgent!: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress!: string | null;

  @CreateDateColumn({ name: 'issued_at', type: 'datetime', precision: 6 })
  issuedAt!: Date;

  @Column({ name: 'expires_at', type: 'datetime', precision: 6 })
  expiresAt!: Date;

  @Column({
    name: 'last_used_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  lastUsedAt!: Date | null;

  @Column({
    name: 'revoked_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  revokedAt!: Date | null;

  @Column({
    name: 'revoked_reason',
    type: 'enum',
    enum: [
      'logout',
      'rotation',
      'password_change',
      'admin_action',
      'suspicious_activity',
      'expired',
    ],
    nullable: true,
  })
  revokedReason!: RevokedReason | null;

  @Column({ name: 'replaced_by_id', type: 'bigint', nullable: true })
  replacedById!: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => RefreshToken, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent!: RefreshToken | null;

  @ManyToOne(() => RefreshToken, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'replaced_by_id' })
  replacedBy!: RefreshToken | null;
}
