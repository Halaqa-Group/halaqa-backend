import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DomainEvents,
  type ReportSourceChanged,
} from '../../../common/events/domain-events';
import { Halaqa } from '../../halaqat/entities/halaqa.entity';
import { DailyHalaqaReport } from '../entities/daily-halaqa-report.entity';
import { DailyStudentEvaluation } from '../entities/daily-student-evaluation.entity';
import { DailyReportService } from './daily-report.service';

/**
 * Reacts to source-data edits (§28.4): when attendance / achievements / plans
 * change for a day that already has a SAVED report, that report is recalculated
 * in place. Current-week days have no snapshot, so they are skipped — the live
 * endpoint already recomputes them each request.
 *
 * Runs off the in-process DomainEvents bus so the editing modules never import
 * the daily-reports module (no circular dependency). Handlers catch their own
 * errors so a recalc failure never breaks the originating request.
 */
@Injectable()
export class HistoricalRecalcListener implements OnModuleInit {
  private readonly logger = new Logger(HistoricalRecalcListener.name);

  constructor(
    private readonly events: DomainEvents,
    private readonly reports: DailyReportService,
    @InjectRepository(DailyHalaqaReport)
    private readonly headers: Repository<DailyHalaqaReport>,
    @InjectRepository(DailyStudentEvaluation)
    private readonly evaluations: Repository<DailyStudentEvaluation>,
    @InjectRepository(Halaqa)
    private readonly halaqat: Repository<Halaqa>,
  ) {}

  onModuleInit(): void {
    this.events.onReportSourceChanged((event) => void this.handle(event));
  }

  async handle(event: ReportSourceChanged): Promise<void> {
    try {
      const halaqaIds = await this.affectedHalaqaIds(event);
      for (const halaqaId of halaqaIds) {
        const halaqa = await this.halaqat.findOne({
          where: { id: halaqaId },
          withDeleted: true,
        });
        if (!halaqa) continue;
        await this.reports.persistDay(
          halaqa,
          event.date,
          null,
          'auto: source data changed',
        );
        this.logger.log(
          `recalculated report halaqa=${halaqaId} date=${event.date}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `historical recalc failed for ${JSON.stringify(event)}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  /** Halaqat with an existing saved report for the date that the edit touches. */
  private async affectedHalaqaIds(
    event: ReportSourceChanged,
  ): Promise<number[]> {
    if (event.halaqaId != null) {
      const existing = await this.headers.findOne({
        where: { halaqaId: event.halaqaId, reportDate: event.date },
      });
      return existing ? [event.halaqaId] : [];
    }
    if (event.studentId != null) {
      const rows = await this.evaluations
        .createQueryBuilder('ev')
        .innerJoin(DailyHalaqaReport, 'r', 'r.id = ev.dailyReportId')
        .select('r.halaqa_id', 'halaqaId')
        .where('ev.studentId = :sid', { sid: event.studentId })
        .andWhere('r.report_date = :d', { d: event.date })
        .getRawMany<{ halaqaId: number }>();
      return [...new Set(rows.map((r) => Number(r.halaqaId)))];
    }
    return [];
  }
}
