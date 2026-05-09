import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HalaqaActivityLog } from './entities/halaqa-activity-log.entity';
import { HalaqaSchedule } from './entities/halaqa-schedule.entity';
import { HalaqaTeacher } from './entities/halaqa-teacher.entity';
import { Halaqa } from './entities/halaqa.entity';
import { StudentHalaqa } from './entities/student-halaqa.entity';
import { SupervisorHalaqa } from './entities/supervisor-halaqa.entity';
import { HalaqaActivityLogService } from './services/halaqa-activity-log.service';
import { ScheduleConflictService } from './services/schedule-conflict.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Halaqa,
      HalaqaTeacher,
      HalaqaSchedule,
      StudentHalaqa,
      SupervisorHalaqa,
      HalaqaActivityLog,
    ]),
  ],
  providers: [HalaqaActivityLogService, ScheduleConflictService],
  exports: [TypeOrmModule, HalaqaActivityLogService, ScheduleConflictService],
})
export class HalaqatModule {}
