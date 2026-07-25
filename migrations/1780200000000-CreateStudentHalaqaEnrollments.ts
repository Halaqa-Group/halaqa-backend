import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Historical student ↔ halaqa membership intervals (§8 of the daily evaluation
 * report spec). `student_halaqa` keeps only the current state; this table keeps
 * one row per membership interval so a report for any past date can resolve the
 * halaqa the student actually belonged to on that day.
 *
 * Backfill: one open interval per existing `student_halaqa` row —
 *   start_date = enrollment_date, status carried over, end_date = NULL.
 * `student_halaqa` has no historical end date, so we do not invent one; the
 * known limitation (non-active rows still match dates >= start_date) is accepted
 * for v1 because the source lacks that precision. Ongoing enrollment operations
 * (enroll / transfer / remove / archive) close and open intervals going forward.
 */
export class CreateStudentHalaqaEnrollments1780200000000
  implements MigrationInterface
{
  name = 'CreateStudentHalaqaEnrollments1780200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`student_halaqa_enrollments\` (
        \`id\`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`student_id\`  INT NOT NULL,
        \`halaqa_id\`   INT NOT NULL,
        \`start_date\`  DATE NOT NULL,
        \`end_date\`    DATE DEFAULT NULL,
        \`status\`      ENUM('active','transferred','completed','archived') NOT NULL DEFAULT 'active',
        \`end_reason\`  VARCHAR(255) DEFAULT NULL,
        \`created_by\`  INT DEFAULT NULL,
        \`created_at\`  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\`  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        KEY \`idx_she_student_start\` (\`student_id\`, \`start_date\`),
        KEY \`idx_she_halaqa_start\` (\`halaqa_id\`, \`start_date\`),
        CONSTRAINT \`fk_she_student\`
          FOREIGN KEY (\`student_id\`) REFERENCES \`students\` (\`id\`)
          ON DELETE CASCADE,
        CONSTRAINT \`fk_she_halaqa\`
          FOREIGN KEY (\`halaqa_id\`) REFERENCES \`halaqat\` (\`id\`)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Backfill one open interval per current membership row.
    await queryRunner.query(`
      INSERT INTO \`student_halaqa_enrollments\`
        (\`student_id\`, \`halaqa_id\`, \`start_date\`, \`end_date\`, \`status\`, \`end_reason\`, \`created_by\`)
      SELECT sh.\`student_id\`, sh.\`halaqa_id\`, sh.\`enrollment_date\`, NULL, sh.\`status\`, NULL, NULL
      FROM \`student_halaqa\` sh
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`student_halaqa_enrollments\``);
  }
}
