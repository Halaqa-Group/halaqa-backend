import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `untracked` to `achievements.recitation_method` — a recitation the teacher
 * scored without documenting where. It carries no `achievement_recitation_positions`
 * and no `achievement_position_errors`; the four error counts on the achievement
 * are the teacher's aggregate figures, so the frontend still computes
 * `percentage_score` from them and the halaqa's `evaluation_settings` the usual way.
 *
 * Review tracks only — Hifz stays `full` (enforced in the service, not the schema).
 *
 * Appending the value at the end of the ENUM keeps existing rows' stored ordinals
 * intact, so MySQL 8 applies this in place rather than rewriting the table.
 * `down()` fails loudly if any row already uses the new value — silently rewriting
 * those rows to `full` would claim a full recitation that never happened.
 */
export class AchievementUntrackedRecitation1781100000000 implements MigrationInterface {
  name = 'AchievementUntrackedRecitation1781100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE achievements
         MODIFY COLUMN recitation_method ENUM('full','test','untracked')
         NOT NULL DEFAULT 'full'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows: { total: number | string }[] = await queryRunner.query(
      `SELECT COUNT(*) AS total FROM achievements WHERE recitation_method = 'untracked'`,
    );
    const total = Number(rows[0]?.total ?? 0);
    if (total > 0) {
      throw new Error(
        `Cannot revert: ${total} achievement(s) use recitation_method='untracked'. ` +
          'Reclassify them before rolling back.',
      );
    }

    await queryRunner.query(
      `ALTER TABLE achievements
         MODIFY COLUMN recitation_method ENUM('full','test')
         NOT NULL DEFAULT 'full'`,
    );
  }
}
