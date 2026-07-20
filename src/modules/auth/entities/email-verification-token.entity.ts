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
import { User } from '../../users/entities/user.entity';

/**
 * One-time email-ownership proof. Mirrors `password_reset_tokens`: only the
 * SHA-256 hash of the raw token is stored; the raw travels in the email link.
 * Consuming a live token stamps `users.email_verified_at`.
 */
@Entity('email_verification_tokens')
export class EmailVerificationToken {
  @PrimaryGeneratedColumn({ type: 'int' })
  id!: number;

  @Index('idx_evt_user')
  @Column({ name: 'user_id', type: 'int' })
  userId!: number;

  @Index('idx_evt_hash', { unique: true })
  @Column({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash!: string;

  @Column({ name: 'expires_at', type: 'datetime', precision: 6 })
  expiresAt!: Date;

  @Column({ name: 'used_at', type: 'datetime', precision: 6, nullable: true })
  usedAt!: Date | null;

  @Column({ name: 'requested_ip', type: 'varchar', length: 45, nullable: true })
  requestedIp!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: Relation<User>;
}
