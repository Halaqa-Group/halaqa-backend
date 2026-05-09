import { MigrationInterface, QueryRunner } from 'typeorm';

export class HalaqaActivityLogsCreate1778600000000 implements MigrationInterface {
  name = 'HalaqaActivityLogsCreate1778600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`halaqa_activity_logs\` (
        \`id\`                BIGINT NOT NULL AUTO_INCREMENT,
        \`school_id\`         INT NOT NULL,
        \`halaqa_id\`         INT DEFAULT NULL,
        \`action\` ENUM(
          'halaqa_created',   'halaqa_updated',          'halaqa_archived',
          'halaqa_completed', 'halaqa_restored',
          'teacher_assigned', 'teacher_unassigned',      'teacher_role_changed',
          'acting_started',   'acting_extended',         'acting_ended',
          'student_enrolled', 'student_re_enrolled',     'student_unenrolled',
          'student_transferred_in', 'student_transferred_out', 'student_completed',
          'supervisor_assigned', 'supervisor_unassigned',
          'schedule_updated'
        ) NOT NULL,
        \`actor_user_id\`     INT DEFAULT NULL,
        \`target_user_id\`    INT DEFAULT NULL
          COMMENT 'teacher or supervisor involved',
        \`target_student_id\` INT DEFAULT NULL
          COMMENT 'when action involves a student',
        \`from_halaqa_id\`    INT DEFAULT NULL
          COMMENT 'for transfers',
        \`to_halaqa_id\`      INT DEFAULT NULL
          COMMENT 'for transfers',
        \`metadata\`          JSON DEFAULT NULL
          COMMENT 'old/new values, reasons, etc.',
        \`notes\`             TEXT DEFAULT NULL,
        \`created_at\`        DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        KEY \`idx_hal_school_time\`   (\`school_id\`,         \`created_at\`),
        KEY \`idx_hal_halaqa_time\`   (\`halaqa_id\`,         \`created_at\`),
        KEY \`idx_hal_student_time\`  (\`target_student_id\`, \`created_at\`),
        KEY \`idx_hal_action_time\`   (\`action\`,            \`created_at\`),
        CONSTRAINT \`fk_hal_school\`
          FOREIGN KEY (\`school_id\`)   REFERENCES \`schools\`  (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_hal_halaqa\`
          FOREIGN KEY (\`halaqa_id\`)   REFERENCES \`halaqat\`  (\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`fk_hal_actor\`
          FOREIGN KEY (\`actor_user_id\`)    REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`fk_hal_target_user\`
          FOREIGN KEY (\`target_user_id\`)   REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`fk_hal_target_student\`
          FOREIGN KEY (\`target_student_id\`) REFERENCES \`students\` (\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`fk_hal_from\`
          FOREIGN KEY (\`from_halaqa_id\`)   REFERENCES \`halaqat\` (\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`fk_hal_to\`
          FOREIGN KEY (\`to_halaqa_id\`)     REFERENCES \`halaqat\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`halaqa_activity_logs\``);
  }
}
