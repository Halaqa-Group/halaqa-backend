/**
 * One-shot launch bootstrap: ensure a school and a principal (manager) user
 * exist so the system can be used immediately after deployment.
 *
 * Idempotent by design:
 *   - If ANY school already exists, no new school is created — the existing one
 *     is reused (matched by DEFAULT_SCHOOL_ID when present, else the first).
 *   - The admin user is matched by email/id_number, so re-running never
 *     duplicates rows.
 *
 * Required env (in addition to the usual DB_* / DEFAULT_SCHOOL_ID):
 *   BOOTSTRAP_ADMIN_NAME        e.g. "أحمد المدير"
 *   BOOTSTRAP_ADMIN_ID_NUMBER   national ID, 9 digits (login identifier)
 *   BOOTSTRAP_ADMIN_EMAIL       login/contact email
 *   BOOTSTRAP_ADMIN_PASSWORD    min 8 chars
 * Optional:
 *   BOOTSTRAP_SCHOOL_NAME       default "Halaqa"
 *   BOOTSTRAP_SCHOOL_TIMEZONE   default "Asia/Hebron"
 *
 * Usage:
 *   pnpm bootstrap:school
 */
import 'dotenv/config';
import 'reflect-metadata';
import AppDataSource from '../src/config/data-source';
import { School } from '../src/modules/tenant/school.entity';
import { ensureAdminUser, readAdminInput } from './lib/bootstrap-helpers';

async function main(): Promise<void> {
  // Validate admin input up front so we fail before touching the DB.
  const admin = readAdminInput();

  await AppDataSource.initialize();
  console.log(
    `Connected to "${process.env.DB_NAME}" @ ${process.env.DB_HOST ?? 'localhost'}:${process.env.DB_PORT ?? 3306}`,
  );

  const schoolId = await ensureSchool();
  const userId = await ensureAdminUser(AppDataSource, schoolId, admin);

  console.log(
    `\nDone. School id=${schoolId}, principal id=${userId} (${admin.email}). ` +
      `Log in with national ID ${admin.idNumber}.`,
  );
}

/** Create a school only if none exists; otherwise reuse the existing one. */
async function ensureSchool(): Promise<number> {
  const schools = AppDataSource.getRepository(School);
  const count = await schools.count();

  if (count > 0) {
    const wantedId = Number(process.env.DEFAULT_SCHOOL_ID);
    const existing =
      (wantedId
        ? await schools.findOne({ where: { id: wantedId } })
        : null) ?? (await schools.find({ order: { id: 'ASC' }, take: 1 }))[0];
    console.log(
      `A school already exists (${count} total) — skipping creation. ` +
        `Using "${existing.name}" (id=${existing.id}).`,
    );
    return existing.id;
  }

  const name = process.env.BOOTSTRAP_SCHOOL_NAME?.trim() || 'Halaqa';
  const timezone =
    process.env.BOOTSTRAP_SCHOOL_TIMEZONE?.trim() || 'Asia/Hebron';
  const wantedId = Number(process.env.DEFAULT_SCHOOL_ID) || undefined;

  const created = await schools.save(
    schools.create({ id: wantedId, name, timezone, status: 'active' }),
  );
  console.log(`Created school "${name}" (id=${created.id}).`);
  return created.id;
}

main()
  .catch((err: unknown) => {
    console.error('\nFailed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => {
    void AppDataSource.destroy();
  });
