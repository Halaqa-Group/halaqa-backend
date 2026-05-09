import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActingTeacherController } from './controllers/acting-teacher.controller';
import { HalaqatController } from './controllers/halaqat.controller';
import { ReverseLookupController } from './controllers/reverse-lookup.controller';
import { StudentEnrollmentController } from './controllers/student-enrollment.controller';
import { SupervisorAssignmentController } from './controllers/supervisor-assignment.controller';
import { TeacherAssignmentController } from './controllers/teacher-assignment.controller';
import { HalaqaActivityLog } from './entities/halaqa-activity-log.entity';
import { HalaqaSchedule } from './entities/halaqa-schedule.entity';
import { HalaqaTeacher } from './entities/halaqa-teacher.entity';
import { Halaqa } from './entities/halaqa.entity';
import { StudentHalaqa } from './entities/student-halaqa.entity';
import { SupervisorHalaqa } from './entities/supervisor-halaqa.entity';
import { HalaqaAccessGuard, HalaqaEditAccessGuard } from './guards/halaqa-scope.guard';
import { ActingTeacherService } from './services/acting-teacher.service';
import { HalaqaActivityLogService } from './services/halaqa-activity-log.service';
import { HalaqatService } from './services/halaqat.service';
import { ScheduleConflictService } from './services/schedule-conflict.service';
import { ScheduleService } from './services/schedule.service';
import { ReverseLookupService } from './services/reverse-lookup.service';
import { StudentEnrollmentService } from './services/student-enrollment.service';
import { SupervisorAssignmentService } from './services/supervisor-assignment.service';
import { TeacherAssignmentService } from './services/teacher-assignment.service';

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
  controllers: [HalaqatController, TeacherAssignmentController, ActingTeacherController, StudentEnrollmentController, SupervisorAssignmentController, ReverseLookupController],
  providers: [HalaqatService, HalaqaActivityLogService, ScheduleConflictService, ScheduleService, HalaqaAccessGuard, HalaqaEditAccessGuard, TeacherAssignmentService, ActingTeacherService, StudentEnrollmentService, SupervisorAssignmentService, ReverseLookupService],
  exports: [TypeOrmModule, HalaqatService, HalaqaActivityLogService, ScheduleConflictService, ScheduleService, HalaqaAccessGuard, HalaqaEditAccessGuard, TeacherAssignmentService, ActingTeacherService, StudentEnrollmentService, SupervisorAssignmentService, ReverseLookupService],
})
export class HalaqatModule {}
