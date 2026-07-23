import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Decouple `users.name` and `students.name` into the four-part Arabic name:
 * first (الاسم الأول) / second (اسم الأب) / third (اسم الجد) / family (اسم العائلة).
 *
 * `name` survives as a STORED generated column derived from the four parts, so
 * every existing reader keeps working untouched — the `name LIKE` searches in
 * the users/students services, `ORDER BY s.name` on the halaqa roster, and the
 * denormalized `teacher_name` / `student_name` / `actor_name` projections across
 * the halaqat and achievements modules. Only writers had to change.
 *
 * MySQL cannot convert an existing plain column into a STORED generated one
 * (ER_UNSUPPORTED_ALTER_INPLACE), so `name` is dropped and re-added after the
 * parts are backfilled from it. It moves to the end of the column order.
 *
 * IMPORTANT: FULL_NAME_EXPRESSION below must stay byte-identical to
 * `src/common/person-name.ts`. TypeORM records it in `typeorm_metadata` and
 * compares against it on every schema sync; a mismatch makes a synchronizing
 * boot drop and rebuild the column every time.
 */
const FULL_NAME_EXPRESSION =
  "CONCAT_WS(' ', NULLIF(first_name, ''), NULLIF(second_name, ''), NULLIF(third_name, ''), NULLIF(family_name, ''))";

const NAME_PART_LENGTH = '50';
const FULL_NAME_LENGTH = '203'; // 4 × 50 + 3 separating spaces

/**
 * Split the legacy single `name` into four parts so that re-joining them with
 * FULL_NAME_EXPRESSION reproduces the original string exactly:
 *
 *   1 token   → first
 *   2 tokens  → first, family
 *   3 tokens  → first, second, family
 *   4+ tokens → first, second, third, family(= everything after the 3rd token)
 *
 * Parts with no token are set to '' — NULLIF in the generated expression drops
 * them, so no doubled spaces appear. These legacy rows are the only ones allowed
 * to hold an empty part; the API requires all four on every write.
 */
function backfillSql(table: string): string {
  const n = 'TRIM(`name`)';
  const tokens = `(CHAR_LENGTH(${n}) - CHAR_LENGTH(REPLACE(${n}, ' ', '')) + 1)`;
  const nth = (i: number) =>
    `SUBSTRING_INDEX(SUBSTRING_INDEX(${n}, ' ', ${i}), ' ', -1)`;

  return `UPDATE \`${table}\` SET
      \`first_name\`  = SUBSTRING_INDEX(${n}, ' ', 1),
      \`second_name\` = CASE WHEN ${tokens} >= 3 THEN ${nth(2)} ELSE '' END,
      \`third_name\`  = CASE WHEN ${tokens} >= 4 THEN ${nth(3)} ELSE '' END,
      \`family_name\` = CASE
        WHEN ${tokens} = 1 THEN ''
        WHEN ${tokens} <= 3 THEN SUBSTRING_INDEX(${n}, ' ', -1)
        ELSE SUBSTRING(${n}, CHAR_LENGTH(SUBSTRING_INDEX(${n}, ' ', 3)) + 2)
      END`;
}

interface ColumnState {
  exists: boolean;
  generated: boolean;
}

/**
 * MySQL and MariaDB both apply DDL outside the transaction, so the surrounding
 * ROLLBACK cannot undo a half-finished migration. Re-running then dies on
 * whichever step already succeeded — `Duplicate column name 'first_name'`, for
 * one. Every step below is therefore guarded by the live schema so the
 * migration resumes from wherever it stopped instead of needing manual repair
 * SQL on each affected machine.
 */
async function columnState(
  queryRunner: QueryRunner,
  table: string,
  column: string,
): Promise<ColumnState> {
  const rows = (await queryRunner.query(
    `SELECT \`EXTRA\`, \`GENERATION_EXPRESSION\`
       FROM \`INFORMATION_SCHEMA\`.\`COLUMNS\`
      WHERE \`TABLE_SCHEMA\` = DATABASE()
        AND \`TABLE_NAME\` = ? AND \`COLUMN_NAME\` = ?`,
    [table, column],
  )) as { EXTRA: string | null; GENERATION_EXPRESSION: string | null }[];
  if (rows.length === 0) return { exists: false, generated: false };
  const row = rows[0];
  return {
    exists: true,
    // Both engines populate GENERATION_EXPRESSION; EXTRA is a belt-and-braces
    // second signal ("STORED GENERATED").
    generated:
      (row.GENERATION_EXPRESSION ?? '') !== '' ||
      /GENERATED/i.test(row.EXTRA ?? ''),
  };
}

