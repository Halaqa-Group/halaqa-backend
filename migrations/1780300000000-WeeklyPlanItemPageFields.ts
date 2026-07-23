import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Page-calculation helper columns on `weekly_plan_items` for the daily
 * evaluation report (§10.1 of the spec):
 *   - start_global_ayah / end_global_ayah — the planned range in mushaf-order
 *     global ayah indices (nullable until computed).
 *   - planned_pages — the fractional page count of the range, DECIMAL(8,4),
 *     recomputed in the backend via the same page-coverage algorithm as the
 *     frontend. Defaults to 0 for existing rows; backfilled by the report's
 *     page module (Phase 2), not in this migration.
 */
export class WeeklyPlanItemPageFields1780300000000
  implements MigrationInterface
{
  name = 'WeeklyPlanItemPageFields1780300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('weekly_plan_items', [
      new TableColumn({
        name: 'start_global_ayah',
        type: 'int',
        unsigned: true,
        isNullable: true,
      }),
      new TableColumn({
        name: 'end_global_ayah',
        type: 'int',
        unsigned: true,
        isNullable: true,
      }),
      new TableColumn({
        name: 'planned_pages',
        type: 'decimal',
        precision: 8,
        scale: 4,
        isNullable: false,
        default: 0,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumns('weekly_plan_items', [
      'start_global_ayah',
      'end_global_ayah',
      'planned_pages',
    ]);
  }
}
