import { Repository } from 'typeorm';
import {
  LoginAttempt,
  LoginAttemptStatus,
} from '../entities/login-attempt.entity';
import { RATE_LIMIT } from '../rate-limit.config';
import { RateLimitService } from './rate-limit.service';

interface MockRepo {
  count: jest.Mock;
  find: jest.Mock;
}

function makeRepo(): MockRepo {
  return {
    count: jest.fn().mockResolvedValue(0),
    find: jest.fn().mockResolvedValue([]),
  };
}

function makeService(repo: MockRepo) {
  return new RateLimitService(repo as unknown as Repository<LoginAttempt>);
}

const NOW = new Date('2026-05-01T12:00:00Z').getTime();

function attempt(
  msAgo: number,
  status: LoginAttemptStatus = 'wrong_password',
): LoginAttempt {
  return { attemptedAt: new Date(NOW - msAgo), status } as LoginAttempt;
}

/**
 * Shape of the lockout-streak lookup, as opposed to the single-row ASC lookup
 * the Retry-After hint uses. Lets a caps test assert the streak query was
 * short-circuited without also forbidding the retry-after query.
 */
function lockoutQuery() {
  return expect.objectContaining({
    order: { attemptedAt: 'DESC' },
    take: RATE_LIMIT.LOCKOUT_THRESHOLD,
  }) as unknown;
}

