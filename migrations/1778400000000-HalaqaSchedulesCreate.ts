import { MigrationInterface, QueryRunner } from 'typeorm';

// halaqa_schedules did not exist as a bootstrap stub — this is a fresh CREATE.
export class HalaqaSchedulesCreate1778400000000 implements MigrationInterface {
  name = 'HalaqaSchedulesCreate1778400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
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

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`halaqa_schedules\``);
  }
}
