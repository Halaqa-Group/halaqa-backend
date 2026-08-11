import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Materializes the achievement ↔ plan-item settlement that was previously only
 * derived on the fly (and derived twice, differently, by the plan reconciliation
 * and by the daily report).
 *
 * One row per credited segment. `weekly_plan_item_id` is NULL for the part of an
 * achievement that fell outside every plan item of its track that week.
 * `PlanReconciliationService.reconcilePlan` rewrites a plan's rows on every run,
 * so a plan edit reshapes the whole week's links; the daily report only reads.
 *
 * Cascades: deleting a plan or an item removes its links; hard-deleting an
 * achievement removes its links (soft deletes are handled by re-reconciling).
 */
export class CreateAchievementPlanItemLinks1781200000000 implements MigrationInterface {
  name = 'CreateAchievementPlanItemLinks1781200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`achievement_plan_item_links\` (
        -- Column types MUST match the referenced primary keys exactly, or MySQL
        -- rejects the foreign keys: weekly_plans.id / weekly_plan_items.id are
        -- INT UNSIGNED, achievements.id is BIGINT UNSIGNED, students.id is INT.
        \`id\`                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`weekly_plan_id\`       INT UNSIGNED NOT NULL,
        \`weekly_plan_item_id\`  INT UNSIGNED DEFAULT NULL,
        \`achievement_id\`       BIGINT UNSIGNED NOT NULL,
        \`student_id\`           INT NOT NULL,
        \`track_type\`           ENUM('Hifz','Near','Far') NOT NULL,
        \`achievement_date\`     DATE NOT NULL,
        \`plan_day_of_week\`     TINYINT UNSIGNED DEFAULT NULL,
        \`start_global_ayah\`    INT UNSIGNED NOT NULL,
        \`end_global_ayah\`      INT UNSIGNED NOT NULL,
        \`credited_verses\`      INT UNSIGNED NOT NULL,
        \`credited_pages\`       DECIMAL(8,4) NOT NULL DEFAULT 0,
        \`percentage_score\`     DECIMAL(5,2) NOT NULL DEFAULT 0,
        \`created_at\`           DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        KEY \`idx_apil_plan\` (\`weekly_plan_id\`),
        KEY \`idx_apil_item\` (\`weekly_plan_item_id\`),
        KEY \`idx_apil_achievement\` (\`achievement_id\`),
        KEY \`idx_apil_student_date\` (\`student_id\`, \`achievement_date\`),
        CONSTRAINT \`fk_apil_plan\` FOREIGN KEY (\`weekly_plan_id\`)
          REFERENCES \`weekly_plans\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_apil_item\` FOREIGN KEY (\`weekly_plan_item_id\`)
          REFERENCES \`weekly_plan_items\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_apil_achievement\` FOREIGN KEY (\`achievement_id\`)
          REFERENCES \`achievements\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS \`achievement_plan_item_links\``,
    );
  }
}
