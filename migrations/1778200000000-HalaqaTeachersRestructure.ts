import { MigrationInterface, QueryRunner } from 'typeorm';

// Pre-flight: run these queries manually before applying this migration
// and resolve any rows returned before proceeding.
//
// -- Duplicate active assignments (same halaqa + teacher, both active):
// SELECT halaqa_id, teacher_user_id, COUNT(*) c FROM halaqa_teachers
// WHERE end_date IS NULL GROUP BY halaqa_id, teacher_user_id HAVING c > 1;
//
// -- Multiple active primaries on the same halaqa:
// SELECT halaqa_id, COUNT(*) c FROM halaqa_teachers
// WHERE is_primary = 1 AND end_date IS NULL GROUP BY halaqa_id HAVING c > 1;
//
// -- Multiple active actings on the same halaqa:
// SELECT halaqa_id, COUNT(*) c FROM halaqa_teachers
// WHERE acting_as_primary = 1 AND end_date IS NULL GROUP BY halaqa_id HAVING c > 1;

export class HalaqaTeachersRestructure1778200000000 implements MigrationInterface {
  name = 'HalaqaTeachersRestructure1778200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop both FKs first — the composite PK is the only index supporting
    //    the FK on halaqa_id and the FK on teacher_user_id.
    //    MySQL refuses DROP PRIMARY KEY while those FKs exist with no other index.
    //    FK names vary across environments (DB_SYNCHRONIZE generates per-DB
    //    hashes), so look them up by referenced column instead of hardcoding.
    const fkRows: Array<{ CONSTRAINT_NAME: string; COLUMN_NAME: string }> =
      await queryRunner.query(
        `SELECT CONSTRAINT_NAME, COLUMN_NAME
         FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'halaqa_teachers'
           AND COLUMN_NAME IN ('halaqa_id', 'teacher_user_id')
           AND REFERENCED_TABLE_NAME IS NOT NULL`,
      );
    for (const { CONSTRAINT_NAME } of fkRows) {
      await queryRunner.query(
        `ALTER TABLE \`halaqa_teachers\` DROP FOREIGN KEY \`${CONSTRAINT_NAME}\``,
      );
    }

    // 2. Drop composite PK (now safe — no FKs depend on it)
    await queryRunner.query(
      `ALTER TABLE \`halaqa_teachers\` DROP PRIMARY KEY`,
    );

    // 3. Add surrogate id + all new columns
    await queryRunner.query(`
      ALTER TABLE \`halaqa_teachers\`
        ADD COLUMN \`id\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST,
        ADD COLUMN \`role\` ENUM('main','assistant','substitute')
          NOT NULL DEFAULT 'main' AFTER \`teacher_user_id\`,
        ADD COLUMN \`acting_starts_at\` DATE DEFAULT NULL AFTER \`acting_as_primary\`,
        ADD COLUMN \`acting_ends_at\`   DATE DEFAULT NULL AFTER \`acting_starts_at\`,
        ADD COLUMN \`end_reason\`
          ENUM('reassigned','left_school','vacation','retired','other')
          DEFAULT NULL AFTER \`end_date\`,
        ADD COLUMN \`assigned_by\` INT DEFAULT NULL AFTER \`end_reason\`,
        ADD COLUMN \`notes\`       VARCHAR(255) DEFAULT NULL AFTER \`assigned_by\`,
        ADD COLUMN \`created_at\`  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) AFTER \`notes\`,
        ADD COLUMN \`updated_at\`  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
          ON UPDATE CURRENT_TIMESTAMP(6) AFTER \`created_at\`
    `);

    // 4. Backfill role from is_primary for existing rows
    await queryRunner.query(
      `UPDATE \`halaqa_teachers\`
       SET \`role\` = IF(\`is_primary\` = 1, 'main', 'assistant')`,
    );

    // 5. Drop is_primary (role is now the source of truth)
    await queryRunner.query(
      `ALTER TABLE \`halaqa_teachers\` DROP COLUMN \`is_primary\``,
    );

    // 6. Add virtual generated columns, unique constraints, and regular indexes.
    //    idx_ht_halaqa_active (halaqa_id, end_date) will support fk_ht_halaqa
    //    when we re-add it below.
    await queryRunner.query(`
      ALTER TABLE \`halaqa_teachers\`
        ADD COLUMN \`active_lock\` VARCHAR(30) GENERATED ALWAYS AS (
          IF(\`end_date\` IS NULL,
             CONCAT(\`halaqa_id\`, '-', \`teacher_user_id\`),
             NULL)
        ) VIRTUAL,
        ADD COLUMN \`primary_lock\` INT GENERATED ALWAYS AS (
          IF(\`role\` = 'main' AND \`end_date\` IS NULL, \`halaqa_id\`, NULL)
        ) VIRTUAL,
        ADD COLUMN \`acting_lock\` INT GENERATED ALWAYS AS (
          IF(\`acting_as_primary\` = 1 AND \`end_date\` IS NULL, \`halaqa_id\`, NULL)
        ) VIRTUAL,
        ADD UNIQUE KEY \`idx_one_active_assignment\` (\`active_lock\`),
        ADD UNIQUE KEY \`idx_one_main_per_halaqa\`   (\`primary_lock\`),
        ADD UNIQUE KEY \`idx_one_acting_per_halaqa\`  (\`acting_lock\`),
        ADD INDEX \`idx_ht_halaqa_active\`   (\`halaqa_id\`,        \`end_date\`),
        ADD INDEX \`idx_ht_teacher_active\`  (\`teacher_user_id\`,  \`end_date\`)
    `);

