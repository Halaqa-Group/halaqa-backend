import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import {
  THROTTLED_MESSAGE,
  ThrottledException,
} from '../../../common/exceptions/throttled.exception';
import { LoginAttempt } from '../entities/login-attempt.entity';
import { User } from '../../users/entities/user.entity';
import { RequestContext } from '../request-context';
import { AuthService } from './auth.service';
import { RateLimitService, RateLimitVerdict } from './rate-limit.service';
import { TokenService } from './token.service';

jest.mock('bcrypt');
const mockedCompare = bcrypt.compare as jest.MockedFunction<
  typeof bcrypt.compare
>;

const CTX: RequestContext = {
  ip: '1.2.3.4',
  userAgent: 'jest',
  deviceType: 'web',
  deviceName: null,
};

const ACTIVE_USER = {
  id: 7,
  schoolId: 1,
  name: 'Admin',
  idNumber: '400000006',
  email: 'admin@school.com',
  password: 'hash',
  status: 'active',
  tokenVersion: 0,
  userRoles: [{ role: { slug: 'principal', level: 100 } }],
} as unknown as User;

interface Mocks {
  config: ConfigService;
  tokens: jest.Mocked<TokenService>;
  rateLimit: jest.Mocked<RateLimitService>;
  users: { findOne: jest.Mock; update: jest.Mock };
  attempts: { insert: jest.Mock };
  idValidator: { normalize: jest.Mock; validate: jest.Mock };
}

function makeMocks(): Mocks {
  return {
    config: {
      getOrThrow: jest.fn().mockReturnValue(1),
    } as unknown as ConfigService,
    tokens: {
      signAccessToken: jest.fn().mockResolvedValue('access.jwt'),
      pickRefreshTtl: jest.fn().mockReturnValue(86_400_000),
      issueRefreshToken: jest
        .fn()
        .mockResolvedValue({ raw: 'rawA', row: { id: 'rt-1' } }),
      rotateRefreshToken: jest.fn(),
      revokeOne: jest.fn().mockResolvedValue(undefined),
      revokeAllForUser: jest.fn().mockResolvedValue(undefined),
      listActiveForUser: jest.fn().mockResolvedValue([]),
      revokeById: jest.fn(),
      hashRaw: jest.fn().mockReturnValue('hashedRaw'),
    } as unknown as jest.Mocked<TokenService>,
    rateLimit: {
      check: jest.fn(),
    } as unknown as jest.Mocked<RateLimitService>,
    users: { findOne: jest.fn(), update: jest.fn().mockResolvedValue({}) },
    attempts: { insert: jest.fn().mockResolvedValue({}) },
    idValidator: {
      normalize: jest.fn((s: string) => s.replace(/[\s-]/g, '')),
      validate: jest.fn().mockReturnValue({ ok: true, warnings: [] }),
    },
  };
}

function makeService(m: Mocks): AuthService {
  return new AuthService(
    m.config,
    m.tokens,
    m.rateLimit,
    m.users as unknown as Repository<User>,
    m.attempts as unknown as Repository<LoginAttempt>,
    m.idValidator,
  );
}

