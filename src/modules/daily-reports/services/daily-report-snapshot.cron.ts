import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DailyReportService } from './daily-report.service';

/**
 * Weekly snapshot job (§28.2). Runs after the school week ends and freezes a
 * daily report for every day of the just-finished week, for every active halaqa,
 * so historical reads are served from storage instead of recomputed each request
 * (§31). v1 runs on UTC (plan §1); per-school nightly timing is a later refinement.
 *
 * Schedule: Saturday 01:00 UTC — the new week (0=Saturday) has just begun, so the
 * previous Saturday…Friday is the week to snapshot.
 */
@Injectable()
export class DailyReportSnapshotCron {
  private readonly logger = new Logger(DailyReportSnapshotCron.name);

  constructor(private readonly reports: DailyReportService) {}

  @Cron('0 1 * * 6')
  async snapshotFinishedWeek(): Promise<void> {
    const weekStart = this.reports.previousWeekStart();
    this.logger.log(`weekly snapshot: starting for week ${weekStart}`);
    const result = await this.reports.persistWeek(weekStart);
    this.logger.log(
      `weekly snapshot: done for week ${weekStart} — ${result.halaqat} halaqa(t), ${result.failures} failure(s)`,
    );
  }
}