describe('RateLimitService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('check', () => {
    it('returns ok when there is no relevant recent activity', async () => {
      const repo = makeRepo();

      const result = await makeService(repo).check('a@b.com', '1.2.3.4');

      expect(result.verdict).toBe('ok');
    });

    it('returns rate_limited when the IP exceeds the per-IP cap', async () => {
      const repo = makeRepo();
      repo.count.mockResolvedValueOnce(RATE_LIMIT.IP_MAX_PER_WINDOW);

      const result = await makeService(repo).check('a@b.com', '1.2.3.4');

      expect(result.verdict).toBe('rate_limited');
      expect(repo.find).not.toHaveBeenCalledWith(lockoutQuery());
    });

    it('returns rate_limited when the email failure count exceeds the cap', async () => {
      const repo = makeRepo();
      repo.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(RATE_LIMIT.EMAIL_FAIL_MAX_PER_WINDOW);

      const result = await makeService(repo).check('a@b.com', '1.2.3.4');

      expect(result.verdict).toBe('rate_limited');
      expect(repo.find).not.toHaveBeenCalledWith(lockoutQuery());
    });

    it('returns account_locked when the last 5 attempts are all failures within the lockout window', async () => {
      const repo = makeRepo();
      repo.find.mockResolvedValue([
        attempt(60_000),
        attempt(120_000),
        attempt(180_000),
        attempt(240_000),
        attempt(300_000),
      ]);

      const result = await makeService(repo).check('a@b.com', '1.2.3.4');

      expect(result.verdict).toBe('account_locked');
    });

    it('returns ok when a success appears among the last 5 attempts (streak reset)', async () => {
      const repo = makeRepo();
      repo.find.mockResolvedValue([
        attempt(60_000, 'wrong_password'),
        attempt(120_000, 'success'),
        attempt(180_000, 'wrong_password'),
        attempt(240_000, 'wrong_password'),
        attempt(300_000, 'wrong_password'),
      ]);

      const result = await makeService(repo).check('a@b.com', '1.2.3.4');

      expect(result.verdict).toBe('ok');
    });

    it('returns ok when the latest of 5 failures is older than the 30-min lockout window', async () => {
      const repo = makeRepo();
      const old = (RATE_LIMIT.LOCKOUT_MIN + 5) * 60 * 1000;
      repo.find.mockResolvedValue([
        attempt(old),
        attempt(old + 60_000),
        attempt(old + 120_000),
        attempt(old + 180_000),
        attempt(old + 240_000),
      ]);

      const result = await makeService(repo).check('a@b.com', '1.2.3.4');

      expect(result.verdict).toBe('ok');
    });

    it('returns ok when fewer than 5 attempts exist for the email', async () => {
      const repo = makeRepo();
      repo.find.mockResolvedValue([attempt(60_000), attempt(120_000)]);

      const result = await makeService(repo).check('a@b.com', '1.2.3.4');

      expect(result.verdict).toBe('ok');
    });
  });

  // The limiter records its own rejections (for audit) via AuthService. If those
  // rows fed back into these counters the lockout would renew itself on every
  // blocked retry and never expire. These tests use a repo mock that actually
  // applies the `where.status` filter — a mock that ignored it would pass just
  // as happily with the filter removed.
  describe('self-perpetuating lockout regression', () => {
    /** Minimal evaluator for the `Not(In([...]))` filter the service builds. */
    function passesStatusFilter(row: LoginAttempt, status: unknown): boolean {
      const op = status as
        | { type?: string; child?: { type?: string; value?: string[] } }
        | undefined;
      if (op?.type !== 'not' || op.child?.type !== 'in') return true;
      return !(op.child.value ?? []).includes(row.status);
    }

    function makeFilteringRepo(history: LoginAttempt[]): MockRepo {
      return {
        find: jest.fn((opts: { where: { status?: unknown }; take: number }) =>
          Promise.resolve(
            history
              .filter((r) => passesStatusFilter(r, opts.where.status))
              .slice(0, opts.take),
          ),
        ),
        count: jest.fn(
          (opts: { where: { status?: unknown; ipAddress?: string } }) =>
            // The per-IP cap is volume-based and intentionally counts every
            // row; these tests isolate the per-email failure cap, so the IP
            // query answers 0 rather than double-counting the same history.
            Promise.resolve(
              opts.where.ipAddress !== undefined
                ? 0
                : history.filter((r) =>
                    passesStatusFilter(r, opts.where.status),
                  ).length,
            ),
        ),
      };
    }

    it('expires the lockout 30 minutes after the last real failure, however many blocked retries followed', async () => {
      const expired = (RATE_LIMIT.LOCKOUT_MIN + 1) * 60 * 1000;
      const history = [
        // A burst of retries while locked out — recorded, but not credentials.
        ...Array.from({ length: 12 }, (_, i) =>
          attempt(i * 1_000, 'account_locked'),
        ),
        // The streak that actually caused the lock, now past the window.
        ...Array.from({ length: 5 }, (_, i) =>
          attempt(expired + i * 60_000, 'wrong_password'),
        ),
      ];

      const result = await makeService(makeFilteringRepo(history)).check(
        'a@b.com',
        '1.2.3.4',
      );

      expect(result.verdict).toBe('ok');
    });

    it('still locks while the last real failure is inside the 30-minute window', async () => {
      const fresh = (RATE_LIMIT.LOCKOUT_MIN - 1) * 60 * 1000;
      const history = [
        ...Array.from({ length: 12 }, (_, i) =>
          attempt(i * 1_000, 'account_locked'),
        ),
        ...Array.from({ length: 5 }, (_, i) =>
          attempt(fresh + i * 60_000, 'wrong_password'),
        ),
      ];

      const result = await makeService(makeFilteringRepo(history)).check(
        'a@b.com',
        '1.2.3.4',
      );

      expect(result.verdict).toBe('account_locked');
    });

    it('reports the remaining lockout time, capped at LOCKOUT_MIN', async () => {
      const tenMinutesAgo = 10 * 60 * 1000;
      const history = Array.from({ length: 5 }, (_, i) =>
        attempt(tenMinutesAgo + i * 60_000, 'wrong_password'),
      );

      const result = await makeService(makeFilteringRepo(history)).check(
        'a@b.com',
        '1.2.3.4',
      );

      expect(result.verdict).toBe('account_locked');
      // 30-minute lockout, 10 minutes elapsed since the last real failure.
      expect(result.retryAfterSeconds).toBe((RATE_LIMIT.LOCKOUT_MIN - 10) * 60);
    });

    it('does not let blocked retries alone trip the per-email failure cap', async () => {
      // Twice the cap, but every row is the limiter's own rejection.
      const history = Array.from(
        { length: RATE_LIMIT.EMAIL_FAIL_MAX_PER_WINDOW * 2 },
        (_, i) => attempt(i * 1_000, 'rate_limited'),
      );

      const result = await makeService(makeFilteringRepo(history)).check(
        'a@b.com',
        '1.2.3.4',
      );

      expect(result.verdict).toBe('ok');
    });
  });
});
