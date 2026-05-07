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
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorEnvelope } from '../../auth/dto/auth.responses';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { LinkGuardianDto } from '../dto/link-guardian.dto';
import { GuardianEnvelope, GuardianListEnvelope } from '../dto/student.responses';
import { UpdateGuardianDto } from '../dto/update-guardian.dto';
import { StudentScopeGuard } from '../guards/student-scope.guard';
import { GuardiansService } from '../services/guardians.service';
import { StudentsService } from '../services/students.service';

@ApiTags('Student Guardians')
@ApiBearerAuth('access-token')
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
    summary: 'List guardians for a student',
    description:
      'Returns all guardians linked to the student, sorted by creation time (ascending). ' +
      'Caller must pass the `StudentScopeGuard` — out-of-scope or cross-school access returns 404. ' +
      'Does NOT write an audit log.',
  })
  @ApiParam({ name: 'id', description: 'Student ID' })
  @ApiResponse({ status: 200, type: GuardianListEnvelope })
  @ApiResponse({ status: 401, type: ErrorEnvelope })
  @ApiResponse({ status: 404, description: 'Student not found or out of scope', type: ErrorEnvelope })
  list(
    @Param('id', ParseIntPipe) studentId: number,
    @CurrentUser() _actor: AuthenticatedUser,
  ) {
    return this.guardians.listForStudentId(studentId);
  }

  @Post()
  @Roles('principal', 'vice_principal')
  @ApiOperation({
    summary: 'Link a guardian to a student (BR-STU-05)',
    description:
      'Links a guardian to the student via one of two flows:\n\n' +
      '**ID flow** (`guardian_user_id`): the user must exist in the same school. ' +
      '`ensureRoleBySlug("parent", ...)` is called — idempotent, adds role if missing. ' +
      'Returns 404 if the user does not exist in this school.\n\n' +
      '**Email flow** (`email`): if a user with that email exists, they are linked (same as ID flow). ' +
      'If not, a new user is created with a random temporary password and the `parent` role, ' +
      'and a parent-invite email is dispatched containing a set-password link (7-day TTL).\n\n' +
      '**`is_primary` invariant (seven cases):**\n' +
      '1. First guardian on the student → forced to `is_primary=true`.\n' +
      '2. Subsequent guardian with `is_primary=true` → unsets the existing primary first.\n' +
      '3. Subsequent guardian with `is_primary=false` (or omitted) → leaves existing primary alone.\n\n' +
      'Audit: `student.guardian.link`.',
  })
  @ApiParam({ name: 'id', description: 'Student ID' })
  @ApiBody({ type: LinkGuardianDto })
  @ApiResponse({ status: 201, type: GuardianEnvelope })
  @ApiResponse({ status: 400, description: 'Validation failure or guardian already linked', type: ErrorEnvelope })
  @ApiResponse({ status: 401, type: ErrorEnvelope })
  @ApiResponse({ status: 403, type: ErrorEnvelope })
  @ApiResponse({ status: 404, description: 'Student or guardian user not found in this school', type: ErrorEnvelope })
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
    summary: 'Update a guardian link (BR-STU-06)',
    description:
      'Updates `relation`, `is_primary`, or `can_pickup` for an existing guardian link.\n\n' +
      '**`is_primary` rules:**\n' +
      '- `is_primary=true`: unsets the current primary, then sets this guardian as primary. ' +
      'Audit: `student.guardian.update` + implicit `student.guardian.primary_promoted` for the old primary.\n' +
      '- `is_primary=false`: always rejected with **400** — demoting a primary is not permitted directly. ' +
      'Instead, promote a different guardian.\n\n' +
      'Audit: `student.guardian.update`.',
  })
  @ApiParam({ name: 'id', description: 'Student ID' })
  @ApiParam({ name: 'guardianUserId', description: 'Guardian user ID' })
  @ApiBody({ type: UpdateGuardianDto })
  @ApiResponse({ status: 200, type: GuardianEnvelope })
  @ApiResponse({ status: 400, description: 'is_primary=false rejected or validation failure', type: ErrorEnvelope })
  @ApiResponse({ status: 401, type: ErrorEnvelope })
  @ApiResponse({ status: 403, type: ErrorEnvelope })
  @ApiResponse({ status: 404, description: 'Student or guardian link not found', type: ErrorEnvelope })
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
    summary: 'Unlink a guardian from a student (BR-STU-07)',
    description:
      'Removes the guardian link. Behaviour depends on whether the guardian is the primary:\n\n' +
      '- **Non-primary**: unlinked without side effects.\n' +
      '- **Primary, others remain**: earliest-created remaining guardian is auto-promoted to primary. ' +
      'Audit: `student.guardian.primary_promoted`.\n' +
      '- **Last guardian**: link removed. Audit: `student.orphaned`. ' +
      'A notification is dispatched to all vice_principals in the school via `NotificationService` ' +
      '(currently a logger stub — real delivery TBD).\n\n' +
      'Audit: `student.guardian.unlink`.',
  })
  @ApiParam({ name: 'id', description: 'Student ID' })
  @ApiParam({ name: 'guardianUserId', description: 'Guardian user ID' })
  @ApiResponse({ status: 204, description: 'Guardian unlinked (no body)' })
  @ApiResponse({ status: 401, type: ErrorEnvelope })
  @ApiResponse({ status: 403, type: ErrorEnvelope })
  @ApiResponse({ status: 404, description: 'Student or guardian link not found', type: ErrorEnvelope })
  unlink(
    @Param('id', ParseIntPipe) studentId: number,
    @Param('guardianUserId', ParseIntPipe) guardianUserId: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.guardians.unlink(studentId, guardianUserId, actor);
  }
}
