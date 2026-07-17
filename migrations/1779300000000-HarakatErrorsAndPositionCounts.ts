import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Adds the harakat (حركات) error type, and moves error counts down onto the
 * recitation positions. The achievement-level counts become roll-up totals.
 */
export class HarakatErrorsAndPositionCounts1779300000000 implements MigrationInterface {
  name = 'HarakatErrorsAndPositionCounts1779300000000';

  private countColumns(): TableColumn[] {
    return [
      'mistakes_count',
      'warnings_count',
      'tajweed_errors_count',
      'harakat_errors_count',
    ].map(
      (name) =>
        new TableColumn({
          name,
          type: 'int',
          unsigned: true,
          default: 0,
          isNullable: false,
        }),
    );
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── achievements: the new error type ─────────────────────────────────────
    await queryRunner.addColumn(
      'achievements',
      new TableColumn({
        name: 'harakat_errors_count',
        type: 'int',
        unsigned: true,
        default: 0,
        isNullable: false,
      }),
    );

    // ── achievement_recitation_positions: per-position counts ────────────────
    await queryRunner.addColumns(
      'achievement_recitation_positions',
      this.countColumns(),
    );

    // Backfill: a `full` achievement has exactly one position spanning its whole
    // range, so its totals belong to that position verbatim. `test` achievements
    // have their counts spread across positions in a way that cannot be
    // reconstructed — their positions stay at 0 while the stored achievement
    // totals are left untouched, so historical scores remain intact.
    await queryRunner.query(`
      UPDATE achievement_recitation_positions p
      JOIN achievements a ON a.id = p.achievement_id AND a.recitation_method = 'full'
      SET p.mistakes_count = a.mistakes_count,
          p.warnings_count = a.warnings_count,
          p.tajweed_errors_count = a.tajweed_errors_count
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumns('achievement_recitation_positions', [
      'mistakes_count',
      'warnings_count',
      'tajweed_errors_count',
      'harakat_errors_count',
    ]);
    await queryRunner.dropColumn('achievements', 'harakat_errors_count');
  }
}
