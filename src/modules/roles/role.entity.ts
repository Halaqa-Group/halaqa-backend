import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type RoleSlug =
  | 'principal'
  | 'vice_principal'
  | 'supervisor'
  | 'teacher'
  | 'parent';

@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn({ type: 'int' })
  id!: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 50 })
  slug!: RoleSlug;

  @Column({ name: 'name_ar', type: 'varchar', length: 100 })
  nameAr!: string;

  @Column({ name: 'name_en', type: 'varchar', length: 100 })
  nameEn!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description!: string | null;

  @Column({ type: 'tinyint', default: 0 })
  level!: number;
}
