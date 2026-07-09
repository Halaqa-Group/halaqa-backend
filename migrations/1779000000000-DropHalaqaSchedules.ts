import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drops the `halaqa_schedules` table. Per-halaqa scheduling and teacher
 * schedule-conflict detection have been removed — scheduling is now expressed
 * only at the school level (`school_schedules`).
 *
 * `down` recreates the table as it was in 1778400000000-HalaqaSchedulesCreate.
 */
export class DropHalaqaSchedules1779000000000 implements MigrationInterface {
  name = 'DropHalaqaSchedules1779000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`halaqa_schedules\``);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`halaqa_schedules\` (
        \`id\`          INT NOT NULL AUTO_INCREMENT,
        \`halaqa_id\`   INT NOT NULL,
        \`day_of_week\` TINYINT NOT NULL COMMENT '0=Saturday … 6=Friday',
        \`prayer_slot\` ENUM('fajr','dhuhr','asr','maghrib','isha') DEFAULT NULL,
        \`start_time\`  TIME DEFAULT NULL,
        \`end_time\`    TIME DEFAULT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`idx_halaqa_day\` (\`halaqa_id\`, \`day_of_week\`),
        CONSTRAINT \`fk_hs_halaqa\`
          FOREIGN KEY (\`halaqa_id\`) REFERENCES \`halaqat\` (\`id\`)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }
}
