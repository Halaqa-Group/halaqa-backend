import { MigrationInterface, QueryRunner, Table } from 'typeorm';

/**
 * Itemized recitation errors, one row per error occurrence at a QUL word span,
 * tied to a recitation position. surah/ayah/juz/hizb are denormalized from QUL
 * (client-supplied); school_id/student_id/date are denormalized from the owning
 * achievement (no FK — constant). The position's counts roll these up per type.
 */
export class CreateAchievementPositionErrors1779400000000 implements MigrationInterface {
  name = 'CreateAchievementPositionErrors1779400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'achievement_position_errors',
        columns: [
          {
            name: 'id',
            type: 'bigint',
            unsigned: true,
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'position_id',
            type: 'bigint',
            unsigned: true,
            isNullable: false,
          },
          {
            name: 'error_type',
            type: 'enum',
            enum: ['mistake', 'warning', 'tajweed', 'harakat'],
            isNullable: false,
          },
          {
            name: 'start_word_id',
            type: 'int',
            unsigned: true,
            isNullable: false,
            comment: 'QUL word id (sequential in mushaf order)',
          },
          {
            name: 'end_word_id',
            type: 'int',
            unsigned: true,
            isNullable: false,
          },
          {
            name: 'surah',
            type: 'smallint',
            unsigned: true,
            isNullable: false,
            comment: 'denormalized for reporting',
          },
          { name: 'ayah', type: 'smallint', unsigned: true, isNullable: false },
          {
            name: 'juz',
            type: 'smallint',
            unsigned: true,
            isNullable: false,
            comment: 'canonical, filled from QUL at capture time',
          },
          { name: 'hizb', type: 'smallint', unsigned: true, isNullable: false },
          {
            name: 'school_id',
            type: 'int',
            isNullable: false,
            comment: 'denormalized from parent (constant, no FK)',
          },
          { name: 'student_id', type: 'int', isNullable: false },
          { name: 'date', type: 'date', isNullable: false },
          {
            name: 'created_at',
            type: 'datetime',
            precision: 6,
            default: 'CURRENT_TIMESTAMP(6)',
            isNullable: false,
          },
        ],
        indices: [
          { name: 'idx_position_error_position', columnNames: ['position_id'] },
          {
            name: 'idx_position_error_student',
            columnNames: ['student_id', 'error_type', 'date'],
          },
          {
            name: 'idx_position_error_location',
            columnNames: ['school_id', 'surah', 'ayah'],
          },
          {
            name: 'idx_position_error_word',
            columnNames: ['school_id', 'start_word_id'],
          },
        ],
        foreignKeys: [
          {
            name: 'FK_position_error_position',
            columnNames: ['position_id'],
            referencedTableName: 'achievement_recitation_positions',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
            onUpdate: 'RESTRICT',
          },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('achievement_position_errors', true);
  }
}
