import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { LinkGuardianDto } from '../dto/link-guardian.dto';
import { UpdateGuardianDto } from '../dto/update-guardian.dto';
import { StudentScopeGuard } from '../guards/student-scope.guard';
import { GuardiansService } from '../services/guardians.service';
import { StudentsService } from '../services/students.service';

@Controller('students/:id/guardians')
@UseGuards(StudentScopeGuard)
export class StudentGuardiansController {
  constructor(
    private readonly guardians: GuardiansService,
    private readonly students: StudentsService,
  ) {}

  @Get()
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher', 'parent')
  list(
    @Param('id', ParseIntPipe) studentId: number,
    @CurrentUser() _actor: AuthenticatedUser,
  ) {
    return this.guardians.listForStudentId(studentId);
  }

  @Post()
  @Roles('principal', 'vice_principal')
  link(
    @Param('id', ParseIntPipe) studentId: number,
    @Body() dto: LinkGuardianDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.guardians.link(studentId, dto, actor);
  }

  @Patch(':guardianUserId')
  @Roles('principal', 'vice_principal')
  update(
    @Param('id', ParseIntPipe) studentId: number,
    @Param('guardianUserId', ParseIntPipe) guardianUserId: number,
    @Body() dto: UpdateGuardianDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.guardians.update(studentId, guardianUserId, dto, actor);
  }

  @Delete(':guardianUserId')
  @Roles('principal', 'vice_principal')
  @HttpCode(204)
  unlink(
    @Param('id', ParseIntPipe) studentId: number,
    @Param('guardianUserId', ParseIntPipe) guardianUserId: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.guardians.unlink(studentId, guardianUserId, actor);
  }
}
