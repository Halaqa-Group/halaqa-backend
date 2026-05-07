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
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorEnvelope, MessageEnvelope } from '../../auth/dto/auth.responses';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { CreateStudentDto } from '../dto/create-student.dto';
import { GraduateStudentDto } from '../dto/graduate-student.dto';
import { ListStudentsQuery } from '../dto/list-students.query';
import {
  StudentDetailEnvelope,
  StudentEnvelope,
  StudentListEnvelope,
} from '../dto/student.responses';
import { UpdateStudentDto } from '../dto/update-student.dto';
import { StudentScopeGuard } from '../guards/student-scope.guard';
import { StudentsService } from '../services/students.service';

@ApiTags('Students')
@ApiBearerAuth('access-token')
@Controller('students')
export class StudentsController {
  constructor(private readonly service: StudentsService) {}

  @Get()
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher', 'parent')
  @ApiOperation({
    summary: 'List students (role-scoped)',
    description:
      'Returns a paginated list of students visible to the caller. Scope rules per role:\n' +
      '- **principal / vice_principal**: all active students in the school.\n' +
      '- **supervisor**: students in halaqat the supervisor oversees.\n' +
      '- **teacher**: students in halaqat where the teacher is primary.\n' +
      '- **parent**: their own children across all schools (the one exception to strict school-scoping).\n\n' +
      '`include_deleted=true` is silently ignored for non-principal/VP callers. ' +
      'Does NOT write an audit log (read-only).',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'q', required: false, description: 'Name search' })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'inactive', 'graduated'] })
  @ApiQuery({ name: 'gender', required: false, enum: ['male', 'female'] })
  @ApiQuery({ name: 'halaqa_id', required: false })
  @ApiQuery({ name: 'include_deleted', required: false, description: 'Principal/VP only' })
  @ApiResponse({ status: 200, type: StudentListEnvelope })
  @ApiResponse({ status: 401, type: ErrorEnvelope })
  list(@Query() query: ListStudentsQuery, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.list(query, actor);
  }

  @Get(':id')
  @UseGuards(StudentScopeGuard)
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher', 'parent')
  @ApiOperation({
    summary: 'Get a student by ID (with guardians)',
    description:
      'Returns the full student record including all linked guardians. ' +
      'Out-of-scope or cross-school access returns **404** (not 403) to avoid leaking student existence. ' +
      'Guardians are loaded eagerly and sorted by creation time (primary first is not guaranteed — check `is_primary`). ' +
      'Does NOT write an audit log.',
  })
  @ApiParam({ name: 'id', description: 'Student ID' })
  @ApiResponse({ status: 200, type: StudentDetailEnvelope })
  @ApiResponse({ status: 401, type: ErrorEnvelope })
  @ApiResponse({ status: 404, description: 'Student not found or out of scope', type: ErrorEnvelope })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.findOne(id, actor);
  }

  @Post()
  @Roles('principal', 'vice_principal')
  @ApiOperation({
    summary: 'Create a student (BR-STU-01)',
    description:
      'Creates a student in the caller\'s school. ' +
      'An optional `guardians[]` array links guardians atomically in the same transaction — ' +
      'the first entry is forced to `is_primary=true` regardless of the submitted value. ' +
      'For the email-branch guardian flow, if no user exists a new account is created with the `parent` role ' +
      'and a parent-invite email is dispatched. ' +
      'Audit: `student.create` (+ `student.guardian.link` per linked guardian).',
  })
  @ApiBody({ type: CreateStudentDto })
  @ApiResponse({ status: 201, type: StudentEnvelope })
  @ApiResponse({ status: 400, description: 'Validation failure', type: ErrorEnvelope })
  @ApiResponse({ status: 401, type: ErrorEnvelope })
  @ApiResponse({ status: 403, description: 'Insufficient role', type: ErrorEnvelope })
  create(@Body() dto: CreateStudentDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.create(dto, actor);
  }

  @Patch(':id')
  @UseGuards(StudentScopeGuard)
  @Roles('principal', 'vice_principal', 'teacher')
  @ApiOperation({
    summary: 'Update a student (BR-STU-02)',
    description:
      'Updates an in-scope student. Caller role determines allowed fields:\n' +
      '- **principal / vice_principal**: all fields in `UpdateStudentDto` (bio + capacity + notes).\n' +
      '- **teacher**: capacity fields + `notes` only (`UpdateStudentByTeacherDto`). ' +
      'Teacher must be the **primary teacher** on at least one of the student\'s halaqat; otherwise 403. ' +
      'Submitting bio fields as a teacher returns 400.\n\n' +
      'Capacity values out of range (hifz 0–20, near 0–50, far 0–100) return 400. ' +
      'Audit: `student.update` with `oldValues`/`newValues` of changed fields only.',
  })
  @ApiParam({ name: 'id', description: 'Student ID' })
  @ApiBody({ type: UpdateStudentDto })
  @ApiResponse({ status: 200, type: StudentEnvelope })
  @ApiResponse({ status: 400, description: 'Validation failure or capacity out of range', type: ErrorEnvelope })
  @ApiResponse({ status: 401, type: ErrorEnvelope })
  @ApiResponse({ status: 403, description: 'Teacher not primary on any of the student\'s halaqat', type: ErrorEnvelope })
  @ApiResponse({ status: 404, description: 'Student not found or out of scope', type: ErrorEnvelope })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStudentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const roles = actor.roles.map((r) => r.slug);
    const isTeacherOnly =
      roles.includes('teacher') &&
      !roles.includes('principal') &&
      !roles.includes('vice_principal');
    return this.service.update(id, dto, actor, isTeacherOnly);
  }

  @Delete(':id')
  @UseGuards(StudentScopeGuard)
  @Roles('principal', 'vice_principal')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Soft-delete a student (BR-STU-03)',
    description:
      'Soft-deletes the student (sets `deleted_at`). The student no longer appears in list results ' +
      'unless `include_deleted=true` is passed. Guardian links are preserved and can be restored. ' +
      'Audit: `student.delete`.',
  })
  @ApiParam({ name: 'id', description: 'Student ID' })
  @ApiResponse({ status: 204, description: 'Student deleted (no body)' })
  @ApiResponse({ status: 401, type: ErrorEnvelope })
  @ApiResponse({ status: 403, type: ErrorEnvelope })
  @ApiResponse({ status: 404, description: 'Student not found or out of scope', type: ErrorEnvelope })
  softDelete(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.softDelete(id, actor);
  }

  @Post(':id/restore')
  @Roles('principal', 'vice_principal')
  @ApiOperation({
    summary: 'Restore a soft-deleted student',
    description:
      'Clears `deleted_at` and returns the student to active status. ' +
      'Only applies to soft-deleted students; calling on a non-deleted student is a no-op. ' +
      'Audit: `student.restore`.',
  })
  @ApiParam({ name: 'id', description: 'Student ID' })
  @ApiResponse({ status: 200, type: StudentEnvelope })
  @ApiResponse({ status: 401, type: ErrorEnvelope })
  @ApiResponse({ status: 403, type: ErrorEnvelope })
  @ApiResponse({ status: 404, description: 'Student not found', type: ErrorEnvelope })
  restore(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.restore(id, actor);
  }

  @Post(':id/graduate')
  @UseGuards(StudentScopeGuard)
  @Roles('principal', 'vice_principal')
  @ApiOperation({
    summary: 'Graduate a student (BR-STU-04)',
    description:
      'Sets `status = graduated`. Does **not** soft-delete the student — the record is retained for historical reporting. ' +
      'Graduating an already-graduated student returns 400. ' +
      '`graduation_date` and `notes` are stored in the audit log `newValues` only, not on the student record. ' +
      'Audit: `student.graduate`.',
  })
  @ApiParam({ name: 'id', description: 'Student ID' })
  @ApiBody({ type: GraduateStudentDto })
  @ApiResponse({ status: 200, type: MessageEnvelope })
  @ApiResponse({ status: 400, description: 'Student already graduated', type: ErrorEnvelope })
  @ApiResponse({ status: 401, type: ErrorEnvelope })
  @ApiResponse({ status: 403, type: ErrorEnvelope })
  @ApiResponse({ status: 404, description: 'Student not found or out of scope', type: ErrorEnvelope })
  graduate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GraduateStudentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.graduate(id, dto, actor);
  }
}
