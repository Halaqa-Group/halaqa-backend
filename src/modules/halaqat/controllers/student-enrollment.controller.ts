import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
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
import { EnrollStudentDto } from '../dto/enroll-student.dto';
import { RemoveStudentDto } from '../dto/remove-student.dto';
import { StudentEnrollmentResponse } from '../dto/halaqa.responses';
import { TransferStudentDto } from '../dto/transfer-student.dto';
import {
  HalaqaAccessGuard,
  RequiresHalaqaPermission,
} from '../guards/halaqa-scope.guard';
import { StudentEnrollmentService } from '../services/student-enrollment.service';

@ApiTags('Student Enrollment')
@ApiBearerAuth('access-token')
@Controller('halaqat/:id/students')
export class StudentEnrollmentController {
  constructor(private readonly service: StudentEnrollmentService) {}

  @Post()
  @Roles('principal', 'vice_principal')
  @ApiOperation({
    summary: 'Enroll a student in a halaqa',
    description:
      'Creates an active enrollment. If the student was previously removed, ' +
      'updates the existing row and logs student_re_enrolled. ' +
      'Halaqa must be active.',
  })
  @ApiParam({ name: 'id', description: 'Halaqa ID' })
  @ApiBody({ type: EnrollStudentDto })
  @ApiResponse({ status: 201, type: StudentEnrollmentResponse })
  @ApiResponse({
    status: 404,
    description: 'Halaqa or student not found in school',
  })
  @ApiResponse({
    status: 409,
    description: 'Already enrolled or halaqa not active',
  })
  enroll(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EnrollStudentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.enroll(id, dto, actor);
  }

  @Get()
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher')
  @UseGuards(HalaqaAccessGuard)
  @RequiresHalaqaPermission('read')
  @ApiOperation({
    summary: 'List active students in a halaqa',
    description: 'Returns all students with status=active, ordered by name.',
  })
  @ApiParam({ name: 'id', description: 'Halaqa ID' })
  @ApiResponse({ status: 200, type: [StudentEnrollmentResponse] })
  @ApiResponse({ status: 404, description: 'Halaqa not found or out of scope' })
  listStudents(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.listStudents(id, actor);
  }

  @Post(':studentId/remove')
  @Roles('principal', 'vice_principal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remove a student from a halaqa',
    description:
      "Sets the enrollment status to 'completed' or 'archived' (unenrolled). " +
      'Student must be actively enrolled.',
  })
  @ApiParam({ name: 'id', description: 'Halaqa ID' })
  @ApiParam({ name: 'studentId', description: 'Student ID' })
  @ApiBody({ type: RemoveStudentDto })
  @ApiResponse({ status: 200, type: ApiMessage })
  @ApiResponse({
    status: 404,
    description: 'Halaqa not found or student not actively enrolled',
  })
  @ApiResponse({ status: 409, description: 'Halaqa is not active' })
  removeStudent(
    @Param('id', ParseIntPipe) id: number,
    @Param('studentId', ParseIntPipe) studentId: number,
    @Body() dto: RemoveStudentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.removeStudent(id, studentId, dto, actor);
  }

  @Post('transfer')
  @Roles('principal', 'vice_principal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Transfer a student between halaqat',
    description:
      'Atomically marks the source enrollment as transferred and creates an active ' +
      'enrollment in the destination halaqa. Both halaqat must be active and in the same school.',
  })
  @ApiParam({
    name: 'id',
    description:
      'Not used — from_halaqa_id and to_halaqa_id come from the body',
  })
  @ApiBody({ type: TransferStudentDto })
  @ApiResponse({ status: 200, type: ApiMessage })
  @ApiResponse({
    status: 400,
    description: 'from_halaqa_id equals to_halaqa_id',
  })
  @ApiResponse({
    status: 404,
    description:
      'Halaqa or student not found or student not enrolled in source',
  })
  @ApiResponse({
    status: 409,
    description: 'Halaqa not active or student already in destination',
  })
  transferStudent(
    @Body() dto: TransferStudentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.transferStudent(dto, actor);
  }
}
