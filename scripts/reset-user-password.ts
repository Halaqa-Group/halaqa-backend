/**
 * Interactive password reset for a single user, scoped to a school.
 *
 * Flow:
 *   1. Pick a school from the list.
 *   2. Enter the user's `id_number` (national ID).
 *   3. Enter (and confirm) a new password — input is hidden.
 * The password is bcrypt-hashed (BCRYPT_ROUNDS, default 12), `token_version`
 * is bumped, and every active refresh token is revoked — mirroring the app's
 * admin-reset behaviour so existing sessions are cut on next request.
 *
 * Usage:
 *   pnpm reset-password
 *   # or: pnpm exec ts-node scripts/reset-user-password.ts
 *
 * Reads DB config from .env (same as the TypeORM CLI DataSource).
 */
import 'dotenv/config';
import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { IsNull } from 'typeorm';
import AppDataSource from '../src/config/data-source';
import { RefreshToken } from '../src/modules/auth/entities/refresh-token.entity';
import { School } from '../src/modules/tenant/school.entity';
import { User } from '../src/modules/users/entities/user.entity';

const MIN_PASSWORD_LENGTH = 8; // matches ResetPasswordDto / AdminResetPasswordDto

// Raw-mode control character codes.
const CODE_CTRL_C = 3;
const CODE_CTRL_D = 4;
const CODE_BACKSPACE = 8; // Windows
const CODE_DEL = 127; // Unix
const CODE_SPACE = 32;

// ─── Prompt helpers (raw stdin — reliable hidden input cross-platform) ─────────

/**
 * Reads one line from stdin. When `hidden`, typed characters are not echoed.
 * Uses raw mode char-by-char so it works on Windows terminals where readline's
 * output-muting is unreliable.
 */
function prompt(query: string, hidden = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    stdout.write(query);

    let input = '';
    const isTTY = stdin.isTTY === true;
    const wasRaw = isTTY ? stdin.isRaw === true : false;
    if (isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const cleanup = (): void => {
      stdin.removeListener('data', onData);
      if (isTTY) stdin.setRawMode(wasRaw);
      stdin.pause();
    };

    const onData = (chunk: string): void => {
      for (const ch of chunk) {
        const code = ch.charCodeAt(0);

        if (ch === '\n' || ch === '\r' || code === CODE_CTRL_D) {
          stdout.write('\n');
          cleanup();
          resolve(input);
          return;
        }
        if (code === CODE_CTRL_C) {
          stdout.write('\n');
          cleanup();
          reject(new Error('Cancelled by user (Ctrl-C).'));
          return;
        }
        if (code === CODE_BACKSPACE || code === CODE_DEL) {
          if (input.length > 0) {
            input = input.slice(0, -1);
            if (!hidden) stdout.write('\b \b');
          }
          continue;
        }
        if (code >= CODE_SPACE) {
          input += ch;
          if (!hidden) stdout.write(ch);
        }
      }
    };

    stdin.on('data', onData);
  });
}

async function ask(query: string): Promise<string> {
  return (await prompt(query)).trim();
}

function askHidden(query: string): Promise<string> {
  return prompt(query, true);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  await AppDataSource.initialize();
  console.log(
    `Connected to database "${process.env.DB_NAME}" @ ${process.env.DB_HOST ?? 'localhost'}:${process.env.DB_PORT ?? 3306}`,
  );

  const bcryptRounds = Number(process.env.BCRYPT_ROUNDS ?? 12);

  // 1. Pick a school
  const schools = await AppDataSource.getRepository(School).find({
    order: { name: 'ASC' },
  });
  if (schools.length === 0) {
    console.error('No schools found.');
    return;
  }

  console.log('\nSchools:');
  schools.forEach((s, i) => {
    console.log(`  ${String(i + 1).padStart(2)}. ${s.name}  (id=${s.id}, ${s.status})`);
  });

  const pick = await ask('\nSelect a school by number: ');
  const idx = Number(pick) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= schools.length) {
    console.error('Invalid selection.');
    return;
  }
  const school = schools[idx];

  // 2. Enter the user's id_number, retry until a live user is found
  const userRepo = AppDataSource.getRepository(User);
  let user: User | null = null;
  for (;;) {
    const idNumber = await ask(`Enter user id_number for "${school.name}": `);
    if (!idNumber) {
      console.error('id_number cannot be empty.');
      continue;
    }

    // Exact match in the selected school, including soft-deleted (for diagnosis).
    const inSchool = await userRepo.find({
      where: { idNumber, schoolId: school.id },
      withDeleted: true,
    });
    const live = inSchool.find((u) => !u.deletedAt);
    if (live) {
      user = live;
      break;
    }

    if (inSchool.length > 0) {
      // Exists in this school but soft-deleted.
      const deleted = inSchool[0];
      console.error(`User "${deleted.name}" exists in this school but is soft-deleted (deleted_at set).`);
      const proceed = await ask('Reset this soft-deleted user anyway? (y/N): ');
      if (proceed.toLowerCase() === 'y') {
        user = deleted;
        break;
      }
    } else {
      console.error(`No user with id_number "${idNumber}" in "${school.name}".`);
      // Diagnostic: where does this id_number actually live?
      const elsewhere = await userRepo.find({ where: { idNumber }, withDeleted: true });
      if (elsewhere.length > 0) {
        console.error('This id_number exists in other school(s):');
        for (const u of elsewhere) {
          const sc = schools.find((s) => s.id === u.schoolId);
          console.error(
            `  - ${u.name} <${u.email}>  school_id=${u.schoolId}` +
              `${sc ? ` (${sc.name})` : ''}  status=${u.status}${u.deletedAt ? '  [soft-deleted]' : ''}`,
          );
        }
      } else {
        console.error('This id_number does not exist in ANY school in this database.');
      }
    }

    const again = await ask('Try another id_number? (y/N): ');
    if (again.toLowerCase() !== 'y') return;
  }

  console.log(`\nMatched user: ${user.name} <${user.email}>  (id=${user.id}, status=${user.status})`);
  const confirm = await ask("Reset this user's password? (y/N): ");
  if (confirm.toLowerCase() !== 'y') {
    console.log('Aborted.');
    return;
  }

  // 3. Enter + confirm the new password (hidden)
  let password = '';
  for (;;) {
    password = await askHidden('New password: ');
    if (password.length < MIN_PASSWORD_LENGTH) {
      console.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      continue;
    }
    const confirmPassword = await askHidden('Confirm new password: ');
    if (password !== confirmPassword) {
      console.error('Passwords do not match. Try again.');
      continue;
    }
    break;
  }

  const passwordHash = await bcrypt.hash(password, bcryptRounds);

  // Apply: set hash + bump token_version, revoke active refresh tokens (one tx).
  await AppDataSource.transaction(async (manager) => {
    await manager
      .getRepository(User)
      .createQueryBuilder()
      .update(User)
      .set({ password: passwordHash, tokenVersion: () => 'token_version + 1' })
      .where('id = :id', { id: user!.id })
      .execute();

    await manager
      .getRepository(RefreshToken)
      .update(
        { userId: user!.id, revokedAt: IsNull() },
        { revokedAt: new Date(), revokedReason: 'password_change' },
      );
  });

  console.log(`\nDone. Password updated for ${user.name} (id=${user.id}). Active sessions revoked.`);
}

main()
  .catch((err: unknown) => {
    console.error('\nFailed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void AppDataSource.destroy();
  });
