import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, Not, Repository } from 'typeorm';
import {
  LoginAttempt,
  type LoginAttemptStatus,
} from '../entities/login-attempt.entity';
import { RATE_LIMIT } from '../rate-limit.config';

export type RateLimitVerdict = 'ok' | 'rate_limited' | 'account_locked';

/**
 * Verdicts this service produced itself. `AuthService.login` records them for
 * audit before rejecting, but they are not credential checks and must never
 * feed back into the failure counters here.
 *
 * Counting them made the lockout self-perpetuating: every blocked retry became
 * the newest attempt, pushing `lockoutEnd` another LOCKOUT_MIN into the future,
 * so a client that kept retrying could never unlock — not even with the correct
 * password, since login is rejected before the password is checked. Excluding
 * them caps the penalty at exactly LOCKOUT_MIN from the last real failure.
 */
const THROTTLE_VERDICTS: LoginAttemptStatus[] = [
  'rate_limited',
  'account_locked',
];

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

  /**
   * Volume control: counts every attempt from the IP, successes included.
   * That is deliberate — this cap is about request volume, not credentials.
   */
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
        status: Not(In([...THROTTLE_VERDICTS, 'success'])),
        attemptedAt: MoreThan(windowStart),
      },
    });
    return count >= RATE_LIMIT.EMAIL_FAIL_MAX_PER_WINDOW;
  }

  private async accountLocked(email: string): Promise<boolean> {
    const recent = await this.attempts.find({
      where: { email, status: Not(In(THROTTLE_VERDICTS)) },
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
