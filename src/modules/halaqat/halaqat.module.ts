import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HalaqaActivityLog } from './entities/halaqa-activity-log.entity';
import { HalaqaSchedule } from './entities/halaqa-schedule.entity';
import { HalaqaTeacher } from './entities/halaqa-teacher.entity';
import { Halaqa } from './entities/halaqa.entity';
import { StudentHalaqa } from './entities/student-halaqa.entity';
import { SupervisorHalaqa } from './entities/supervisor-halaqa.entity';

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
  exports: [TypeOrmModule],
})
export class HalaqatModule {}
