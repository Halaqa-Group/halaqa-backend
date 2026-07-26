import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { EmailVerificationToken } from '../entities/email-verification-token.entity';
import { generateRawToken, hashToken } from '../token-crypto';
import { MAIL_SERVICE } from './mail.service';
import type { MailService } from './mail.service';

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const INVALID_OR_EXPIRED = 'Invalid or expired token';

@Injectable()
export class EmailVerificationService {
  constructor(
    private readonly config: ConfigService,
    @Inject(MAIL_SERVICE) private readonly mail: MailService,
    @InjectRepository(EmailVerificationToken)
    private readonly verifications: Repository<EmailVerificationToken>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /**
   * Issue a verification link for the caller's own email. No-op if the email is
   * already verified. Any previously issued unused tokens are invalidated so
   * only the latest link works.
   */
  async requestVerification(userId: number, ip: string): Promise<void> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user || user.email === null || user.emailVerifiedAt !== null) return;
    const email = user.email;

    await this.verifications.update(
      { userId, usedAt: IsNull() },
      { usedAt: new Date() },
    );

    const raw = generateRawToken();
    await this.verifications.insert({
      userId: user.id,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
      requestedIp: ip,
    });

    const link = `${this.appUrl()}/auth/verify-email?token=${raw}`;
    await this.mail.sendVerificationEmail(email, link);
  }

  /**
   * Consume a token and stamp `users.email_verified_at`. Idempotent for the same
   * user in the sense that re-verifying an already-verified user is harmless.
   */
  async verify(rawToken: string): Promise<{ email: string }> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(EmailVerificationToken);
      const row = await repo.findOne({
        where: { tokenHash: hashToken(rawToken), usedAt: IsNull() },
        relations: { user: true },
      });
      if (!row || row.expiresAt <= new Date() || row.user.email === null) {
        throw new BadRequestException(INVALID_OR_EXPIRED);
      }
      const email = row.user.email;

      await manager
        .getRepository(User)
        .update(row.userId, { emailVerifiedAt: new Date() });
      await repo.update(row.id, { usedAt: new Date() });

      return { email };
    });
  }

  private appUrl(): string {
    return this.config.getOrThrow<string>('APP_URL');
  }
}
