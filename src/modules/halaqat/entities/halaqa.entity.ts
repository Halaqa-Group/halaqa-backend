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
import { School } from '../../tenant/school.entity';

export type HalaqaType = 'Memorization' | 'Tajweed' | 'Aqeedah';
export type HalaqaStatus = 'active' | 'archived' | 'completed';

@Entity('halaqat')
@Index('idx_halaqa_school_status', ['schoolId', 'status'])
export class Halaqa {
  @PrimaryGeneratedColumn({ type: 'int' })
  id!: number;

  @Column({ name: 'school_id', type: 'int' })
  schoolId!: number;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({
    type: 'enum',
    enum: ['Memorization', 'Tajweed', 'Aqeedah'],
    default: 'Memorization',
  })
  type!: HalaqaType;

  @Column({ name: 'evaluation_settings', type: 'json', nullable: true })
  evaluationSettings!: Record<string, unknown> | null;

  @Column({
    type: 'enum',
    enum: ['active', 'archived', 'completed'],
    default: 'active',
  })
  status!: HalaqaStatus;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt!: Date;

  // Used only for archived halaqat. @DeleteDateColumn enables TypeORM's softDelete().
  // Queries requiring archived rows must pass { withDeleted: true }.
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
