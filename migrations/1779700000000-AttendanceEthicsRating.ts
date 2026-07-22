import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * تقييم الأخلاق — a 1..5 behaviour score on each student attendance row.
 *
 * Follows the module's "default then correct" model: the column default (5)
 * covers every seeded row, so the midnight seed cron needs no change and every
 * existing row backfills to 5 automatically.
 *
 * Students only — `teacher_attendances` deliberately has no equivalent.
 */
export class AttendanceEthicsRating1779700000000 implements MigrationInterface {
  name = 'AttendanceEthicsRating1779700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'student_attendances',
      new TableColumn({
        name: 'ethics_rating',
        type: 'tinyint',
        unsigned: true,
        isNullable: false,
        default: 5,
      }),
    );

    // Belt-and-braces against writes that bypass the DTO validation.
    await queryRunner.query(
      `ALTER TABLE \`student_attendances\`
       ADD CONSTRAINT \`chk_sa_ethics_rating\`
       CHECK (\`ethics_rating\` BETWEEN 1 AND 5)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`student_attendances\` DROP CHECK \`chk_sa_ethics_rating\``,
    );
    await queryRunner.dropColumn('student_attendances', 'ethics_rating');
  }
}