    // 7. Add CHECK constraint: active substitute must always be acting
    await queryRunner.query(`
      ALTER TABLE \`halaqa_teachers\`
        ADD CONSTRAINT \`chk_substitute_must_act\` CHECK (
          NOT (\`role\` = 'substitute'
               AND \`acting_as_primary\` = 0
               AND \`end_date\` IS NULL)
        )
    `);

    // 8. Re-add fk_ht_halaqa (CASCADE, same as bootstrap)
    await queryRunner.query(`
      ALTER TABLE \`halaqa_teachers\`
        ADD CONSTRAINT \`fk_ht_halaqa\`
          FOREIGN KEY (\`halaqa_id\`) REFERENCES \`halaqat\` (\`id\`)
          ON DELETE CASCADE
    `);

    // 9. Re-add fk_ht_teacher with RESTRICT (was CASCADE in bootstrap)
    await queryRunner.query(`
      ALTER TABLE \`halaqa_teachers\`
        ADD CONSTRAINT \`fk_ht_teacher\`
          FOREIGN KEY (\`teacher_user_id\`) REFERENCES \`users\` (\`id\`)
          ON DELETE RESTRICT
    `);

    // 10. Add new fk_ht_assigner
    await queryRunner.query(`
      ALTER TABLE \`halaqa_teachers\`
        ADD CONSTRAINT \`fk_ht_assigner\`
          FOREIGN KEY (\`assigned_by\`) REFERENCES \`users\` (\`id\`)
          ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop ALL FKs first — before touching any indexes or the PK.
    // idx_ht_halaqa_active supports fk_ht_halaqa; dropping it while the FK
    // exists would leave MySQL with no supporting index.
    await queryRunner.query(
      `ALTER TABLE \`halaqa_teachers\` DROP FOREIGN KEY \`fk_ht_assigner\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`halaqa_teachers\` DROP FOREIGN KEY \`fk_ht_teacher\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`halaqa_teachers\` DROP FOREIGN KEY \`fk_ht_halaqa\``,
    );

    // Drop CHECK constraint before any role-dependent data changes
    await queryRunner.query(
      `ALTER TABLE \`halaqa_teachers\` DROP CHECK \`chk_substitute_must_act\``,
    );

    // Drop unique/regular indexes before dropping the generated columns they cover
    await queryRunner.query(
      `ALTER TABLE \`halaqa_teachers\` DROP INDEX \`idx_one_active_assignment\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`halaqa_teachers\` DROP INDEX \`idx_one_main_per_halaqa\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`halaqa_teachers\` DROP INDEX \`idx_one_acting_per_halaqa\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`halaqa_teachers\` DROP INDEX \`idx_ht_halaqa_active\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`halaqa_teachers\` DROP INDEX \`idx_ht_teacher_active\``,
    );

    // Drop generated columns before dropping the regular columns they reference
    await queryRunner.query(`
      ALTER TABLE \`halaqa_teachers\`
        DROP COLUMN \`active_lock\`,
        DROP COLUMN \`primary_lock\`,
        DROP COLUMN \`acting_lock\`
    `);

    // Re-add is_primary and backfill from role before dropping role
    await queryRunner.query(`
      ALTER TABLE \`halaqa_teachers\`
        ADD COLUMN \`is_primary\` TINYINT(1) NOT NULL DEFAULT 0 AFTER \`teacher_user_id\`
    `);
    await queryRunner.query(
      `UPDATE \`halaqa_teachers\` SET \`is_primary\` = IF(\`role\` = 'main', 1, 0)`,
    );

    // Drop the columns added during up
    await queryRunner.query(`
      ALTER TABLE \`halaqa_teachers\`
        DROP COLUMN \`updated_at\`,
        DROP COLUMN \`created_at\`,
        DROP COLUMN \`notes\`,
        DROP COLUMN \`assigned_by\`,
        DROP COLUMN \`end_reason\`,
        DROP COLUMN \`acting_ends_at\`,
        DROP COLUMN \`acting_starts_at\`,
        DROP COLUMN \`role\`
    `);

    // Remove AUTO_INCREMENT before dropping the PK column
    await queryRunner.query(
      `ALTER TABLE \`halaqa_teachers\` MODIFY COLUMN \`id\` INT NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`halaqa_teachers\` DROP PRIMARY KEY`,
    );
    await queryRunner.query(
      `ALTER TABLE \`halaqa_teachers\` DROP COLUMN \`id\``,
    );

    // Restore composite PK — this creates the index that will support the FKs below
    await queryRunner.query(
      `ALTER TABLE \`halaqa_teachers\`
       ADD PRIMARY KEY (\`halaqa_id\`, \`teacher_user_id\`)`,
    );

    // Re-add original FKs (both CASCADE as in the bootstrap)
    await queryRunner.query(`
      ALTER TABLE \`halaqa_teachers\`
        ADD CONSTRAINT \`fk_ht_halaqa\`
          FOREIGN KEY (\`halaqa_id\`) REFERENCES \`halaqat\` (\`id\`)
          ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE \`halaqa_teachers\`
        ADD CONSTRAINT \`fk_ht_teacher\`
          FOREIGN KEY (\`teacher_user_id\`) REFERENCES \`users\` (\`id\`)
          ON DELETE CASCADE
    `);
  }
}
