import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { ApiMessage } from '../../../common/api-message';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { AssignTeacherDto } from '../dto/assign-teacher.dto';
import { EndAssignmentDto } from '../dto/end-assignment.dto';
import { SetActingDto } from '../dto/set-acting.dto';
import { UpdateTeacherAssignmentDto } from '../dto/update-teacher-assignment.dto';
import {
  HalaqaAccessGuard,
  RequiresHalaqaPermission,
} from '../guards/halaqa-scope.guard';
import { ActingTeacherService } from '../services/acting-teacher.service';
import { TeacherAssignmentService } from '../services/teacher-assignment.service';

@ApiTags('Teacher Assignments')
@ApiBearerAuth('access-token')
@Controller('halaqat/:id/teachers')
export class TeacherAssignmentController {
  constructor(
    private readonly service: TeacherAssignmentService,
    private readonly actingService: ActingTeacherService,
  ) {}

  @Post()
  @Roles('principal', 'vice_principal')
  @ApiOperation({
    summary: 'Assign a teacher to a halaqa',
    description:
      'Creates an active assignment for the teacher. Role must be main or assistant — ' +
      'use the acting-substitute endpoint for substitutes. ' +
      'Runs schedule conflict check (BR-HLQ-02).',
  })
  @ApiParam({ name: 'id', description: 'Halaqa ID' })
  @ApiBody({ type: AssignTeacherDto })
  @ApiResponse({ status: 201 })
  @ApiResponse({
    status: 404,
    description: 'Halaqa or teacher not found in school',
  })
  @ApiResponse({
    status: 409,
    description: 'Already assigned or schedule conflict',
  })
  assign(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignTeacherDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.assign(id, dto, actor);
  }

  @Get()
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher')
  @UseGuards(HalaqaAccessGuard)
  @RequiresHalaqaPermission('read')
  @ApiOperation({
    summary: 'List active teacher assignments',
    description:
      'Returns all active (end_date IS NULL) assignments for the halaqa, acting teacher first.',
  })
  @ApiParam({ name: 'id', description: 'Halaqa ID' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'Not found or out of scope' })
  findAll(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.findAll(id, actor);
  }

  @Patch(':assignmentId')
  @Roles('principal', 'vice_principal')
  @ApiOperation({
    summary: 'Update assignment role or notes',
    description:
      'Updates role (main ↔ assistant only — cannot change substitute) and/or notes. ' +
      'Logs teacher_role_changed when the role actually changes.',
  })
  @ApiParam({ name: 'id', description: 'Halaqa ID' })
  @ApiParam({ name: 'assignmentId', description: 'Assignment ID' })
  @ApiBody({ type: UpdateTeacherAssignmentDto })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'Halaqa or assignment not found' })
  @ApiResponse({
    status: 409,
    description: 'Assignment already ended or role is substitute',
  })
  updateAssignment(
    @Param('id', ParseIntPipe) id: number,
    @Param('assignmentId', ParseIntPipe) assignmentId: number,
    @Body() dto: UpdateTeacherAssignmentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.updateAssignment(id, assignmentId, dto, actor);
  }

  @Post(':assignmentId/end')
  @Roles('principal', 'vice_principal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'End a teacher assignment',
    description:
      'Sets end_date and end_reason. Clears acting_as_primary if the teacher was acting. ' +
      'end_date must be >= the assignment start_date.',
  })
  @ApiParam({ name: 'id', description: 'Halaqa ID' })
  @ApiParam({ name: 'assignmentId', description: 'Assignment ID' })
  @ApiBody({ type: EndAssignmentDto })
  @ApiResponse({ status: 200, type: ApiMessage })
  @ApiResponse({ status: 400, description: 'end_date before start_date' })
  @ApiResponse({ status: 404, description: 'Halaqa or assignment not found' })
  @ApiResponse({ status: 409, description: 'Assignment already ended' })
  endAssignment(
    @Param('id', ParseIntPipe) id: number,
    @Param('assignmentId', ParseIntPipe) assignmentId: number,
    @Body() dto: EndAssignmentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.endAssignment(id, assignmentId, dto, actor);
  }

  @Post(':assignmentId/acting')
  @Roles('principal', 'vice_principal')
  @ApiOperation({
    summary: 'Set an existing teacher as acting primary (Workflow A)',
    description:
      'Marks an active assignment as acting. If acting_starts_at is today, acting_as_primary is set immediately; ' +
      'if future, a cron job flips it. Only one acting teacher per halaqa at a time.',
  })
  @ApiParam({ name: 'id', description: 'Halaqa ID' })
  @ApiParam({ name: 'assignmentId', description: 'Assignment ID' })
  @ApiBody({ type: SetActingDto })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 400, description: 'acting_starts_at is in the past' })
  @ApiResponse({ status: 404, description: 'Halaqa or assignment not found' })
  @ApiResponse({
    status: 409,
    description:
      'Assignment ended, already acting, or another acting teacher exists',
  })
  setActing(
    @Param('id', ParseIntPipe) id: number,
    @Param('assignmentId', ParseIntPipe) assignmentId: number,
    @Body() dto: SetActingDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.actingService.setActing(id, assignmentId, dto, actor);
  }
}
