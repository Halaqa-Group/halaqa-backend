import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Achievement } from '../achievements/entities/achievement.entity';
import { WeeklyPlan } from '../achievements/entities/weekly-plan.entity';
import { StudentAttendance } from '../attendance/entities/student-attendance.entity';
import { Halaqa } from '../halaqat/entities/halaqa.entity';
import { StudentHalaqaEnrollment } from '../halaqat/entities/student-halaqa-enrollment.entity';
import { HalaqatModule } from '../halaqat/halaqat.module';
import { DailyReportController } from './controllers/daily-report.controller';
import { DailyHalaqaReport } from './entities/daily-halaqa-report.entity';
import { DailyStudentEvaluation } from './entities/daily-student-evaluation.entity';
import { DailyReportSnapshotCron } from './services/daily-report-snapshot.cron';
import { DailyReportService } from './services/daily-report.service';
import { HistoricalRecalcListener } from './services/historical-recalc.listener';

/**
 * Daily evaluation report module. Phase 3 wires the live read path: the two GET
 * endpoints (§29.1/§29.2) and `DailyReportService`, which composes the Phase 2
 * pure logic over data loaded here. The weekly snapshot cron and recalculation
 * endpoint (which persist to the entities registered below) land in later phases.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Halaqa,
      StudentHalaqaEnrollment,
      StudentAttendance,
      WeeklyPlan,
      Achievement,
      DailyHalaqaReport,
      DailyStudentEvaluation,
    ]),
    HalaqatModule,
  ],
  controllers: [DailyReportController],
  providers: [
    DailyReportService,
    DailyReportSnapshotCron,
    HistoricalRecalcListener,
  ],
  exports: [TypeOrmModule, DailyReportService],
})
export class DailyReportsModule {}
