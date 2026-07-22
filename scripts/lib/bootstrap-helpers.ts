/**
 * Shared building blocks for the standalone bootstrap scripts
 * (`bootstrap-school.ts`, `ensure-school-admin.ts`).
 *
 * These run OUTSIDE the Nest runtime via the CLI DataSource, so anything the
 * app normally seeds on boot (roles) has to be ensured here explicitly.
 */
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { PalestinianIdValidator } from '../../src/common/validators/palestinian-id.validator';
import { Role } from '../../src/modules/roles/role.entity';
import { FIXED_ROLES } from '../../src/modules/roles/roles.seeder';
import { UserRole } from '../../src/modules/roles/user-role.entity';
import { School } from '../../src/modules/tenant/school.entity';
import { User } from '../../src/modules/users/entities/user.entity';

const MIN_PASSWORD_LENGTH = 8; // matches the app's password DTOs
const idValidator = new PalestinianIdValidator();

export interface AdminInput {
  firstName: string;
  secondName: string;
  thirdName: string;
  familyName: string;
  idNumber: string;
  email: string;
  password: string;
}

/** Read + validate the admin details from environment variables. Throws on bad input. */
export function readAdminInput(): AdminInput {
  const firstName = required('BOOTSTRAP_ADMIN_FIRST_NAME');
  const secondName = required('BOOTSTRAP_ADMIN_SECOND_NAME');
  const thirdName = required('BOOTSTRAP_ADMIN_THIRD_NAME');
  const familyName = required('BOOTSTRAP_ADMIN_FAMILY_NAME');
  const email = required('BOOTSTRAP_ADMIN_EMAIL');
  const password = required('BOOTSTRAP_ADMIN_PASSWORD');
  const rawId = required('BOOTSTRAP_ADMIN_ID_NUMBER');

  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `BOOTSTRAP_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }

  const idNumber = idValidator.normalize(rawId);
  const verdict = idValidator.validate(idNumber);
  if (!verdict.ok) {
    throw new Error(
      `BOOTSTRAP_ADMIN_ID_NUMBER "${rawId}" is not a valid national ID (expected 9 digits).`,
    );
  }
  if (verdict.warnings.includes('checksum_invalid')) {
    console.warn(
      `Warning: id_number ${idNumber} has an invalid checksum (allowed, but double-check it).`,
    );
  }

  return {
    firstName,
    secondName,
    thirdName,
    familyName,
    email,
    password,
    idNumber,
  };
}

function required(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`Missing required env var ${key}.`);
  return value;
}

export function bcryptRounds(): number {
  return Number(process.env.BCRYPT_ROUNDS ?? 12);
}

/** Idempotently insert the five fixed roles. Returns them by slug. */
export async function ensureRoles(ds: DataSource): Promise<Map<string, Role>> {
  const repo = ds.getRepository(Role);
  for (const seed of FIXED_ROLES) {
    const existing = await repo.findOne({ where: { slug: seed.slug } });
    if (existing) continue;
    await repo.insert(seed);
    console.log(`Seeded role "${seed.slug}"`);
  }
  const all = await repo.find();
  return new Map(all.map((r) => [r.slug, r]));
}

/**
 * Ensure a `principal` admin exists for the school. Idempotent: reuses an
 * existing user matched by email or id_number in the school, otherwise creates
 * one and links the principal role. Returns the user id.
 */
export async function ensureAdminUser(
  ds: DataSource,
  schoolId: number,
  input: AdminInput,
): Promise<number> {
  const users = ds.getRepository(User);
  const roles = await ensureRoles(ds);
  const principal = roles.get('principal');
  if (!principal) throw new Error('Principal role missing after seeding.');

  const existing = await users.findOne({
    where: [
      { email: input.email, schoolId },
      { idNumber: input.idNumber, schoolId },
    ],
    withDeleted: true,
  });

  let userId: number;
  if (existing) {
    userId = existing.id;
    console.log(
      `Admin user already present: ${existing.name} <${existing.email}> (id=${userId}) — reusing.`,
    );
  } else {
    const passwordHash = await bcrypt.hash(input.password, bcryptRounds());
    const created = await users.save(
      users.create({
        schoolId,
        firstName: input.firstName,
        secondName: input.secondName,
        thirdName: input.thirdName,
        familyName: input.familyName,
        idNumber: input.idNumber,
        email: input.email,
        password: passwordHash,
        status: 'active',
      }),
    );
    userId = created.id;
    console.log(`Created admin user ${input.email} (id=${userId}).`);
  }

  await linkRole(ds, userId, principal.id);
  return userId;
}

async function linkRole(
  ds: DataSource,
  userId: number,
  roleId: number,
): Promise<void> {
  const repo = ds.getRepository(UserRole);
  const link = await repo.findOne({ where: { userId, roleId } });
  if (link) return;
  await repo.insert({ userId, roleId, assignedBy: null });
  console.log(`Linked user ${userId} → principal role.`);
}
