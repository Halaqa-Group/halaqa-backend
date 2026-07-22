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
import {
  FULL_NAME_EXPRESSION,
  FULL_NAME_MAX_LENGTH,
  NAME_PART_MAX_LENGTH,
} from '../../../common/person-name';
import { UserRole } from '../../roles/user-role.entity';
import { School } from '../../tenant/school.entity';

export type UserStatus = 'active' | 'inactive' | 'suspended';

@Entity('users')
@Unique('idx_user_email_school', ['email', 'schoolId'])
@Unique('idx_user_idnum_school', ['idNumber', 'schoolId'])
@Index('idx_user_school_status', ['schoolId', 'status'])
export class User {
  @PrimaryGeneratedColumn({ type: 'int' })
  id!: number;

  @Column({ name: 'school_id', type: 'int' })
  schoolId!: number;

  @Column({ name: 'first_name', type: 'varchar', length: NAME_PART_MAX_LENGTH })
  firstName!: string;

  @Column({
    name: 'second_name',
    type: 'varchar',
    length: NAME_PART_MAX_LENGTH,
  })
  secondName!: string;

  @Column({ name: 'third_name', type: 'varchar', length: NAME_PART_MAX_LENGTH })
  thirdName!: string;

  @Column({
    name: 'family_name',
    type: 'varchar',
    length: NAME_PART_MAX_LENGTH,
  })
  familyName!: string;

  /**
   * Read-only display name derived by MySQL from the four parts above.
   * Never assign to it — write the parts instead. See `common/person-name.ts`.
   */
  @Column({
    type: 'varchar',
    length: FULL_NAME_MAX_LENGTH,
    generatedType: 'STORED',
    asExpression: FULL_NAME_EXPRESSION,
    insert: false,
    update: false,
    // Nullable in the catalog only: MariaDB rejects a NULL/NOT NULL clause on a
    // generated column, so the migration emits none and both engines default to
    // nullable. The expression itself can never yield NULL, hence `string`.
    nullable: true,
  })
  name!: string;

  /** National ID number (Palestinian: 9 digits), normalized. Unique per school. */
  @Column({ name: 'id_number', type: 'varchar', length: 20 })
  idNumber!: string;

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
