import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { MyChildrenController } from './controllers/my-children.controller';
import { StudentGuardiansController } from './controllers/student-guardians.controller';
import { StudentsController } from './controllers/students.controller';
import { StudentGuardian } from './entities/student-guardian.entity';
import { Student } from './entities/student.entity';
import { StudentScopeGuard } from './guards/student-scope.guard';
import { GuardiansService } from './services/guardians.service';
import { StudentsService } from './services/students.service';
import { PalestinianIdValidator } from './validators/palestinian-id.validator';

@Module({
  imports: [
    TypeOrmModule.forFeature([Student, StudentGuardian]),
    UsersModule,
    AuditModule,
    AuthModule,
  ],
  controllers: [
    StudentsController,
    StudentGuardiansController,
    MyChildrenController,
  ],
  providers: [
    StudentsService,
    GuardiansService,
    StudentScopeGuard,
    { provide: 'ID_NUMBER_VALIDATOR', useClass: PalestinianIdValidator },
  ],
  exports: [StudentsService],
})
export class StudentsModule {}
