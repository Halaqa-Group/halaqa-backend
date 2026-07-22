import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * اتجاه الحفظ — the order a student memorises the mushaf in.
 *
 * `descending` (تنازلي) starts at An-Nas and works backwards (Juz 30 first) —
 * the common default in Quran schools, so the column default backfills every
 * existing row to it.
 */
export class StudentMemorizationDirection1779900000000 implements MigrationInterface {
  name = 'StudentMemorizationDirection1779900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'students',
      new TableColumn({
        name: 'memorization_direction',
        type: 'enum',
        enum: ['ascending', 'descending'],
        isNullable: false,
        default: "'descending'",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('students', 'memorization_direction');
  }
}
