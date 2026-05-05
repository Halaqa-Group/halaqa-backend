import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { PasswordResetToken } from '../auth/entities/password-reset-token.entity';
import { UsersModule } from '../users/users.module';
import { MyChildrenController } from './controllers/my-children.controller';
import { StudentGuardiansController } from './controllers/student-guardians.controller';
import { StudentsController } from './controllers/students.controller';
import { StudentGuardian } from './entities/student-guardian.entity';
import { Student } from './entities/student.entity';
import { StudentScopeGuard } from './guards/student-scope.guard';
import { GuardiansService } from './services/guardians.service';
import { StudentsService } from './services/students.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Student, StudentGuardian, PasswordResetToken]),
    UsersModule,
    AuditModule,
  ],
  controllers: [
    StudentsController,
    StudentGuardiansController,
    MyChildrenController,
  ],
  providers: [StudentsService, GuardiansService, StudentScopeGuard],
  exports: [StudentsService],
})
export class StudentsModule {}
