import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MemorizationService } from './memorization.service';

/**
 * Drains the memorization_jobs queue. Runs every minute; a `SchedulerRegistry`
 * guard prevents overlapping runs if a drain outlives its interval.
 */
@Injectable()
export class MemorizationCron {
  private readonly logger = new Logger(MemorizationCron.name);
  private running = false;

  constructor(private readonly memorization: MemorizationService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const processed = await this.memorization.drainOnce();
      if (processed > 0)
        this.logger.log(`drain: recomputed ${processed} student bitmap(s)`);
    } finally {
      this.running = false;
    }
  }
}
