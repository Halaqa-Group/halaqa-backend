import { MigrationInterface, QueryRunner } from 'typeorm';

export class SupervisorHalaqatAlter1778500000000 implements MigrationInterface {
  name = 'SupervisorHalaqatAlter1778500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`supervisor_halaqat\`
        ADD COLUMN \`assigned_at\`
          DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        ADD KEY \`idx_sh_halaqa\` (\`halaqa_id\`)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`supervisor_halaqat\` DROP INDEX \`idx_sh_halaqa\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`supervisor_halaqat\` DROP COLUMN \`assigned_at\``,
    );
  }
}
