import { MigrationInterface, QueryRunner } from 'typeorm';

export class StudentIdNumber1777800000000 implements MigrationInterface {
  name = 'StudentIdNumber1777800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`students\` ADD COLUMN \`id_number\` VARCHAR(20) NULL AFTER \`name\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`students\` ADD UNIQUE KEY \`idx_student_idnum_school\` (\`id_number\`, \`school_id\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`students\` DROP KEY \`idx_student_idnum_school\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`students\` DROP COLUMN \`id_number\``,
    );
  }
}
