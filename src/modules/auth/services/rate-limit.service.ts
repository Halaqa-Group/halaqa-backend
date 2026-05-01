import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Not, Repository } from 'typeorm';
import { LoginAttempt } from '../entities/login-attempt.entity';
import { RATE_LIMIT } from '../rate-limit.config';

export type RateLimitVerdict = 'ok' | 'rate_limited' | 'account_locked';

@Injectable()
export class RateLimitService {
  constructor(
    @InjectRepository(LoginAttempt)
    private readonly attempts: Repository<LoginAttempt>,
  ) {}

  async check(email: string, ip: string): Promise<RateLimitVerdict> {
    const windowStart = this.windowStart();

    if (await this.ipExceeded(ip, windowStart)) return 'rate_limited';
    if (await this.emailFailuresExceeded(email, windowStart))
      return 'rate_limited';
    if (await this.accountLocked(email)) return 'account_locked';

    return 'ok';
  }

  private windowStart(): Date {
    return new Date(Date.now() - RATE_LIMIT.WINDOW_MIN * 60 * 1000);
  }

  private async ipExceeded(ip: string, windowStart: Date): Promise<boolean> {
    const count = await this.attempts.count({
      where: { ipAddress: ip, attemptedAt: MoreThan(windowStart) },
    });
    return count >= RATE_LIMIT.IP_MAX_PER_WINDOW;
  }

  private async emailFailuresExceeded(
    email: string,
    windowStart: Date,
  ): Promise<boolean> {
    const count = await this.attempts.count({
      where: {
        email,
        status: Not('success'),
        attemptedAt: MoreThan(windowStart),
      },
    });
    return count >= RATE_LIMIT.EMAIL_FAIL_MAX_PER_WINDOW;
  }

  private async accountLocked(email: string): Promise<boolean> {
    const recent = await this.attempts.find({
      where: { email },
      order: { attemptedAt: 'DESC' },
      take: RATE_LIMIT.LOCKOUT_THRESHOLD,
    });
    if (recent.length < RATE_LIMIT.LOCKOUT_THRESHOLD) return false;
    if (recent.some((a) => a.status === 'success')) return false;

    const lockoutEnd = new Date(
      recent[0].attemptedAt.getTime() + RATE_LIMIT.LOCKOUT_MIN * 60 * 1000,
    );
    return lockoutEnd > new Date();
  }
}