describe('AuthService', () => {
  let m: Mocks;
  let service: AuthService;

  beforeEach(() => {
    m = makeMocks();
    service = makeService(m);
    mockedCompare.mockReset();
  });

  describe('login', () => {
    it('issues tokens, records success, and bumps last_login_at on the happy path', async () => {
      m.rateLimit.check.mockResolvedValue({
        verdict: 'ok',
        retryAfterSeconds: 0,
      });
      m.users.findOne.mockResolvedValue(ACTIVE_USER);
      mockedCompare.mockResolvedValue(true as never);

      const result = await service.login(
        { email: 'admin@school.com', password: 'pw' },
        CTX,
      );

      expect(result.accessToken).toBe('access.jwt');
      expect(result.rawRefresh).toBe('rawA');
      expect(result.user).toEqual({
        id: 7,
        name: 'Admin',
        email: 'admin@school.com',
        roles: ['principal'],
      });
      expect(m.attempts.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          userId: 7,
          refreshTokenId: 'rt-1',
        }),
      );
      expect(m.users.update).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ lastLoginAt: expect.any(Date) }),
      );
    });

    it('logs in via id_number: normalizes it, looks up by idNumber, records the identifier', async () => {
      m.rateLimit.check.mockResolvedValue({
        verdict: 'ok',
        retryAfterSeconds: 0,
      });
      m.users.findOne.mockResolvedValue(ACTIVE_USER);
      mockedCompare.mockResolvedValue(true as never);

      const result = await service.login(
        { id_number: '400-000-006', password: 'pw' },
        CTX,
      );

      expect(result.accessToken).toBe('access.jwt');
      expect(m.idValidator.normalize).toHaveBeenCalledWith('400-000-006');
      expect(m.rateLimit.check).toHaveBeenCalledWith('400000006', CTX.ip);
      expect(m.users.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ idNumber: '400000006' }),
        }),
      );
      expect(m.attempts.insert).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'success', email: '400000006' }),
      );
    });

    it.each<RateLimitVerdict>(['rate_limited', 'account_locked'])(
      'throws 429 with a Retry-After hint and records %s when rate-limit verdict is %s',
      async (verdict) => {
        m.rateLimit.check.mockResolvedValue({
          verdict,
          retryAfterSeconds: 900,
        });

        const err: unknown = await service
          .login({ email: 'a@b.com', password: 'pw' }, CTX)
          .catch((e: unknown) => e);

        expect(err).toBeInstanceOf(ThrottledException);
        const thrown = err as ThrottledException;
        expect(thrown.getStatus()).toBe(429);
        expect(thrown.retryAfterSeconds).toBe(900);
        // Both verdicts must be indistinguishable to the caller: a different
        // message for account_locked would hint that the account exists.
        expect(thrown.getResponse()).toMatchObject({
          message: THROTTLED_MESSAGE,
          retry_after_seconds: 900,
        });

        expect(m.attempts.insert).toHaveBeenCalledWith(
          expect.objectContaining({ status: verdict }),
        );
        expect(m.tokens.signAccessToken).not.toHaveBeenCalled();
      },
    );

    it('returns Invalid credentials and records user_not_found for an unknown email', async () => {
      m.rateLimit.check.mockResolvedValue({
        verdict: 'ok',
        retryAfterSeconds: 0,
      });
      m.users.findOne.mockResolvedValue(null);

      await expect(
        service.login({ email: 'x@y.com', password: 'pw' }, CTX),
      ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));

      expect(m.attempts.insert).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'user_not_found', userId: null }),
      );
      expect(mockedCompare).not.toHaveBeenCalled();
    });

    it('returns Invalid credentials and records account_inactive when the user is not active', async () => {
      m.rateLimit.check.mockResolvedValue({
        verdict: 'ok',
        retryAfterSeconds: 0,
      });
      m.users.findOne.mockResolvedValue({
        ...ACTIVE_USER,
        status: 'inactive',
      });

      await expect(
        service.login({ email: 'a@b.com', password: 'pw' }, CTX),
      ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));

      expect(m.attempts.insert).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'account_inactive', userId: 7 }),
      );
      expect(mockedCompare).not.toHaveBeenCalled();
    });

    it('returns Invalid credentials and records wrong_password when bcrypt mismatches', async () => {
      m.rateLimit.check.mockResolvedValue({
        verdict: 'ok',
        retryAfterSeconds: 0,
      });
      m.users.findOne.mockResolvedValue(ACTIVE_USER);
      mockedCompare.mockResolvedValue(false as never);

      await expect(
        service.login({ email: 'a@b.com', password: 'wrong' }, CTX),
      ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));

      expect(m.attempts.insert).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'wrong_password', userId: 7 }),
      );
      expect(m.tokens.signAccessToken).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('rotates and returns new AuthResult when the user is still active', async () => {
      m.tokens.rotateRefreshToken.mockResolvedValue({
        raw: 'rawB',
        row: { userId: 7 },
        oldRow: {},
      } as never);
      m.users.findOne.mockResolvedValue(ACTIVE_USER);

      const result = await service.refresh('rawA', CTX);

      expect(result.accessToken).toBe('access.jwt');
      expect(result.rawRefresh).toBe('rawB');
      expect(result.user.roles).toEqual(['principal']);
    });

    it('revokes the freshly-rotated token if the user is no longer active', async () => {
      m.tokens.rotateRefreshToken.mockResolvedValue({
        raw: 'rawB',
        row: { userId: 7 },
        oldRow: {},
      } as never);
      m.users.findOne.mockResolvedValue({
        ...ACTIVE_USER,
        status: 'suspended',
      });

      await expect(service.refresh('rawA', CTX)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(m.tokens.revokeOne).toHaveBeenCalledWith('rawB', 'admin_action');
    });
  });

  describe('logout', () => {
    it('is a no-op when no refresh cookie was sent', async () => {
      await service.logout(undefined);

      expect(m.tokens.revokeOne).not.toHaveBeenCalled();
    });

    it('revokes the token in the cookie with reason "logout"', async () => {
      await service.logout('raw');

      expect(m.tokens.revokeOne).toHaveBeenCalledWith('raw', 'logout');
    });
  });

  describe('logoutAll', () => {
    it('revokes every active refresh token for the caller with reason "logout"', async () => {
      await service.logoutAll(7);

      expect(m.tokens.revokeAllForUser).toHaveBeenCalledWith(7, 'logout');
    });
  });

  describe('listSessions', () => {
    it('flags the row whose hash matches the cookie hash as current', async () => {
      m.tokens.listActiveForUser.mockResolvedValue([
        {
          id: 'rt-1',
          tokenHash: 'hashedRaw',
          deviceName: null,
          deviceType: 'web',
          ipAddress: null,
          lastUsedAt: null,
          issuedAt: new Date(),
        },
        {
          id: 'rt-2',
          tokenHash: 'other',
          deviceName: null,
          deviceType: 'web',
          ipAddress: null,
          lastUsedAt: null,
          issuedAt: new Date(),
        },
      ] as never);

      const sessions = await service.listSessions(7, 'hashedRaw');

      expect(sessions[0].current).toBe(true);
      expect(sessions[1].current).toBe(false);
    });
  });

  describe('revokeSession', () => {
    it("throws NotFoundException when the session is not the caller's", async () => {
      m.tokens.revokeById.mockResolvedValue(false);

      await expect(service.revokeSession(7, 'rt-99')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns silently when the revoke succeeded', async () => {
      m.tokens.revokeById.mockResolvedValue(true);

      await expect(service.revokeSession(7, 'rt-1')).resolves.toBeUndefined();
    });
  });
});
