import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class WeeklyPlansOverdueCron {
  private readonly logger = new Logger(WeeklyPlansOverdueCron.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Runs daily at midnight UTC.
   * Flips `weekly_plan_items.status` from 'due' → 'overdue' for all items whose
   * computed date (week_start_date + day_of_week days) is in the past.
   *
   * Only touches 'due' rows — never resets 'partial', 'completed', or already-'overdue'.
   * Per-school timezone is a future enhancement; UTC midnight is the initial implementation.
   */
  @Cron('0 0 * * *')
  async markOverdue(): Promise<void> {
    const result: { affectedRows: number } = await this.dataSource.manager.query(
      `UPDATE weekly_plan_items wpi
       JOIN weekly_plans wp ON wp.id = wpi.weekly_plan_id
       SET wpi.status = 'overdue'
       WHERE wp.deleted_at IS NULL
         AND wpi.status = 'due'
         AND DATE_ADD(wp.week_start_date, INTERVAL wpi.day_of_week DAY) < CURDATE()`,
    );

    const affected = result?.affectedRows ?? 0;
    if (affected > 0) {
      this.logger.log(`markOverdue: flipped ${affected} item(s) to overdue`);
    }
  }
}
