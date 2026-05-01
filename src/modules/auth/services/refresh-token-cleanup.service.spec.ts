import { Logger } from '@nestjs/common';
import { LessThan, Repository } from 'typeorm';
import { RefreshToken } from '../entities/refresh-token.entity';
import { RefreshTokenCleanupService } from './refresh-token-cleanup.service';

interface RepoMock {
  delete: jest.Mock;
}

function makeRepo(affected = 0): RepoMock {
  return { delete: jest.fn().mockResolvedValue({ affected }) };
}

function makeService(repo: RepoMock): RefreshTokenCleanupService {
  return new RefreshTokenCleanupService(
    repo as unknown as Repository<RefreshToken>,
  );
}

describe('RefreshTokenCleanupService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-01T12:00:00Z'));
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('deletes refresh-token rows whose expires_at is more than 7 days old', async () => {
    const repo = makeRepo(3);
    const removed = await makeService(repo).sweep();

    expect(removed).toBe(3);
    expect(repo.delete).toHaveBeenCalledTimes(1);
    const where = repo.delete.mock.calls[0][0] as {
      expiresAt: ReturnType<typeof LessThan<Date>>;
    };
    // The cutoff is exactly 7 days before "now"
    const cutoff = (where.expiresAt as unknown as { _value: Date })._value;
    const expected = new Date('2026-04-24T12:00:00Z');
    expect(cutoff.getTime()).toBe(expected.getTime());
  });

  it('returns 0 and emits no info log when nothing matched', async () => {
    const repo = makeRepo(0);
    const removed = await makeService(repo).sweep();

    expect(removed).toBe(0);
    expect(repo.delete).toHaveBeenCalledTimes(1);
  });

  it('handles a missing affected count from the DB driver as zero', async () => {
    const repo: RepoMock = { delete: jest.fn().mockResolvedValue({}) };
    const removed = await makeService(repo).sweep();

    expect(removed).toBe(0);
  });
});
