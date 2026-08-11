import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuranRangeValidator } from '../../quran/quran-range.validator';
import { AuditModule } from '../audit/audit.module';
import { AchievementsController } from './controllers/achievements.controller';
import { PlanItemsController } from './controllers/plan-items.controller';
import { WeeklyPlansController } from './controllers/weekly-plans.controller';
import { Achievement } from './entities/achievement.entity';
import { AchievementPlanItemLink } from './entities/achievement-plan-item-link.entity';
import { AchievementRecitationPosition } from './entities/achievement-recitation-position.entity';
import { AchievementPositionError } from './entities/achievement-position-error.entity';
import { WeeklyPlanItem } from './entities/weekly-plan-item.entity';
import { WeeklyPlan } from './entities/weekly-plan.entity';
import { AchievementsService } from './services/achievements.service';
import { WeeklyPlansOverdueCron } from './services/overdue-cron.service';
import { PlanItemsService } from './services/plan-items.service';
import { PlanReconciliationService } from './services/plan-reconciliation.service';
import { WeeklyPlansService } from './services/weekly-plans.service';
import { AttendanceModule } from '../attendance/attendance.module';
import { StudentsModule } from '../students/students.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Achievement,
      AchievementPlanItemLink,
      AchievementRecitationPosition,
      AchievementPositionError,
      WeeklyPlan,
      WeeklyPlanItem,
    ]),
    AuditModule,
    AttendanceModule,
    StudentsModule,
  ],
  controllers: [
    AchievementsController,
    WeeklyPlansController,
    PlanItemsController,
  ],
  providers: [
    AchievementsService,
    WeeklyPlansService,
    PlanItemsService,
    PlanReconciliationService,
    WeeklyPlansOverdueCron,
    QuranRangeValidator,
  ],
  exports: [AchievementsService, WeeklyPlansService],
})
export class AchievementsModule {}
