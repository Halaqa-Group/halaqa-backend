import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { EmailVerificationToken } from '../entities/email-verification-token.entity';
import { hashToken } from '../token-crypto';
import { EmailVerificationService } from './email-verification.service';
import { MailService } from './mail.service';

interface Mocks {
  config: ConfigService;
  mail: jest.Mocked<MailService>;
  verifications: { findOne: jest.Mock; insert: jest.Mock; update: jest.Mock };
  userRepo: { findOne: jest.Mock; update: jest.Mock };
  dataSource: jest.Mocked<Pick<DataSource, 'transaction'>>;
}

const ENV: Record<string, unknown> = { APP_URL: 'http://localhost:3000' };

function makeMocks(): Mocks {
  const verifications = {
    findOne: jest.fn(),
    insert: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const userRepo = {
    findOne: jest.fn(),
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
      sendParentInvite: jest.fn().mockResolvedValue(undefined),
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    },
    verifications,
    userRepo,
    dataSource: {
      transaction: jest
        .fn()
        .mockImplementation(
          async (cb: (m: EntityManager) => Promise<unknown>) =>
            cb({
              getRepository: (entity: unknown) =>
                entity === User ? userRepo : verifications,
            } as unknown as EntityManager),
        ),
    },
  };
}

function makeService(m: Mocks): EmailVerificationService {
  return new EmailVerificationService(
    m.config,
    m.mail,
    m.verifications as unknown as Repository<EmailVerificationToken>,
    m.userRepo as unknown as Repository<User>,
    m.dataSource as unknown as DataSource,
  );
}

const FUTURE = new Date(Date.now() + 60 * 60 * 1000);
const PAST = new Date(Date.now() - 60 * 1000);

describe('EmailVerificationService', () => {
  let m: Mocks;
  let service: EmailVerificationService;

  beforeEach(() => {
    m = makeMocks();
    service = makeService(m);
  });

  describe('requestVerification', () => {
    it('does nothing for an unknown user', async () => {
      m.userRepo.findOne.mockResolvedValue(null);

      await service.requestVerification(7, '1.2.3.4', 'ar');

      expect(m.verifications.insert).not.toHaveBeenCalled();
      expect(m.mail.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('does nothing when the email is already verified', async () => {
      m.userRepo.findOne.mockResolvedValue({
        id: 7,
        email: 'a@b.com',
        emailVerifiedAt: new Date(),
      });

      await service.requestVerification(7, '1.2.3.4', 'ar');

      expect(m.verifications.insert).not.toHaveBeenCalled();
      expect(m.mail.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('invalidates old unused tokens, inserts a hashed token, and emails the link', async () => {
      m.userRepo.findOne.mockResolvedValue({
        id: 7,
        email: 'admin@school.com',
        emailVerifiedAt: null,
      });

      await service.requestVerification(7, '1.2.3.4', 'ar');

      // Previous unused tokens are marked used before issuing a new one.
      expect(m.verifications.update).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 7 }),
        expect.objectContaining({ usedAt: expect.any(Date) }),
      );
      expect(m.verifications.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 7,
          requestedIp: '1.2.3.4',
          tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      );
      const [to, link, locale] = m.mail.sendVerificationEmail.mock.calls[0];
      expect(to).toBe('admin@school.com');
      expect(link).toMatch(
        /^http:\/\/localhost:3000\/auth\/verify-email\?token=[A-Za-z0-9_-]+$/,
      );
      expect(locale).toBe('ar');
    });
  });

  describe('verify', () => {
    it('throws BadRequest when the token is unknown or already used', async () => {
      m.verifications.findOne.mockResolvedValue(null);

      await expect(service.verify('raw')).rejects.toThrow(BadRequestException);
      expect(m.userRepo.update).not.toHaveBeenCalled();
    });

    it('throws BadRequest when the token has expired', async () => {
      m.verifications.findOne.mockResolvedValue({
        id: 5,
        userId: 7,
        expiresAt: PAST,
        user: { email: 'a@b.com' },
      });

      await expect(service.verify('raw')).rejects.toThrow(BadRequestException);
      expect(m.userRepo.update).not.toHaveBeenCalled();
    });

    it('stamps email_verified_at, marks the token used, and returns the email', async () => {
      m.verifications.findOne.mockResolvedValue({
        id: 5,
        userId: 7,
        expiresAt: FUTURE,
        user: { email: 'admin@school.com' },
      });

      const result = await service.verify('raw-token');

      expect(result).toEqual({ email: 'admin@school.com' });
      expect(m.userRepo.update).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ emailVerifiedAt: expect.any(Date) }),
      );
      expect(m.verifications.update).toHaveBeenCalledWith(
        5,
        expect.objectContaining({ usedAt: expect.any(Date) }),
      );
      const findCall = m.verifications.findOne.mock.calls[0][0] as {
        where: { tokenHash: string };
      };
      expect(findCall.where.tokenHash).toBe(hashToken('raw-token'));
    });
  });
});
