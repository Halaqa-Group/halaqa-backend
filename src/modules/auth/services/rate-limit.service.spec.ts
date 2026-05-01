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

      expect(result).toBe('ok');
    });

    it('returns rate_limited when the IP exceeds the per-IP cap', async () => {
      const repo = makeRepo();
      repo.count.mockResolvedValueOnce(RATE_LIMIT.IP_MAX_PER_WINDOW);

      const result = await makeService(repo).check('a@b.com', '1.2.3.4');

      expect(result).toBe('rate_limited');
      expect(repo.find).not.toHaveBeenCalled();
    });

    it('returns rate_limited when the email failure count exceeds the cap', async () => {
      const repo = makeRepo();
      repo.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(RATE_LIMIT.EMAIL_FAIL_MAX_PER_WINDOW);

      const result = await makeService(repo).check('a@b.com', '1.2.3.4');

      expect(result).toBe('rate_limited');
      expect(repo.find).not.toHaveBeenCalled();
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

      expect(result).toBe('account_locked');
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

      expect(result).toBe('ok');
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

      expect(result).toBe('ok');
    });

    it('returns ok when fewer than 5 attempts exist for the email', async () => {
      const repo = makeRepo();
      repo.find.mockResolvedValue([attempt(60_000), attempt(120_000)]);

      const result = await makeService(repo).check('a@b.com', '1.2.3.4');

      expect(result).toBe('ok');
    });
  });
});
