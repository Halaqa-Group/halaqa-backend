import { MigrationInterface, QueryRunner, Table, TableColumn } from 'typeorm';

export class AchievementMethodsAndPlanItemOrder1779100000000 implements MigrationInterface {
  name = 'AchievementMethodsAndPlanItemOrder1779100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── achievements: completion_method + recitation_method ──────────────────
    await queryRunner.addColumns('achievements', [
      new TableColumn({
        name: 'completion_method',
        type: 'enum',
        enum: ['quick', 'mushaf'],
        default: "'quick'",
        isNullable: false,
      }),
      new TableColumn({
        name: 'recitation_method',
        type: 'enum',
        enum: ['full', 'test'],
        default: "'full'",
        isNullable: false,
      }),
    ]);

    // ── achievement_recitation_positions ─────────────────────────────────────
    await queryRunner.createTable(
      new Table({
        name: 'achievement_recitation_positions',
        columns: [
          {
            name: 'id',
            type: 'bigint',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
            unsigned: true,
          },
          { name: 'achievement_id', type: 'bigint', unsigned: true, isNullable: false },
          { name: 'start_surah', type: 'smallint', unsigned: true, isNullable: false },
          { name: 'start_verse', type: 'smallint', unsigned: true, isNullable: false },
          { name: 'end_surah', type: 'smallint', unsigned: true, isNullable: false },
          { name: 'end_verse', type: 'smallint', unsigned: true, isNullable: false },
          { name: 'created_at', type: 'datetime', precision: 6, default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        ],
        indices: [
          { name: 'idx_recitation_position_achievement', columnNames: ['achievement_id'] },
        ],
        foreignKeys: [
          {
            columnNames: ['achievement_id'],
            referencedTableName: 'achievements',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );

    // ── weekly_plan_items: order (reconciliation priority tie-breaker) ────────
    await queryRunner.addColumn(
      'weekly_plan_items',
      new TableColumn({
        name: 'order',
        type: 'int',
        unsigned: true,
        default: 0,
        isNullable: false,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('weekly_plan_items', 'order');
    await queryRunner.dropTable('achievement_recitation_positions', true);
    await queryRunner.dropColumns('achievements', ['recitation_method', 'completion_method']);
  }
}
