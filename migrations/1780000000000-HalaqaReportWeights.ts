import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Daily-report track weights on each halaqa (§5 of the daily evaluation report
 * spec). Four DECIMAL(5,2) columns — hifz / near / far / ethics — that must sum
 * to 100. Defaults 40 / 25 / 30 / 5 cover every existing row automatically, so
 * the CHECK constraint holds on the current data. Ethics is independent and is
 * never redistributed; the academic weight is `100 - ethics_weight`.
 */
export class HalaqaReportWeights1780000000000 implements MigrationInterface {
  name = 'HalaqaReportWeights1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('halaqat', [
      new TableColumn({
        name: 'hifz_weight',
        type: 'decimal',
        precision: 5,
        scale: 2,
        isNullable: false,
        default: 40,
      }),
      new TableColumn({
        name: 'near_weight',
        type: 'decimal',
        precision: 5,
        scale: 2,
        isNullable: false,
        default: 25,
      }),
      new TableColumn({
        name: 'far_weight',
        type: 'decimal',
        precision: 5,
        scale: 2,
        isNullable: false,
        default: 30,
      }),
      new TableColumn({
        name: 'ethics_weight',
        type: 'decimal',
        precision: 5,
        scale: 2,
        isNullable: false,
        default: 5,
      }),
    ]);

    // Belt-and-braces against writes that bypass DTO validation.
    await queryRunner.query(
      `ALTER TABLE \`halaqat\`
       ADD CONSTRAINT \`chk_halaqa_report_weights_sum\`
       CHECK (\`hifz_weight\` + \`near_weight\` + \`far_weight\` + \`ethics_weight\` = 100.00)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`halaqat\` DROP CHECK \`chk_halaqa_report_weights_sum\``,
    );
    await queryRunner.dropColumns('halaqat', [
      'hifz_weight',
      'near_weight',
      'far_weight',
      'ethics_weight',
    ]);
  }
}
