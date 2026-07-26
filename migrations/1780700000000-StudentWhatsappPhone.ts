import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The student's own WhatsApp contact number.
 *
 * Two columns, not one E.164 string: the dial code has to come back out intact
 * to preselect the country in the picker, and re-parsing it out of a joined
 * string is ambiguous (`+1` covers ~20 countries). See `src/common/phone.ts`.
 *
 * Both nullable — existing students have no number and it stays optional.
 */
export class StudentWhatsappPhone1780700000000 implements MigrationInterface {
  name = 'StudentWhatsappPhone1780700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`students\` ADD COLUMN \`phone_country_code\` VARCHAR(8) NULL AFTER \`id_number\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`students\` ADD COLUMN \`phone\` VARCHAR(20) NULL AFTER \`phone_country_code\``,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`students\` DROP COLUMN \`phone\``);
    await queryRunner.query(
      `ALTER TABLE \`students\` DROP COLUMN \`phone_country_code\``,
    );
  }
}
