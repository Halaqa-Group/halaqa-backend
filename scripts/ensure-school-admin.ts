/**
 * Safety net: create a principal (manager) user for a school ONLY IF that
 * school currently has no users linked to it. If the school already has any
 * user, the script does nothing.
 *
 * Useful when a school row exists (created via API/migration) but got left
 * without a way to log in.
 *
 * Target school: DEFAULT_SCHOOL_ID when it points to a real school, otherwise
 * the single existing school. Ambiguous (multiple schools, no DEFAULT_SCHOOL_ID
 * match) is treated as an error so you don't seed into the wrong tenant.
 *
 * Required env: same BOOTSTRAP_ADMIN_* vars as bootstrap-school.ts.
 *
 * Usage:
 *   pnpm ensure:admin
 */
import 'dotenv/config';
import 'reflect-metadata';
import AppDataSource from '../src/config/data-source';
import { School } from '../src/modules/tenant/school.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { ensureAdminUser, readAdminInput } from './lib/bootstrap-helpers';

async function main(): Promise<void> {
  await AppDataSource.initialize();
  console.log(
    `Connected to "${process.env.DB_NAME}" @ ${process.env.DB_HOST ?? 'localhost'}:${process.env.DB_PORT ?? 3306}`,
  );

  const school = await resolveSchool();
  if (!school) return;

  const userCount = await AppDataSource.getRepository(User).count({
    where: { schoolId: school.id },
    withDeleted: true,
  });
  if (userCount > 0) {
    console.log(
      `School "${school.name}" (id=${school.id}) already has ${userCount} user(s) — nothing to do.`,
    );
    return;
  }

  // No users at all → validate admin input and create one.
  const admin = readAdminInput();
  const userId = await ensureAdminUser(AppDataSource, school.id, admin);
  console.log(
    `\nDone. Created principal id=${userId} (${admin.email}) for school "${school.name}". ` +
      `Log in with national ID ${admin.idNumber}.`,
  );
}

/** Resolve the single target school, or explain why it's ambiguous. */
async function resolveSchool(): Promise<School | null> {
  const schools = AppDataSource.getRepository(School);
  const wantedId = Number(process.env.DEFAULT_SCHOOL_ID);

  if (wantedId) {
    const byId = await schools.findOne({ where: { id: wantedId } });
    if (byId) return byId;
  }

  const all = await schools.find({ order: { id: 'ASC' } });
  if (all.length === 0) {
    console.error(
      'No school exists yet. Run `pnpm bootstrap:school` first to create one.',
    );
    process.exitCode = 1;
    return null;
  }
  if (all.length === 1) return all[0];

  console.error(
    `Multiple schools exist and DEFAULT_SCHOOL_ID (${process.env.DEFAULT_SCHOOL_ID ?? 'unset'}) ` +
      `does not match any of them. Set DEFAULT_SCHOOL_ID to the target school id:`,
  );
  for (const s of all) console.error(`  - id=${s.id}  ${s.name}`);
  process.exitCode = 1;
  return null;
}

main()
  .catch((err: unknown) => {
    console.error('\nFailed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => {
    void AppDataSource.destroy();
  });
