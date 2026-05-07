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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { LinkGuardianDto } from '../dto/link-guardian.dto';
import {
  GuardianEnvelope,
  GuardianListEnvelope,
} from '../dto/student.responses';
import { UpdateGuardianDto } from '../dto/update-guardian.dto';
import { StudentScopeGuard } from '../guards/student-scope.guard';
import { GuardiansService } from '../services/guardians.service';
import { StudentsService } from '../services/students.service';

@ApiTags('Guardians')
@ApiBearerAuth('access-token')
@ApiParam({
  name: 'id',
  type: Number,
  description: 'Student id (path param `:id` from the parent route).',
})
@Controller('students/:id/guardians')
@UseGuards(StudentScopeGuard)
export class StudentGuardiansController {
  constructor(
    private readonly guardians: GuardiansService,
    private readonly students: StudentsService,
  ) {}

  @Get()
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher', 'parent')
  @ApiOperation({
    summary: 'List guardians linked to a student',
    description:
      'Visibility follows the same scope rules as `GET /students/:id`. Ordered by link-creation time.',
  })
  @ApiResponse({ status: 200, type: GuardianListEnvelope })
  list(
    @Param('id', ParseIntPipe) studentId: number,
    @CurrentUser() _actor: AuthenticatedUser,
  ) {
    return this.guardians.listForStudentId(studentId);
  }

  @Post()
  @Roles('principal', 'vice_principal')
  @ApiOperation({
    summary: 'Link a guardian to a student',
    description:
      'Either reference an existing parent user (`guardian_user_id`) or create one inline (`email` + `name`). ' +
      'Setting `is_primary: true` demotes any existing primary on the student (BR-STD-04).',
  })
  @ApiResponse({ status: 201, type: GuardianEnvelope })
  link(
    @Param('id', ParseIntPipe) studentId: number,
    @Body() dto: LinkGuardianDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.guardians.link(studentId, dto, actor);
  }

  @Patch(':guardianUserId')
  @Roles('principal', 'vice_principal')
  @ApiOperation({
    summary: 'Update a guardian link',
    description:
      'Adjust relation, primary flag, or pickup permission. Promoting one guardian to primary demotes the existing primary.',
  })
  @ApiParam({ name: 'guardianUserId', type: Number })
  @ApiResponse({ status: 200, type: GuardianEnvelope })
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
  @ApiOperation({
    summary: 'Unlink a guardian from a student',
    description: 'Removes the link only — does not delete the guardian user.',
  })
  @ApiParam({ name: 'guardianUserId', type: Number })
  @ApiResponse({ status: 204, description: 'Unlinked (no body)' })
  unlink(
    @Param('id', ParseIntPipe) studentId: number,
    @Param('guardianUserId', ParseIntPipe) guardianUserId: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.guardians.unlink(studentId, guardianUserId, actor);
  }
}
