import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import {
  FULL_NAME_EXPRESSION,
  FULL_NAME_MAX_LENGTH,
  NAME_PART_MAX_LENGTH,
} from '../../../common/person-name';
import { School } from '../../tenant/school.entity';

export type StudentStatus = 'active' | 'inactive' | 'graduated';
export type StudentGender = 'male' | 'female';
/**
 * اتجاه الحفظ — the order the student memorises the mushaf in.
 * `descending` (تنازلي) starts at An-Nas and works backwards (Juz 30 first);
 * `ascending` (تصاعدي) starts at Al-Fatihah and works forwards.
 */
export type MemorizationDirection = 'ascending' | 'descending';

@Entity('students')
@Index('idx_student_school_status', ['schoolId', 'status'])
@Index('idx_student_idnum_school', ['idNumber', 'schoolId'], { unique: true })
export class Student {
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

  @Column({ name: 'id_number', type: 'varchar', length: 20, nullable: true })
  idNumber!: string | null;

  @Column({ type: 'enum', enum: ['male', 'female'] })
  gender!: StudentGender;

  @Column({ type: 'date', nullable: true })
  dob!: Date | null;

  @Column({ name: 'join_date', type: 'date' })
  joinDate!: Date;

  @Column({
    type: 'enum',
    enum: ['active', 'inactive', 'graduated'],
    default: 'active',
  })
  status!: StudentStatus;

  @Column({
    name: 'daily_hifz_pages_capacity',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 1,
  })
  dailyHifzPagesCapacity!: number;

  @Column({
    name: 'daily_near_pages_capacity',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 5,
  })
  dailyNearPagesCapacity!: number;

  @Column({
    name: 'daily_far_pages_capacity',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 10,
  })
  dailyFarPagesCapacity!: number;

  @Column({
    name: 'memorization_direction',
    type: 'enum',
    enum: ['ascending', 'descending'],
    default: 'descending',
  })
  memorizationDirection!: MemorizationDirection;

  // Bitmap of memorized ayat, one bit per ayah in mushaf order (see quran-bitmap.ts).
  // NULL = nothing memorized. Maintained by the memorization recompute worker
  // (union of approved Hifz achievements) and by manual edits.
  // VARBINARY (not BINARY — BINARY caps at 255 bytes). Always written full-length
  // (780 bytes); short/NULL legacy values are zero-padded on read (see toBitmap).
  @Column({
    name: 'memorized_ayat',
    type: 'varbinary',
    length: 780,
    nullable: true,
  })
  memorizedAyat!: Buffer | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'photo_url', type: 'text', nullable: true })
  photoUrl!: string | null;

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
}
