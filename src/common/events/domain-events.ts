import { Global, Injectable, Module } from '@nestjs/common';
import { EventEmitter } from 'node:events';

/**
 * A source-data change that may invalidate a saved daily report (§28.4). Carry
 * `halaqaId` when known (achievement edits); carry `studentId` when the halaqa
 * must be resolved from the student's saved reports on that date (attendance).
 */
export interface ReportSourceChanged {
  date: string;
  halaqaId?: number;
  studentId?: number;
}

const REPORT_SOURCE_CHANGED = 'report.source-changed';

/**
 * Minimal in-process domain-event bus. Lives in its own dependency-free global
 * module so any module can emit without importing the daily-reports module —
 * which is what lets the historical-recalc listener react to attendance and
 * achievement edits without creating a circular module dependency.
 *
 * Emission is fire-and-forget: listeners run async and must catch their own
 * errors so a failed recalc never breaks the originating request.
 */
@Injectable()
export class DomainEvents {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  onReportSourceChanged(handler: (event: ReportSourceChanged) => void): void {
    this.emitter.on(REPORT_SOURCE_CHANGED, handler);
  }

  emitReportSourceChanged(event: ReportSourceChanged): void {
    this.emitter.emit(REPORT_SOURCE_CHANGED, event);
  }
}

@Global()
@Module({
  providers: [DomainEvents],
  exports: [DomainEvents],
})
export class DomainEventsModule {}
