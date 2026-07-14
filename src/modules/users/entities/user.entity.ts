import { Exclude } from 'class-transformer';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { UserRole } from '../../roles/user-role.entity';
import { School } from '../../tenant/school.entity';

export type UserStatus = 'active' | 'inactive' | 'suspended';

@Entity('users')
@Unique('idx_user_email_school', ['email', 'schoolId'])
@Index('idx_user_school_status', ['schoolId', 'status'])
export class User {
  @PrimaryGeneratedColumn({ type: 'int' })
  id!: number;

  @Column({ name: 'school_id', type: 'int' })
  schoolId!: number;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Exclude({ toPlainOnly: true })
  @Column({ type: 'varchar', length: 255 })
  password!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone!: string | null;

  @Column({ name: 'photo_url', type: 'text', nullable: true })
  photoUrl!: string | null;

  @Column({
    name: 'email_verified_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  emailVerifiedAt!: Date | null;

  @Column({
    name: 'last_login_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  lastLoginAt!: Date | null;

  @Column({
    type: 'enum',
    enum: ['active', 'inactive', 'suspended'],
    default: 'active',
  })
  status!: UserStatus;

  @Exclude({ toPlainOnly: true })
  @Column({ name: 'token_version', type: 'int', default: 0 })
  tokenVersion!: number;

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
  school!: Relation<School>;

  @OneToMany(() => UserRole, (ur) => ur.user)
  userRoles!: UserRole[];
}
