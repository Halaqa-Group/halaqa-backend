import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * ملاحظة المحفّظ اليومية — a nullable free-text teacher note on each student
 * attendance row, surfaced in the daily evaluation report (§22 of the spec).
 *
 * Distinct from `excuse_note` (absence reason) and `modification_reason` (audit
 * of a correction). Nullable with no default, so existing rows backfill to NULL
 * and the seed cron needs no change.
 */
export class AttendanceDailyNote1780100000000 implements MigrationInterface {
  name = 'AttendanceDailyNote1780100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'student_attendances',
      new TableColumn({
        name: 'daily_note',
        type: 'text',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('student_attendances', 'daily_note');
  }
}
