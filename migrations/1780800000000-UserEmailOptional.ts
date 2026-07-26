import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Email is no longer required when creating a user — the national id_number is
 * the mandatory identifier and doubles as a login handle.
 *
 * The `idx_user_email_school` unique key stays: MySQL/MariaDB unique indexes
 * ignore NULLs, so any number of users per school may have no email while two
 * users still cannot share one.
 */
export class UserEmailOptional1780800000000 implements MigrationInterface {
  name = 'UserEmailOptional1780800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` MODIFY COLUMN \`email\` VARCHAR(255) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rows created without an email get a deterministic placeholder so the
    // NOT NULL + UNIQUE constraints can be reapplied.
    await queryRunner.query(
      `UPDATE \`users\` SET \`email\` = CONCAT('user-', \`id\`, '@placeholder.invalid') WHERE \`email\` IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` MODIFY COLUMN \`email\` VARCHAR(255) NOT NULL`,
    );
  }
}
