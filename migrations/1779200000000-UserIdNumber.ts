import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserIdNumber1779200000000 implements MigrationInterface {
  name = 'UserIdNumber1779200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add nullable first so the statement succeeds on a table with existing rows.
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD COLUMN \`id_number\` VARCHAR(20) NULL AFTER \`name\``,
    );
    // Backfill legacy rows with a deterministic, unique 9-digit placeholder
    // (zero-padded id) so the NOT NULL + UNIQUE constraints can be applied.
    // These are placeholders — real IDs must be set afterwards.
    await queryRunner.query(
      `UPDATE \`users\` SET \`id_number\` = LPAD(\`id\`, 9, '0') WHERE \`id_number\` IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` MODIFY COLUMN \`id_number\` VARCHAR(20) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD UNIQUE KEY \`idx_user_idnum_school\` (\`id_number\`, \`school_id\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP KEY \`idx_user_idnum_school\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`id_number\``,
    );
  }
}
