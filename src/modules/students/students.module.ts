import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { MyChildrenController } from './controllers/my-children.controller';
import { StudentGuardiansController } from './controllers/student-guardians.controller';
import { StudentMemorizationController } from './controllers/student-memorization.controller';
import { StudentsController } from './controllers/students.controller';
import { MemorizationJob } from './entities/memorization-job.entity';
import { StudentGuardian } from './entities/student-guardian.entity';
import { Student } from './entities/student.entity';
import { StudentScopeGuard } from './guards/student-scope.guard';
import { GuardiansService } from './services/guardians.service';
import { ID_NUMBER_VALIDATOR } from '../../common/validators/id-number-validator.interface';
import { PalestinianIdValidator } from '../../common/validators/palestinian-id.validator';
import { QuranRangeValidator } from '../../quran/quran-range.validator';
import { MemorizationCron } from './services/memorization-cron.service';
import { MemorizationService } from './services/memorization.service';
import { StudentsService } from './services/students.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Student, StudentGuardian, MemorizationJob]),
    UsersModule,
    AuditModule,
    AuthModule,
  ],
  controllers: [
    StudentsController,
    StudentGuardiansController,
    StudentMemorizationController,
    MyChildrenController,
  ],
  providers: [
    StudentsService,
    GuardiansService,
    MemorizationService,
    MemorizationCron,
    QuranRangeValidator,
    StudentScopeGuard,
    { provide: ID_NUMBER_VALIDATOR, useClass: PalestinianIdValidator },
  ],
  exports: [StudentsService, MemorizationService],
})
export class StudentsModule {}
