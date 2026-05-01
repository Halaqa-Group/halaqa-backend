import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { RefreshToken } from '../entities/refresh-token.entity';

const RETENTION_DAYS = 7;

@Injectable()
export class RefreshTokenCleanupService {
  private readonly logger = new Logger(RefreshTokenCleanupService.name);

  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
  ) {}

  /**
   * Daily at 03:00 server-local. Hard-deletes refresh-token rows whose
   * `expires_at` is more than 7 days in the past — they have no audit value
   * after that point and the table grows unbounded otherwise.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'refresh-token-cleanup' })
  async sweep(): Promise<number> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const result = await this.refreshTokens.delete({
      expiresAt: LessThan(cutoff),
    });
    const removed = result.affected ?? 0;
    if (removed > 0) {
      this.logger.log(
        `Pruned ${removed} refresh-token rows older than ${RETENTION_DAYS}d`,
      );
    }
    return removed;
  }
}
