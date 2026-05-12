import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateWeeklyPlansTable1747101700000 implements MigrationInterface {
  name = 'CreateWeeklyPlansTable1747101700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'weekly_plans',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
            unsigned: true,
          },
          { name: 'school_id', type: 'int', isNullable: false },
          { name: 'student_id', type: 'int', isNullable: false },
          { name: 'halaqa_id', type: 'int', isNullable: false },
          { name: 'week_start_date', type: 'date', isNullable: false },
          {
            name: 'status',
            type: 'enum',
            enum: ['draft', 'approved'],
            default: "'draft'",
            isNullable: false,
          },
          { name: 'approved_by', type: 'int', isNullable: true, default: null },
          { name: 'created_at', type: 'datetime', precision: 6, default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
          {
            name: 'updated_at',
            type: 'datetime',
            precision: 6,
            default: 'CURRENT_TIMESTAMP(6)',
            onUpdate: 'CURRENT_TIMESTAMP(6)',
            isNullable: false,
          },
          { name: 'deleted_at', type: 'datetime', precision: 6, isNullable: true, default: null },
        ],
        foreignKeys: [
          {
            columnNames: ['school_id'],
            referencedTableName: 'schools',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            columnNames: ['student_id'],
            referencedTableName: 'students',
            referencedColumnNames: ['id'],
          },
          {
            columnNames: ['halaqa_id'],
            referencedTableName: 'halaqat',
            referencedColumnNames: ['id'],
          },
          {
            columnNames: ['approved_by'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'weekly_plans',
      new TableIndex({
        name: 'idx_weekly_plan_unique',
        columnNames: ['student_id', 'halaqa_id', 'week_start_date'],
        isUnique: true,
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'weekly_plan_items',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
            unsigned: true,
          },
          { name: 'weekly_plan_id', type: 'int', unsigned: true, isNullable: false },
          {
            name: 'track_type',
            type: 'enum',
            enum: ['Hifz', 'Near', 'Far'],
            isNullable: false,
          },
          { name: 'day_of_week', type: 'tinyint', unsigned: true, isNullable: false },
          { name: 'start_surah', type: 'smallint', unsigned: true, isNullable: false },
          { name: 'start_verse', type: 'smallint', unsigned: true, isNullable: false },
          { name: 'end_surah', type: 'smallint', unsigned: true, isNullable: false },
          { name: 'end_verse', type: 'smallint', unsigned: true, isNullable: false },
          { name: 'total_verses', type: 'int', unsigned: true, isNullable: false },
          { name: 'achieved_verses', type: 'int', unsigned: true, default: 0, isNullable: false },
          {
            name: 'status',
            type: 'enum',
            enum: ['due', 'overdue', 'partial', 'completed'],
            default: "'due'",
            isNullable: false,
          },
          { name: 'is_manual_override', type: 'tinyint', width: 1, unsigned: true, default: 0, isNullable: false },
          { name: 'created_at', type: 'datetime', precision: 6, default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
          {
            name: 'updated_at',
            type: 'datetime',
            precision: 6,
            default: 'CURRENT_TIMESTAMP(6)',
            onUpdate: 'CURRENT_TIMESTAMP(6)',
            isNullable: false,
          },
        ],
        foreignKeys: [
          {
            columnNames: ['weekly_plan_id'],
            referencedTableName: 'weekly_plans',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('weekly_plan_items', true);
    await queryRunner.dropTable('weekly_plans', true);
  }
}
