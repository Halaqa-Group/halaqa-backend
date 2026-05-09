import { MigrationInterface, QueryRunner } from 'typeorm';

export class HalaqatAlter1778100000000 implements MigrationInterface {
  name = 'HalaqatAlter1778100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Map any legacy 'inactive' rows before the enum is narrowed
    await queryRunner.query(
      `UPDATE \`halaqat\` SET \`status\` = 'archived' WHERE \`status\` = 'inactive'`,
    );

    await queryRunner.query(`
      ALTER TABLE \`halaqat\`
        ADD COLUMN \`type\` ENUM('Memorization','Tajweed','Aqeedah')
          NOT NULL DEFAULT 'Memorization' AFTER \`name\`,
        ADD COLUMN \`evaluation_settings\` JSON DEFAULT NULL AFTER \`type\`,
        MODIFY COLUMN \`status\` ENUM('active','archived','completed')
          NOT NULL DEFAULT 'active',
        ADD COLUMN \`deleted_at\` DATETIME(6) DEFAULT NULL AFTER \`updated_at\`,
        ADD INDEX \`idx_halaqa_school_status\` (\`school_id\`, \`status\`)
    `);

    await queryRunner.query(
      `ALTER TABLE \`halaqat\` DROP INDEX \`idx_halaqa_school\``,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`halaqat\` ADD INDEX \`idx_halaqa_school\` (\`school_id\`)`,
    );
    await queryRunner.query(
      `ALTER TABLE \`halaqat\` DROP INDEX \`idx_halaqa_school_status\``,
    );

    // Map 'archived'/'completed' back before reverting the enum
    await queryRunner.query(
      `UPDATE \`halaqat\` SET \`status\` = 'inactive'
       WHERE \`status\` IN ('archived','completed')`,
    );

    await queryRunner.query(`
      ALTER TABLE \`halaqat\`
        DROP COLUMN \`deleted_at\`,
        MODIFY COLUMN \`status\` ENUM('active','inactive') NOT NULL DEFAULT 'active',
        DROP COLUMN \`evaluation_settings\`,
        DROP COLUMN \`type\`
    `);
  }
}
