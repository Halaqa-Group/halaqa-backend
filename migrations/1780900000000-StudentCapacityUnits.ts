import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * وحدة القدرة اليومية — each daily capacity now carries the unit it is counted
 * in, so a school can plan in أجزاء/أحزاب/أرباع/سور instead of pages.
 *
 * The existing `daily_*_pages_capacity` columns keep their names (renaming them
 * would break every current client), so the number they hold is only pages when
 * its paired unit column says `page` — which the default backfills every
 * existing row to, preserving today's meaning exactly.
 */
export class StudentCapacityUnits1780900000000 implements MigrationInterface {
  name = 'StudentCapacityUnits1780900000000';

  private static readonly UNITS = ['page', 'juz', 'hizb', 'quarter', 'surah'];

  private static readonly COLUMNS = [
    'daily_hifz_capacity_unit',
    'daily_near_capacity_unit',
    'daily_far_capacity_unit',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const name of StudentCapacityUnits1780900000000.COLUMNS) {
      await queryRunner.addColumn(
        'students',
        new TableColumn({
          name,
          type: 'enum',
          enum: StudentCapacityUnits1780900000000.UNITS,
          isNullable: false,
          default: "'page'",
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const name of StudentCapacityUnits1780900000000.COLUMNS) {
      await queryRunner.dropColumn('students', name);
    }
  }
}