export class SplitPersonNames1779800000000 implements MigrationInterface {
  name = 'SplitPersonNames1779800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['users', 'students']) {
      const parts = await columnState(queryRunner, table, 'first_name');
      if (!parts.exists) {
        // Nullable first so the ALTER succeeds on a table with existing rows.
        await queryRunner.query(
          `ALTER TABLE \`${table}\`
             ADD COLUMN \`first_name\`  VARCHAR(${NAME_PART_LENGTH}) NULL AFTER \`school_id\`,
             ADD COLUMN \`second_name\` VARCHAR(${NAME_PART_LENGTH}) NULL AFTER \`first_name\`,
             ADD COLUMN \`third_name\`  VARCHAR(${NAME_PART_LENGTH}) NULL AFTER \`second_name\`,
             ADD COLUMN \`family_name\` VARCHAR(${NAME_PART_LENGTH}) NULL AFTER \`third_name\``,
        );
      }

      // A plain `name` column is the only source the parts can be filled from,
      // and its presence means the backfill has not happened yet.
      const legacyName = await columnState(queryRunner, table, 'name');
      if (legacyName.exists && !legacyName.generated) {
        await queryRunner.query(backfillSql(table));
      }

      // Idempotent: a no-op when the columns are already NOT NULL.
      await queryRunner.query(
        `ALTER TABLE \`${table}\`
           MODIFY COLUMN \`first_name\`  VARCHAR(${NAME_PART_LENGTH}) NOT NULL,
           MODIFY COLUMN \`second_name\` VARCHAR(${NAME_PART_LENGTH}) NOT NULL,
           MODIFY COLUMN \`third_name\`  VARCHAR(${NAME_PART_LENGTH}) NOT NULL,
           MODIFY COLUMN \`family_name\` VARCHAR(${NAME_PART_LENGTH}) NOT NULL`,
      );

      // Drop + re-add: neither engine converts a plain column to STORED in place.
      //
      // Raw SQL rather than queryRunner.addColumn: TypeORM would append
      // `NOT NULL` (or `NULL`) after `STORED`, which MariaDB rejects outright
      // (ER_PARSE_ERROR 1064). It only omits that clause when the driver is
      // configured as `mariadb`, and this project configures `mysql` even when
      // pointed at MariaDB. Emitting no nullability clause at all is accepted by
      // both engines and leaves the column nullable on both — hence
      // `nullable: true` on the entity, even though CONCAT_WS with a literal
      // separator can never actually produce NULL.
      if (legacyName.exists && !legacyName.generated) {
        await queryRunner.query(
          `ALTER TABLE \`${table}\` DROP COLUMN \`name\``,
        );
      }
      if (!legacyName.generated) {
        await queryRunner.query(
          `ALTER TABLE \`${table}\`
             ADD COLUMN \`name\` VARCHAR(${FULL_NAME_LENGTH})
             AS (${FULL_NAME_EXPRESSION}) STORED`,
        );
      }
      // addColumn would have registered the expression in `typeorm_metadata`;
      // doing it by hand keeps schema comparison working (TypeORM reads the
      // expression back from there, not from the engine's own catalog).
      await queryRunner.query(
        `DELETE FROM \`typeorm_metadata\`
          WHERE \`type\` = 'GENERATED_COLUMN' AND \`schema\` = DATABASE()
            AND \`table\` = ? AND \`name\` = 'name'`,
        [table],
      );
      await queryRunner.query(
        `INSERT INTO \`typeorm_metadata\` (\`type\`, \`schema\`, \`table\`, \`name\`, \`value\`)
         VALUES ('GENERATED_COLUMN', DATABASE(), ?, 'name', ?)`,
        [table, FULL_NAME_EXPRESSION],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['users', 'students']) {
      await queryRunner.query(`ALTER TABLE \`${table}\` DROP COLUMN \`name\``);
      await queryRunner.query(
        `DELETE FROM \`typeorm_metadata\`
          WHERE \`type\` = 'GENERATED_COLUMN' AND \`schema\` = DATABASE()
            AND \`table\` = ? AND \`name\` = 'name'`,
        [table],
      );
      await queryRunner.query(
        `ALTER TABLE \`${table}\` ADD COLUMN \`name\` VARCHAR(100) NOT NULL DEFAULT '' AFTER \`school_id\``,
      );
      await queryRunner.query(
        `UPDATE \`${table}\` SET \`name\` = ${FULL_NAME_EXPRESSION}`,
      );
      await queryRunner.query(
        `ALTER TABLE \`${table}\` ALTER COLUMN \`name\` DROP DEFAULT`,
      );
      await queryRunner.query(
        `ALTER TABLE \`${table}\`
           DROP COLUMN \`first_name\`,
           DROP COLUMN \`second_name\`,
           DROP COLUMN \`third_name\`,
           DROP COLUMN \`family_name\``,
      );
    }
  }
}
