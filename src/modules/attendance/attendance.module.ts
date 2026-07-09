import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { SchoolCalendarController } from './controllers/school-calendar.controller';
import { StudentAttendanceController } from './controllers/student-attendance.controller';
import { TeacherAttendanceController } from './controllers/teacher-attendance.controller';
import { Holiday } from './entities/holiday.entity';
import { SchoolSchedule } from './entities/school-schedule.entity';
import { StudentAttendance } from './entities/student-attendance.entity';
import { TeacherAttendance } from './entities/teacher-attendance.entity';
import { AttendanceQueryService } from './services/attendance-query.service';
import { AttendanceSeedService } from './services/attendance-seed.service';
import { SchoolCalendarService } from './services/school-calendar.service';
import { StudentAttendanceService } from './services/student-attendance.service';
import { TeacherAttendanceService } from './services/teacher-attendance.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StudentAttendance,
      TeacherAttendance,
      SchoolSchedule,
      Holiday,
    ]),
    AuditModule,
  ],
  controllers: [
    StudentAttendanceController,
    TeacherAttendanceController,
    SchoolCalendarController,
  ],
  providers: [
    StudentAttendanceService,
    TeacherAttendanceService,
    SchoolCalendarService,
    AttendanceQueryService,
    AttendanceSeedService,
  ],
  exports: [AttendanceQueryService],
})
export class AttendanceModule {}
