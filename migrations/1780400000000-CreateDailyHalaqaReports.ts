import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Header table for saved daily evaluation reports — one row per (halaqa, date)
 * (§25). Recalculation replaces the row in place (UNIQUE (halaqa_id, date));
 * it never creates a second version. Stores a snapshot of the weights used so
 * historical reports stay reproducible.
 */
export class CreateDailyHalaqaReports1780400000000
  implements MigrationInterface
{
  name = 'CreateDailyHalaqaReports1780400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`daily_halaqa_reports\` (
        \`id\`                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`school_id\`             INT NOT NULL,
        \`halaqa_id\`             INT NOT NULL,
        \`report_date\`           DATE NOT NULL,
        \`day_status\`            ENUM('working_day','non_working_day') NOT NULL,
        \`report_status\`         ENUM('complete','partial','failed') NOT NULL,
        \`hifz_weight\`           DECIMAL(5,2) NOT NULL,
        \`near_weight\`           DECIMAL(5,2) NOT NULL,
        \`far_weight\`            DECIMAL(5,2) NOT NULL,
        \`ethics_weight\`         DECIMAL(5,2) NOT NULL,
        \`academic_weight\`       DECIMAL(5,2) NOT NULL,
        \`calculation_version\`   VARCHAR(30) NOT NULL,
        \`generated_at\`          DATETIME(6) NOT NULL,
        \`generated_by\`          INT DEFAULT NULL,
        \`recalculated_at\`       DATETIME(6) DEFAULT NULL,
        \`recalculated_by\`       INT DEFAULT NULL,
        \`recalculation_reason\`  VARCHAR(255) DEFAULT NULL,
        \`created_at\`            DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\`            DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_daily_halaqa_report\` (\`halaqa_id\`, \`report_date\`),
        KEY \`idx_daily_report_school_date\` (\`school_id\`, \`report_date\`),
        KEY \`idx_daily_report_halaqa_date\` (\`halaqa_id\`, \`report_date\`),
        CONSTRAINT \`fk_dhr_school\`
          FOREIGN KEY (\`school_id\`) REFERENCES \`schools\` (\`id\`)
          ON DELETE CASCADE,
        CONSTRAINT \`fk_dhr_halaqa\`
          FOREIGN KEY (\`halaqa_id\`) REFERENCES \`halaqat\` (\`id\`)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`daily_halaqa_reports\``);
  }
}
