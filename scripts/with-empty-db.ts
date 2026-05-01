/**
 * One-off helper for the initial migration generation.
 *
 * `migration:generate` diffs entities against a live schema. With
 * `synchronize: true` in dev the diff is empty, so we point TypeORM at a
 * brand-new empty MySQL database for the generate run, then drop it.
 *
 * Usage:
 *   pnpm exec ts-node scripts/with-empty-db.ts create   # creates halaqa_migrations
 *   pnpm exec ts-node scripts/with-empty-db.ts drop     # drops halaqa_migrations
 */
import 'dotenv/config';
import * as mysql from 'mysql2/promise';

const TEMP_DB = 'halaqa_migrations';

async function main(): Promise<void> {
  const action = process.argv[2];
  if (action !== 'create' && action !== 'drop') {
    console.error('Usage: with-empty-db.ts <create|drop>');
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
  });

  try {
    if (action === 'create') {
      await conn.query(
        `CREATE DATABASE IF NOT EXISTS \`${TEMP_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      );
      console.log(`Created (or kept) database \`${TEMP_DB}\``);
    } else {
      await conn.query(`DROP DATABASE IF EXISTS \`${TEMP_DB}\``);
      console.log(`Dropped database \`${TEMP_DB}\``);
    }
  } finally {
    await conn.end();
  }
}

void main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
