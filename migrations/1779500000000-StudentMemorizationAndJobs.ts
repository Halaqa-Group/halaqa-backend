import { MigrationInterface, QueryRunner, Table, TableColumn } from 'typeorm';

/**
 * Per-student memorized-ayat bitmap (BINARY(780) = 6236 ayat, one bit each) and
 * the durable recompute queue that maintains it from approved Hifz achievements.
 */
export class StudentMemorizationAndJobs1779500000000 implements MigrationInterface {
  name = 'StudentMemorizationAndJobs1779500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── students.memorized_ayat ──────────────────────────────────────────────
    await queryRunner.addColumn(
      'students',
      new TableColumn({
        name: 'memorized_ayat',
        type: 'varbinary',
        length: '780',
        isNullable: true,
      }),
    );

    // ── memorization_jobs (one row per student; unique student_id) ────────────
    await queryRunner.createTable(
      new Table({
        name: 'memorization_jobs',
        columns: [
          {
            name: 'id',
            type: 'bigint',
            unsigned: true,
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'student_id',
            type: 'int',
            isNullable: false,
            isUnique: true,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'processing', 'done', 'failed'],
            default: "'pending'",
            isNullable: false,
          },
          {
            name: 'attempts',
            type: 'int',
            unsigned: true,
            default: 0,
            isNullable: false,
          },
          { name: 'last_error', type: 'text', isNullable: true },
          {
            name: 'created_at',
            type: 'datetime',
            precision: 6,
            default: 'CURRENT_TIMESTAMP(6)',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'datetime',
            precision: 6,
            default: 'CURRENT_TIMESTAMP(6)',
            onUpdate: 'CURRENT_TIMESTAMP(6)',
            isNullable: false,
          },
          {
            name: 'processed_at',
            type: 'datetime',
            precision: 6,
            isNullable: true,
          },
        ],
        indices: [
          {
            name: 'idx_memorization_job_status',
            columnNames: ['status', 'updated_at'],
          },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('memorization_jobs', true);
    await queryRunner.dropColumn('students', 'memorized_ayat');
  }
}
