import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-student rows of a saved daily evaluation report (§26). One row per
 * (report, student). Numeric per-track fields are plain columns so weekly/
 * monthly aggregates avoid JSON extraction; the JSON columns hold audit detail.
 *
 * `attendance_status` includes `missing_attendance` — a report-derived state (no
 * attendance row existed), NOT a value of `student_attendances.status`.
 * `total_score`, `ethics_*`, and `overall_plan_completion_rate` are nullable to
 * represent `missing_attendance` (excluded from averages — §20.2).
 */
export class CreateDailyStudentEvaluations1780500000000
  implements MigrationInterface
{
  name = 'CreateDailyStudentEvaluations1780500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`daily_student_evaluations\` (
        \`id\`                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`daily_report_id\`       BIGINT UNSIGNED NOT NULL,
        \`student_id\`            INT NOT NULL,
        \`attendance_status\`     ENUM('present','late','absent','excused','missing_attendance') NOT NULL,
        \`teacher_note\`          TEXT DEFAULT NULL,
        \`system_alerts\`         JSON DEFAULT NULL,
        \`calculation_details\`   JSON NOT NULL,

        \`hifz_base_weight\`      DECIMAL(5,2) NOT NULL,
        \`hifz_effective_weight\` DECIMAL(5,2) NOT NULL,
        \`hifz_planned_pages\`    DECIMAL(8,4) NOT NULL,
        \`hifz_achieved_pages\`   DECIMAL(8,4) NOT NULL,
        \`hifz_completion_rate\`  DECIMAL(5,2) NOT NULL,
        \`hifz_quality_rate\`     DECIMAL(5,2) NOT NULL,
        \`hifz_score\`            DECIMAL(6,2) NOT NULL,
        \`hifz_reconciliation\`   JSON DEFAULT NULL,

        \`near_base_weight\`      DECIMAL(5,2) NOT NULL,
        \`near_effective_weight\` DECIMAL(5,2) NOT NULL,
        \`near_planned_pages\`    DECIMAL(8,4) NOT NULL,
        \`near_achieved_pages\`   DECIMAL(8,4) NOT NULL,
        \`near_completion_rate\`  DECIMAL(5,2) NOT NULL,
        \`near_quality_rate\`     DECIMAL(5,2) NOT NULL,
        \`near_score\`            DECIMAL(6,2) NOT NULL,
        \`near_reconciliation\`   JSON DEFAULT NULL,

        \`far_base_weight\`       DECIMAL(5,2) NOT NULL,
        \`far_effective_weight\`  DECIMAL(5,2) NOT NULL,
        \`far_planned_pages\`     DECIMAL(8,4) NOT NULL,
        \`far_achieved_pages\`    DECIMAL(8,4) NOT NULL,
        \`far_completion_rate\`   DECIMAL(5,2) NOT NULL,
        \`far_quality_rate\`      DECIMAL(5,2) NOT NULL,
        \`far_score\`             DECIMAL(6,2) NOT NULL,
        \`far_reconciliation\`    JSON DEFAULT NULL,

        \`ethics_rating\`                 TINYINT UNSIGNED DEFAULT NULL,
        \`ethics_score\`                  DECIMAL(6,2) DEFAULT NULL,
        \`overall_plan_completion_rate\`  DECIMAL(5,2) DEFAULT NULL,
        \`total_score\`                   DECIMAL(6,2) DEFAULT NULL,

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_daily_report_student\` (\`daily_report_id\`, \`student_id\`),
        KEY \`idx_daily_eval_student\` (\`student_id\`, \`daily_report_id\`),
        KEY \`idx_daily_eval_total\` (\`daily_report_id\`, \`total_score\`),
        CONSTRAINT \`fk_dse_report\`
          FOREIGN KEY (\`daily_report_id\`) REFERENCES \`daily_halaqa_reports\` (\`id\`)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`daily_student_evaluations\``);
  }
}
