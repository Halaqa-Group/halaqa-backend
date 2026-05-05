import { MigrationInterface, QueryRunner } from 'typeorm';

export class StudentsAndGuardians1777700000000 implements MigrationInterface {
  name = 'StudentsAndGuardians1777700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`halaqat\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`school_id\` INT NOT NULL,
        \`name\` VARCHAR(100) NOT NULL,
        \`status\` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        KEY \`idx_halaqa_school\` (\`school_id\`),
        CONSTRAINT \`fk_halaqa_school\` FOREIGN KEY (\`school_id\`) REFERENCES \`schools\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`students\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`school_id\` INT NOT NULL,
        \`name\` VARCHAR(100) NOT NULL,
        \`gender\` ENUM('male', 'female') NOT NULL,
        \`dob\` DATE DEFAULT NULL,
        \`join_date\` DATE NOT NULL,
        \`status\` ENUM('active', 'inactive', 'graduated') NOT NULL DEFAULT 'active',
        \`daily_hifz_pages_capacity\` DECIMAL(5,2) NOT NULL DEFAULT 1,
        \`daily_near_pages_capacity\` DECIMAL(5,2) NOT NULL DEFAULT 5,
        \`daily_far_pages_capacity\` DECIMAL(5,2) NOT NULL DEFAULT 10,
        \`notes\` TEXT DEFAULT NULL,
        \`photo_url\` TEXT DEFAULT NULL,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at\` DATETIME(6) DEFAULT NULL,
        PRIMARY KEY (\`id\`),
        KEY \`idx_student_school_status\` (\`school_id\`, \`status\`),
        CONSTRAINT \`fk_student_school\` FOREIGN KEY (\`school_id\`) REFERENCES \`schools\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`student_guardians\` (
        \`student_id\` INT NOT NULL,
        \`guardian_user_id\` INT NOT NULL,
        \`relation\` ENUM('father','mother','grandfather','grandmother','uncle','aunt','sibling','other') NOT NULL,
        \`is_primary\` TINYINT(1) NOT NULL DEFAULT 0,
        \`can_pickup\` TINYINT(1) NOT NULL DEFAULT 1,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`student_id\`, \`guardian_user_id\`),
        KEY \`idx_sg_guardian\` (\`guardian_user_id\`),
        CONSTRAINT \`fk_sg_student\` FOREIGN KEY (\`student_id\`) REFERENCES \`students\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_sg_guardian\` FOREIGN KEY (\`guardian_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`student_halaqa\` (
        \`student_id\` INT NOT NULL,
        \`halaqa_id\` INT NOT NULL,
        \`assigned_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`student_id\`, \`halaqa_id\`),
        CONSTRAINT \`fk_sh_student\` FOREIGN KEY (\`student_id\`) REFERENCES \`students\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_sh_halaqa\` FOREIGN KEY (\`halaqa_id\`) REFERENCES \`halaqat\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`halaqa_teachers\` (
        \`halaqa_id\` INT NOT NULL,
        \`teacher_user_id\` INT NOT NULL,
        \`is_primary\` TINYINT(1) NOT NULL DEFAULT 0,
        \`acting_as_primary\` TINYINT(1) NOT NULL DEFAULT 0,
        \`start_date\` DATE NOT NULL,
        \`end_date\` DATE DEFAULT NULL,
        PRIMARY KEY (\`halaqa_id\`, \`teacher_user_id\`),
        CONSTRAINT \`fk_ht_halaqa\` FOREIGN KEY (\`halaqa_id\`) REFERENCES \`halaqat\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_ht_teacher\` FOREIGN KEY (\`teacher_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`supervisor_halaqat\` (
        \`supervisor_user_id\` INT NOT NULL,
        \`halaqa_id\` INT NOT NULL,
        PRIMARY KEY (\`supervisor_user_id\`, \`halaqa_id\`),
        CONSTRAINT \`fk_suph_supervisor\` FOREIGN KEY (\`supervisor_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_suph_halaqa\` FOREIGN KEY (\`halaqa_id\`) REFERENCES \`halaqat\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`supervisor_halaqat\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`halaqa_teachers\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`student_halaqa\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`student_guardians\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`students\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`halaqat\``);
  }
}
