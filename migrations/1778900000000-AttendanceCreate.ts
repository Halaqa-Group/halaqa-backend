import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Attendance & scheduling module: school_schedules, holidays,
 * teacher_attendances, student_attendances.
 *
 * Day convention: 0 = Saturday … 6 = Friday.
 * `recorded_by` is nullable (NULL = row auto-seeded by the midnight cron).
 */
export class AttendanceCreate1778900000000 implements MigrationInterface {
  name = 'AttendanceCreate1778900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`school_schedules\` (
        \`id\`             INT NOT NULL AUTO_INCREMENT,
        \`school_id\`      INT NOT NULL,
        \`day_of_week\`    TINYINT NOT NULL COMMENT '0=Saturday … 6=Friday',
        \`effective_from\` DATE NOT NULL,
        \`effective_to\`   DATE DEFAULT NULL COMMENT 'NULL = current period',
        \`created_by\`     INT DEFAULT NULL,
        \`created_at\`     DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`notes\`          VARCHAR(255) DEFAULT NULL,
        PRIMARY KEY (\`id\`),
        KEY \`idx_ss_school_eff\` (\`school_id\`, \`effective_from\`, \`effective_to\`),
        KEY \`idx_ss_day\`        (\`school_id\`, \`day_of_week\`),
        CONSTRAINT \`chk_ss_day\` CHECK (\`day_of_week\` BETWEEN 0 AND 6),
        CONSTRAINT \`fk_ss_school\`
          FOREIGN KEY (\`school_id\`)  REFERENCES \`schools\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_ss_creator\`
          FOREIGN KEY (\`created_by\`) REFERENCES \`users\`   (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`holidays\` (
        \`id\`           INT NOT NULL AUTO_INCREMENT,
        \`school_id\`    INT NOT NULL,
        \`holiday_date\` DATE NOT NULL,
        \`description\`  VARCHAR(200) NOT NULL,
        \`created_by\`   INT DEFAULT NULL,
        \`created_at\`   DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_holiday_school_date\` (\`school_id\`, \`holiday_date\`),
        CONSTRAINT \`fk_hol_school\`
          FOREIGN KEY (\`school_id\`)  REFERENCES \`schools\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_hol_creator\`
          FOREIGN KEY (\`created_by\`) REFERENCES \`users\`   (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`teacher_attendances\` (
        \`id\`                  BIGINT NOT NULL AUTO_INCREMENT,
        \`school_id\`           INT NOT NULL,
        \`user_id\`             INT NOT NULL,
        \`attendance_date\`     DATE NOT NULL,
        \`status\`              ENUM('present','absent','excused','late') NOT NULL DEFAULT 'present',
        \`excuse_note\`         TEXT DEFAULT NULL,
        \`recorded_by\`         INT DEFAULT NULL COMMENT 'NULL = auto-seeded by cron',
        \`recorded_at\`         DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`client_uuid\`         CHAR(36) DEFAULT NULL,
        \`client_recorded_at\`  DATETIME(6) DEFAULT NULL,
        \`device_id\`           VARCHAR(64) DEFAULT NULL,
        \`modified_by\`         INT DEFAULT NULL,
        \`modified_at\`         DATETIME(6) DEFAULT NULL,
        \`modification_reason\` TEXT DEFAULT NULL,
        \`original_status\`     VARCHAR(20) DEFAULT NULL,
        \`created_at\`          DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_ta_user_date\` (\`user_id\`, \`attendance_date\`),
        UNIQUE KEY \`uk_ta_client\`    (\`client_uuid\`),
        KEY \`idx_ta_school_date\`     (\`school_id\`, \`attendance_date\`),
        KEY \`idx_ta_status\`          (\`status\`),
        CONSTRAINT \`fk_ta_school\`
          FOREIGN KEY (\`school_id\`)   REFERENCES \`schools\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_ta_user\`
          FOREIGN KEY (\`user_id\`)     REFERENCES \`users\`   (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`fk_ta_recorder\`
          FOREIGN KEY (\`recorded_by\`) REFERENCES \`users\`   (\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`fk_ta_modifier\`
          FOREIGN KEY (\`modified_by\`) REFERENCES \`users\`   (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`student_attendances\` (
        \`id\`                  BIGINT NOT NULL AUTO_INCREMENT,
        \`school_id\`           INT NOT NULL,
        \`student_id\`          INT NOT NULL,
        \`attendance_date\`     DATE NOT NULL,
        \`status\`              ENUM('present','absent','excused','late') NOT NULL DEFAULT 'present',
        \`excuse_note\`         TEXT DEFAULT NULL,
        \`recorded_by\`         INT DEFAULT NULL COMMENT 'NULL = auto-seeded by cron',
        \`recorded_at\`         DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`client_uuid\`         CHAR(36) DEFAULT NULL,
        \`client_recorded_at\`  DATETIME(6) DEFAULT NULL,
        \`device_id\`           VARCHAR(64) DEFAULT NULL,
        \`modified_by\`         INT DEFAULT NULL,
        \`modified_at\`         DATETIME(6) DEFAULT NULL,
        \`modification_reason\` TEXT DEFAULT NULL,
        \`original_status\`     VARCHAR(20) DEFAULT NULL,
        \`created_at\`          DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_sa_student_date\` (\`student_id\`, \`attendance_date\`),
        UNIQUE KEY \`uk_sa_client\`       (\`client_uuid\`),
        KEY \`idx_sa_school_date\`        (\`school_id\`, \`attendance_date\`),
        KEY \`idx_sa_status\`             (\`status\`),
        CONSTRAINT \`fk_sa_school\`
          FOREIGN KEY (\`school_id\`)   REFERENCES \`schools\`  (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_sa_student\`
          FOREIGN KEY (\`student_id\`)  REFERENCES \`students\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`fk_sa_recorder\`
          FOREIGN KEY (\`recorded_by\`) REFERENCES \`users\`    (\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`fk_sa_modifier\`
          FOREIGN KEY (\`modified_by\`) REFERENCES \`users\`    (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`student_attendances\``);
    await queryRunner.query(`DROP TABLE \`teacher_attendances\``);
    await queryRunner.query(`DROP TABLE \`holidays\``);
    await queryRunner.query(`DROP TABLE \`school_schedules\``);
  }
}
