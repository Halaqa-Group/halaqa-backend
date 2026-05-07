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
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { CreateStudentDto } from '../dto/create-student.dto';
import { GraduateStudentDto } from '../dto/graduate-student.dto';
import { ListStudentsQuery } from '../dto/list-students.query';
import {
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
    summary: 'List students visible to the caller',
    description:
      'Results are scoped by role: principal/vice_principal see all in the school; supervisor/teacher see ' +
      'students in their halaqat; parent sees only their linked children. Supports pagination and filters.',
  })
  @ApiResponse({ status: 200, type: StudentListEnvelope })
  list(@Query() query: ListStudentsQuery, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.list(query, actor);
  }

  @Get(':id')
  @UseGuards(StudentScopeGuard)
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher', 'parent')
  @ApiOperation({
    summary: 'Get one student with guardians',
    description:
      'Visibility enforced by `StudentScopeGuard` — returns 404 instead of 403 when the student is out of scope.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, type: StudentEnvelope })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.findOne(id, actor);
  }

  @Post()
  @Roles('principal', 'vice_principal')
  @ApiOperation({
    summary: 'Create a student (with optional guardians)',
    description:
      'Principal/vice_principal only. Daily-page capacities default to 1/5/10 (hifz/near/far) when omitted ' +
      '(BR-STD-02). Guardians may be linked inline.',
  })
  @ApiResponse({ status: 201, type: StudentEnvelope })
  create(@Body() dto: CreateStudentDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.create(dto, actor);
  }

  @Patch(':id')
  @UseGuards(StudentScopeGuard)
  @Roles('principal', 'vice_principal', 'teacher')
  @ApiOperation({
    summary: 'Update a student',
    description:
      'Principal/vice_principal can edit any field. Teachers may only adjust daily-page capacities and notes ' +
      '(other fields in the body are ignored for teacher-only callers).',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, type: StudentEnvelope })
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
    summary: 'Soft-delete a student',
    description: 'Sets `deleted_at`. The student is hidden from default queries but recoverable via `/restore`.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 204, description: 'Soft-deleted (no body)' })
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
    description: 'Clears `deleted_at`. Principal/vice_principal only.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 201, type: StudentEnvelope })
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
    summary: 'Mark a student as graduated',
    description:
      'Sets status to `graduated` and stamps the graduation date (defaults to today when omitted).',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 201, type: StudentEnvelope })
  graduate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GraduateStudentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.graduate(id, dto, actor);
  }
}
