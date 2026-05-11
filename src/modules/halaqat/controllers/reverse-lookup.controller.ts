import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
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
import {
  StudentHalaqaItem,
  SupervisorHalaqaItem,
  TeacherHalaqaItem,
} from '../dto/halaqa.responses';
import { ReverseLookupService } from '../services/reverse-lookup.service';

@ApiBearerAuth('access-token')
@Controller()
export class ReverseLookupController {
  constructor(private readonly service: ReverseLookupService) {}

  @Get('users/:userId/halaqat')
  @Roles('principal', 'vice_principal', 'teacher')
  @ApiTags('Reverse Lookup')
  @ApiOperation({
    summary: "List a teacher's active halaqa assignments",
    description:
      'Admins can query any user. Teachers may only query themselves (returns 403 otherwise).',
  })
  @ApiParam({ name: 'userId', description: 'Teacher user ID' })
  @ApiResponse({ status: 200, type: [TeacherHalaqaItem] })
  @ApiResponse({ status: 403, description: 'Non-admin querying another user' })
  @ApiResponse({ status: 404, description: 'User not found in this school' })
  teacherHalaqat(
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.teacherHalaqat(userId, actor);
  }

  @Get('users/:userId/supervised-halaqat')
  @Roles('principal', 'vice_principal', 'supervisor')
  @ApiTags('Reverse Lookup')
  @ApiOperation({
    summary: "List a supervisor's halaqa assignments",
    description:
      'Admins can query any user. Supervisors may only query themselves (returns 403 otherwise).',
  })
  @ApiParam({ name: 'userId', description: 'Supervisor user ID' })
  @ApiResponse({ status: 200, type: [SupervisorHalaqaItem] })
  @ApiResponse({ status: 403, description: 'Non-admin querying another user' })
  @ApiResponse({ status: 404, description: 'User not found in this school' })
  supervisorHalaqat(
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.supervisorHalaqat(userId, actor);
  }

  @Get('students/:studentId/halaqat')
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher')
  @ApiTags('Reverse Lookup')
  @ApiOperation({
    summary: "List a student's halaqa enrollments",
    description: 'Returns all enrollment records (all statuses) for the student, newest first.',
  })
  @ApiParam({ name: 'studentId', description: 'Student ID' })
  @ApiResponse({ status: 200, type: [StudentHalaqaItem] })
  @ApiResponse({ status: 404, description: 'Student not found in this school' })
  studentHalaqat(
    @Param('studentId', ParseIntPipe) studentId: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.studentHalaqat(studentId, actor);
  }
}
