import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateAchievementsTable1747101600000 implements MigrationInterface {
  name = 'CreateAchievementsTable1747101600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'achievements',
        columns: [
          {
            name: 'id',
            type: 'bigint',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
            unsigned: true,
          },
          { name: 'school_id', type: 'int', isNullable: false },
          { name: 'student_id', type: 'int', isNullable: false },
          { name: 'halaqa_id', type: 'int', isNullable: false },
          { name: 'recorded_by', type: 'int', isNullable: false },
          { name: 'date', type: 'date', isNullable: false },
          {
            name: 'track_type',
            type: 'enum',
            enum: ['Hifz', 'Near', 'Far'],
            isNullable: false,
          },
          { name: 'start_surah', type: 'smallint', unsigned: true, isNullable: false },
          { name: 'start_verse', type: 'smallint', unsigned: true, isNullable: false },
          { name: 'end_surah', type: 'smallint', unsigned: true, isNullable: false },
          { name: 'end_verse', type: 'smallint', unsigned: true, isNullable: false },
          { name: 'mistakes_count', type: 'int', unsigned: true, default: 0, isNullable: false },
          { name: 'warnings_count', type: 'int', unsigned: true, default: 0, isNullable: false },
          { name: 'tajweed_errors_count', type: 'int', unsigned: true, default: 0, isNullable: false },
          { name: 'percentage_score', type: 'decimal', precision: 5, scale: 2, isNullable: false },
          {
            name: 'status',
            type: 'enum',
            enum: ['approved', 'unapproved'],
            default: "'unapproved'",
            isNullable: false,
          },
          { name: 'approved_by', type: 'int', isNullable: true, default: null },
          { name: 'approved_at', type: 'datetime', precision: 6, isNullable: true, default: null },
          { name: 'teacher_notes', type: 'text', isNullable: true, default: null },
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
            columnNames: ['recorded_by'],
            referencedTableName: 'users',
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
      'achievements',
      new TableIndex({
        name: 'idx_achievement_lookup',
        columnNames: ['student_id', 'halaqa_id', 'date', 'track_type'],
        isUnique: false,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('achievements', true);
  }
}
