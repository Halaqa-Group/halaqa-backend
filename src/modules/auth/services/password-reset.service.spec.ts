import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { UsersService } from '../../users/users.service';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { PasswordResetToken } from '../entities/password-reset-token.entity';
import { hashToken } from '../token-crypto';
import { MailService } from './mail.service';
import { PasswordResetService } from './password-reset.service';
import { TokenService } from './token.service';

jest.mock('bcrypt');
const mockedHash = bcrypt.hash as jest.MockedFunction<typeof bcrypt.hash>;

interface Mocks {
  config: ConfigService;
  mail: jest.Mocked<MailService>;
  tokens: jest.Mocked<Pick<TokenService, 'revokeAllForUser'>>;
  users: jest.Mocked<Pick<UsersService, 'setPasswordAndBumpVersion'>>;
  resets: { findOne: jest.Mock; insert: jest.Mock; update: jest.Mock };
  userRepo: { findOne: jest.Mock };
  dataSource: jest.Mocked<Pick<DataSource, 'transaction'>>;
}

const ENV: Record<string, unknown> = {
  APP_URL: 'http://localhost:3000',
  DEFAULT_SCHOOL_ID: 1,
  BCRYPT_ROUNDS: 12,
};

function makeMocks(): Mocks {
  const resetRepo = {
    findOne: jest.fn(),
    insert: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  return {
    config: {
      getOrThrow: jest
        .fn()
        .mockImplementation(
          (key: string) => ENV[key],
        ) as ConfigService['getOrThrow'],
    } as unknown as ConfigService,
    mail: {
      sendResetEmail: jest.fn().mockResolvedValue(undefined),
    },
    tokens: {
      revokeAllForUser: jest.fn().mockResolvedValue(undefined),
    },
    users: {
      setPasswordAndBumpVersion: jest.fn().mockResolvedValue(undefined),
    },
    resets: resetRepo,
    userRepo: { findOne: jest.fn() },
    dataSource: {
      transaction: jest
        .fn()
        .mockImplementation(
          async (cb: (m: EntityManager) => Promise<unknown>) =>
            cb({ getRepository: () => resetRepo } as unknown as EntityManager),
        ),
    },
  };
}

function makeService(m: Mocks): PasswordResetService {
  return new PasswordResetService(
    m.config,
    m.mail,
    m.tokens as unknown as TokenService,
    m.users as unknown as UsersService,
    m.resets as unknown as Repository<PasswordResetToken>,
    m.userRepo as unknown as Repository<User>,
    m.dataSource as unknown as DataSource,
  );
}

const FUTURE = new Date(Date.now() + 60 * 60 * 1000);
const PAST = new Date(Date.now() - 60 * 1000);

describe('PasswordResetService', () => {
  let m: Mocks;
  let service: PasswordResetService;

  beforeEach(() => {
    m = makeMocks();
    service = makeService(m);
    mockedHash.mockReset();
  });

  describe('requestReset', () => {
    it('returns silently and does no work for an unknown email', async () => {
      m.userRepo.findOne.mockResolvedValue(null);

      await service.requestReset('nope@nowhere.com', '1.2.3.4');

      expect(m.resets.insert).not.toHaveBeenCalled();
      expect(m.mail.sendResetEmail).not.toHaveBeenCalled();
    });

    it('inserts a hashed token and emails a reset link with the raw token', async () => {
      m.userRepo.findOne.mockResolvedValue({
        id: 7,
        email: 'admin@school.com',
      });

      await service.requestReset('admin@school.com', '1.2.3.4');

      expect(m.resets.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 7,
          requestedIp: '1.2.3.4',
          tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      );
      const [to, link] = m.mail.sendResetEmail.mock.calls[0];
      expect(to).toBe('admin@school.com');
      expect(link).toMatch(
        /^http:\/\/localhost:3000\/auth\/reset-password\?token=[A-Za-z0-9_-]+$/,
      );
    });
  });

  describe('validateResetToken', () => {
    it('throws BadRequest when the token is unknown', async () => {
      m.resets.findOne.mockResolvedValue(null);

      await expect(service.validateResetToken('raw')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequest when the token has been used', async () => {
      m.resets.findOne.mockResolvedValue({
        usedAt: new Date(),
        expiresAt: FUTURE,
        user: { email: 'a@b.com' },
      });

      await expect(service.validateResetToken('raw')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequest when the token has expired', async () => {
      m.resets.findOne.mockResolvedValue({
        usedAt: null,
        expiresAt: PAST,
        user: { email: 'a@b.com' },
      });

      await expect(service.validateResetToken('raw')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('returns the email for a usable token without mutating any state', async () => {
      m.resets.findOne.mockResolvedValue({
        usedAt: null,
        expiresAt: FUTURE,
        user: { email: 'admin@school.com' },
      });

      const result = await service.validateResetToken('raw');

      expect(result).toEqual({ email: 'admin@school.com' });
      expect(m.resets.update).not.toHaveBeenCalled();
      expect(m.users.setPasswordAndBumpVersion).not.toHaveBeenCalled();
      expect(m.tokens.revokeAllForUser).not.toHaveBeenCalled();
    });
  });

  describe('consumeResetToken', () => {
    const dto: ResetPasswordDto = {
      token: 'raw-token',
      password: 'NewPassw0rd!',
      password_confirmation: 'NewPassw0rd!',
    };

    it('throws BadRequest when the token is unknown or already used', async () => {
      m.resets.findOne.mockResolvedValue(null);
      mockedHash.mockResolvedValue('$2b$12$hash' as never);

      await expect(service.consumeResetToken(dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(m.users.setPasswordAndBumpVersion).not.toHaveBeenCalled();
      expect(m.tokens.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('throws BadRequest when the token row has expired', async () => {
      m.resets.findOne.mockResolvedValue({
        id: 5,
        userId: 7,
        expiresAt: PAST,
      });
      mockedHash.mockResolvedValue('$2b$12$hash' as never);

      await expect(service.consumeResetToken(dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(m.users.setPasswordAndBumpVersion).not.toHaveBeenCalled();
    });

    it('hashes the password, bumps token_version, marks used_at, and revokes refresh tokens', async () => {
      m.resets.findOne.mockResolvedValue({
        id: 5,
        userId: 7,
        expiresAt: FUTURE,
      });
      mockedHash.mockResolvedValue('$2b$12$hash' as never);

      await service.consumeResetToken(dto);

      expect(mockedHash).toHaveBeenCalledWith('NewPassw0rd!', 12);
      expect(m.users.setPasswordAndBumpVersion).toHaveBeenCalledWith(
        7,
        '$2b$12$hash',
        expect.anything(),
      );
      expect(m.resets.update).toHaveBeenCalledWith(
        5,
        expect.objectContaining({ usedAt: expect.any(Date) }),
      );
      expect(m.tokens.revokeAllForUser).toHaveBeenCalledWith(
        7,
        'password_change',
      );
    });

    it('hashes outside the transaction and looks up the row by sha256 of the raw token', async () => {
      m.resets.findOne.mockResolvedValue({
        id: 5,
        userId: 7,
        expiresAt: FUTURE,
      });
      mockedHash.mockResolvedValue('$2b$12$hash' as never);

      await service.consumeResetToken(dto);

      expect(mockedHash).toHaveBeenCalled();
      const findCall = m.resets.findOne.mock.calls[0][0] as {
        where: { tokenHash: string };
      };
      expect(findCall.where.tokenHash).toBe(hashToken('raw-token'));
    });
  });
});
