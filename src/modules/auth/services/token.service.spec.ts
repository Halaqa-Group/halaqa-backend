import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DataSource, Repository } from 'typeorm';
import { RefreshToken } from '../entities/refresh-token.entity';
import { RequestContext } from '../request-context';
import { TokenService } from './token.service';

const CTX: RequestContext = {
  ip: '1.2.3.4',
  userAgent: 'jest',
  deviceType: 'web',
  deviceName: null,
};

interface MockRepo {
  findOne: jest.Mock;
  update: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
  find: jest.Mock;
}

function makeRepo(): MockRepo {
  return {
    findOne: jest.fn(),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    save: jest
      .fn()
      .mockImplementation((row: Record<string, unknown>) =>
        Promise.resolve({ ...row, id: 'new-id' }),
      ),
    create: jest.fn().mockImplementation((row: unknown) => row),
    find: jest.fn().mockResolvedValue([]),
  };
}

function makeJwt(): JwtService {
  return {
    signAsync: jest.fn().mockResolvedValue('signed.jwt.token'),
  } as unknown as JwtService;
}

function makeConfig(): ConfigService {
  return {
    get: <T>(key: string, def?: T): T | undefined => {
      if (key === 'JWT_REFRESH_TTL_DAYS') return 30 as unknown as T;
      return def;
    },
  } as unknown as ConfigService;
}

function makeDataSource(repo: MockRepo): DataSource {
  return {
    transaction: (cb: (m: { getRepository: () => MockRepo }) => unknown) =>
      cb({ getRepository: () => repo }),
  } as unknown as DataSource;
}

function makeService(repo: MockRepo, jwt = makeJwt()): TokenService {
  return new TokenService(
    jwt,
    makeConfig(),
    repo as unknown as Repository<RefreshToken>,
    makeDataSource(repo),
  );
}

function activeRow(overrides: Partial<RefreshToken> = {}): RefreshToken {
  const now = Date.now();
  return {
    id: 'old-id',
    userId: 1,
    tokenHash: 'hash',
    familyId: 'family-uuid',
    parentId: null,
    deviceType: 'web',
    deviceName: null,
    userAgent: null,
    ipAddress: null,
    revokedAt: null,
    revokedReason: null,
    issuedAt: new Date(now - 60_000),
    expiresAt: new Date(now + 60_000),
    ...overrides,
  } as RefreshToken;
}

describe('TokenService', () => {
  describe('signAccessToken', () => {
    it('delegates to JwtService.signAsync with the payload', async () => {
      const jwt = makeJwt();
      const service = makeService(makeRepo(), jwt);

      const token = await service.signAccessToken({
        sub: 1,
        school_id: 1,
        tv: 0,
      });

      expect(token).toBe('signed.jwt.token');
      expect(jwt.signAsync).toHaveBeenCalledWith({
        sub: 1,
        school_id: 1,
        tv: 0,
      });
    });
  });

  describe('issueRefreshToken', () => {
    it('saves a new row with a fresh family_id and returns the raw token', async () => {
      const repo = makeRepo();
      const service = makeService(repo);

      const result = await service.issueRefreshToken(1, CTX, 30 * 24 * 60 * 60 * 1000);

      expect(result.raw.length).toBeGreaterThan(40);
      expect(repo.save).toHaveBeenCalledTimes(1);
      const saved = repo.save.mock.calls[0][0] as Partial<RefreshToken>;
      expect(saved.userId).toBe(1);
      expect(saved.familyId).toMatch(/^[0-9a-f-]{36}$/);
      expect(saved.parentId).toBeNull();
    });
  });

  describe('rotateRefreshToken', () => {
    it('inserts a new row in the same family and marks the old row as rotation', async () => {
      const repo = makeRepo();
      repo.findOne.mockResolvedValue(activeRow());
      const service = makeService(repo);

      const result = await service.rotateRefreshToken('raw-token', CTX);

      const newRow = repo.save.mock.calls[0][0] as Partial<RefreshToken>;
      expect(newRow.familyId).toBe('family-uuid');
      expect(newRow.parentId).toBe('old-id');
      expect(result.raw).toBeTruthy();

      const rotationCall = repo.update.mock.calls.find(
        ([id, value]: [unknown, Partial<RefreshToken>]) =>
          id === 'old-id' && value.revokedReason === 'rotation',
      );
      expect(rotationCall).toBeDefined();
    });

    it('throws Unauthorized when the raw token is unknown', async () => {
      const repo = makeRepo();
      repo.findOne.mockResolvedValue(null);

      await expect(
        makeService(repo).rotateRefreshToken('raw', CTX),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('revokes the entire family with reason suspicious_activity when a revoked token is replayed', async () => {
      const repo = makeRepo();
      repo.findOne.mockResolvedValue(
        activeRow({ revokedAt: new Date(), revokedReason: 'rotation' }),
      );

      await expect(
        makeService(repo).rotateRefreshToken('raw', CTX),
      ).rejects.toThrow(UnauthorizedException);

      const familyCall = repo.update.mock.calls.find(
        ([where, value]: [unknown, Partial<RefreshToken>]) =>
          isFamilyWhere(where, 'family-uuid') &&
          value.revokedReason === 'suspicious_activity',
      );
      expect(familyCall).toBeDefined();
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('marks the row expired and throws Unauthorized when the refresh token has expired', async () => {
      const repo = makeRepo();
      repo.findOne.mockResolvedValue(
        activeRow({ expiresAt: new Date(Date.now() - 1000) }),
      );

      await expect(
        makeService(repo).rotateRefreshToken('raw', CTX),
      ).rejects.toThrow(UnauthorizedException);

      const expireCall = repo.update.mock.calls.find(
        ([id, value]: [unknown, Partial<RefreshToken>]) =>
          id === 'old-id' && value.revokedReason === 'expired',
      );
      expect(expireCall).toBeDefined();
    });
  });

  describe('revokeAllForUser', () => {
    it('updates every active row for the user with the given reason', async () => {
      const repo = makeRepo();

      await makeService(repo).revokeAllForUser(7, 'password_change');

      const [where, value] = repo.update.mock.calls[0] as [
        Record<string, unknown>,
        Partial<RefreshToken>,
      ];
      expect(where.userId).toBe(7);
      expect(value.revokedReason).toBe('password_change');
    });
  });
});

function isFamilyWhere(where: unknown, familyId: string): boolean {
  return (
    typeof where === 'object' &&
    where !== null &&
    'familyId' in where &&
    where.familyId === familyId
  );
}
