import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, MoreThan, Not, Repository } from 'typeorm';
import {
  LoginAttempt,
  type LoginAttemptStatus,
} from '../entities/login-attempt.entity';
import { RATE_LIMIT } from '../rate-limit.config';

export type RateLimitVerdict = 'ok' | 'rate_limited' | 'account_locked';

export interface RateLimitDecision {
  verdict: RateLimitVerdict;
  /** Seconds the caller should wait before retrying. 0 when the verdict is 'ok'. */
  retryAfterSeconds: number;
}

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

const OK: RateLimitDecision = { verdict: 'ok', retryAfterSeconds: 0 };

@Injectable()
export class RateLimitService {
  constructor(
    @InjectRepository(LoginAttempt)
    private readonly attempts: Repository<LoginAttempt>,
  ) {}

  async check(email: string, ip: string): Promise<RateLimitDecision> {
    const windowStart = this.windowStart();

    const ipWhere: FindOptionsWhere<LoginAttempt> = { ipAddress: ip };
    if (
      await this.exceeded(ipWhere, windowStart, RATE_LIMIT.IP_MAX_PER_WINDOW)
    ) {
      return {
        verdict: 'rate_limited',
        retryAfterSeconds: await this.windowRetryAfter(ipWhere, windowStart),
      };
    }

    const failWhere: FindOptionsWhere<LoginAttempt> = {
      email,
      status: Not(In([...THROTTLE_VERDICTS, 'success'])),
    };
    if (
      await this.exceeded(
        failWhere,
        windowStart,
        RATE_LIMIT.EMAIL_FAIL_MAX_PER_WINDOW,
      )
    ) {
      return {
        verdict: 'rate_limited',
        retryAfterSeconds: await this.windowRetryAfter(failWhere, windowStart),
      };
    }

    const lockedUntil = await this.lockedUntil(email);
    if (lockedUntil !== null) {
      return {
        verdict: 'account_locked',
        retryAfterSeconds: this.secondsUntil(lockedUntil),
      };
    }

    return OK;
  }

  private windowStart(): Date {
    return new Date(Date.now() - RATE_LIMIT.WINDOW_MIN * 60 * 1000);
  }

  private async exceeded(
    where: FindOptionsWhere<LoginAttempt>,
    windowStart: Date,
    cap: number,
  ): Promise<boolean> {
    const count = await this.attempts.count({
      where: { ...where, attemptedAt: MoreThan(windowStart) },
    });
    return count >= cap;
  }

  /**
   * A rolling window clears as its oldest entry ages out, so that is when the
   * count first drops back under the cap.
   */
  private async windowRetryAfter(
    where: FindOptionsWhere<LoginAttempt>,
    windowStart: Date,
  ): Promise<number> {
    const [oldest] = await this.attempts.find({
      where: { ...where, attemptedAt: MoreThan(windowStart) },
      order: { attemptedAt: 'ASC' },
      take: 1,
    });
    if (!oldest) return RATE_LIMIT.WINDOW_MIN * 60;
    return this.secondsUntil(
      new Date(
        oldest.attemptedAt.getTime() + RATE_LIMIT.WINDOW_MIN * 60 * 1000,
      ),
    );
  }

  /** When the lockout lifts, or null if the account is not locked. */
  private async lockedUntil(email: string): Promise<Date | null> {
    const recent = await this.attempts.find({
      where: { email, status: Not(In(THROTTLE_VERDICTS)) },
      order: { attemptedAt: 'DESC' },
      take: RATE_LIMIT.LOCKOUT_THRESHOLD,
    });
    if (recent.length < RATE_LIMIT.LOCKOUT_THRESHOLD) return null;
    if (recent.some((a) => a.status === 'success')) return null;

    const lockoutEnd = new Date(
      recent[0].attemptedAt.getTime() + RATE_LIMIT.LOCKOUT_MIN * 60 * 1000,
    );
    return lockoutEnd > new Date() ? lockoutEnd : null;
  }

  /** Always at least 1 — a `Retry-After: 0` invites an immediate retry. */
  private secondsUntil(when: Date): number {
    return Math.max(1, Math.ceil((when.getTime() - Date.now()) / 1000));
  }
}
