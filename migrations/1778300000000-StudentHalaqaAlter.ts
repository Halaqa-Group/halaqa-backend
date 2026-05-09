import { MigrationInterface, QueryRunner } from 'typeorm';

export class StudentHalaqaAlter1778300000000 implements MigrationInterface {
  name = 'StudentHalaqaAlter1778300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // CHANGE COLUMN truncates the time portion of existing DATETIME(6) rows.
    // Safe if the table is empty; review before running if it has data.
    await queryRunner.query(`
      ALTER TABLE \`student_halaqa\`
        CHANGE COLUMN \`assigned_at\` \`enrollment_date\`
          DATE NOT NULL DEFAULT (CURRENT_DATE),
        ADD COLUMN \`status\`
          ENUM('active','transferred','completed','archived')
          NOT NULL DEFAULT 'active'
          AFTER \`enrollment_date\`
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`student_halaqa\` DROP COLUMN \`status\``,
    );
    await queryRunner.query(`
      ALTER TABLE \`student_halaqa\`
        CHANGE COLUMN \`enrollment_date\` \`assigned_at\`
          DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    `);
  }
}
