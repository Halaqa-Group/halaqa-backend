import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Page fields on achievements, computed on the frontend (from the mushaf) and
 * stored as-is — the backend does not derive them. Fractional pages, DECIMAL(8,4)
 * to match the branch's other page columns (`weekly_plan_items.planned_pages`,
 * `daily_student_evaluations.*_pages`).
 *
 *   - achievements.total_pages     — الصفحات الكلية: pages of the whole [start,end] range.
 *   - achievements.positions_pages — صفحات المواضع: SUM of the positions' `pages`
 *     (the amount actually recited; equals total_pages for a `full` recitation).
 *   - achievement_recitation_positions.pages — per-position pages.
 *
 * All nullable: NULL means the client did not supply pages (legacy rows and
 * clients that haven't adopted the field). Reports treat NULL as 0.
 */
export class AchievementPageFields1780600000000 implements MigrationInterface {
  name = 'AchievementPageFields1780600000000';

  private pagesColumn(name: string): TableColumn {
    return new TableColumn({
      name,
      type: 'decimal',
      precision: 8,
      scale: 4,
      isNullable: true,
    });
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('achievements', [
      this.pagesColumn('total_pages'),
      this.pagesColumn('positions_pages'),
    ]);
    await queryRunner.addColumn(
      'achievement_recitation_positions',
      this.pagesColumn('pages'),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('achievement_recitation_positions', 'pages');
    await queryRunner.dropColumns('achievements', [
      'total_pages',
      'positions_pages',
    ]);
  }
}
