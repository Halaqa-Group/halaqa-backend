import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { CorrectAttendanceDto } from '../dto/correct-attendance.dto';
import { ListStudentAttendanceQuery } from '../dto/list-student-attendance.query';
import { BulkSyncStudentAttendanceDto } from '../dto/sync-student-attendance.dto';
import {
  AttendanceDto,
  AttendanceListData,
  BulkSyncResultDto,
} from '../mappers/attendance.dto';
import { StudentAttendanceService } from '../services/student-attendance.service';

@ApiTags('Attendance')
@ApiBearerAuth('access-token')
@Controller('attendance/students')
export class StudentAttendanceController {
  constructor(private readonly service: StudentAttendanceService) {}

  // ─── Bulk offline sync ──────────────────────────────────────────────────────

  @Post('sync')
  @Roles('principal', 'vice_principal', 'teacher')
  @ApiOperation({
    summary: 'Bulk sync student attendance (offline batch)',
    description:
      'Idempotent upload of an offline attendance batch. Each entry is deduped by ' +
      '`client_uuid` (re-syncing the same batch changes nothing), then applied to the ' +
      "student's (student, date) row — a pre-seeded/existing row is corrected, otherwise a " +
      'new row is created. Entries the caller has no scope over are rejected individually ' +
      '(`forbidden`) without failing the batch. Supervisors and parents cannot record (403).',
  })
  @ApiBody({ type: BulkSyncStudentAttendanceDto })
  @ApiResponse({ status: 201, type: BulkSyncResultDto })
  @ApiResponse({ status: 403, description: 'Role cannot record attendance.' })
  async sync(
    @Body() dto: BulkSyncStudentAttendanceDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<BulkSyncResultDto> {
    const result = await this.service.bulkSync(
      dto.records.map((r) => ({
        studentId: r.student_id,
        date: r.date,
        status: r.status,
        excuseNote: r.excuse_note,
        clientUuid: r.client_uuid,
        clientRecordedAt: r.client_recorded_at,
        deviceId: r.device_id,
      })),
      actor,
    );

    return {
      created: result.created,
      updated: result.updated,
      duplicate: result.duplicate,
      forbidden: result.forbidden,
      results: result.results.map((r) => ({
        student_id: r.studentId,
        date: r.date,
        client_uuid: r.clientUuid,
        outcome: r.outcome,
        attendance_id: r.attendanceId,
      })),
    };
  }

  // ─── List ───────────────────────────────────────────────────────────────────

  @Get()
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher', 'parent')
  @ApiOperation({
    summary: 'List student attendance (role-scoped)',
    description:
      'Paginated attendance visible to the caller.\n' +
      '- **principal / vice_principal**: whole school.\n' +
      '- **supervisor**: students in supervised halaqat (read-only).\n' +
      '- **teacher**: students in their halaqat.\n' +
      '- **parent**: their own children (stripped view — no recorder/modifier fields).',
  })
  @ApiResponse({ status: 200, type: AttendanceListData })
  async list(
    @Query() query: ListStudentAttendanceQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<AttendanceListData> {
    const result = await this.service.list(
      {
        studentId: query.student_id,
        date: query.date,
        from: query.from,
        to: query.to,
        status: query.status,
        page: query.page,
        limit: query.limit,
      },
      actor,
    );

    return {
      items: result.items.map((a) => AttendanceDto.fromEntity(a, actor)),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  // ─── Single correction ──────────────────────────────────────────────────────

  @Patch(':id')
  @Roles('principal', 'vice_principal', 'teacher')
  @ApiOperation({
    summary: 'Correct a single attendance row',
    description:
      'Changes the status of one attendance row, recording who changed it, why ' +
      '(`modification_reason`), and the value it had before the first correction ' +
      '(`original_status`). Out-of-scope or cross-school rows return 404.',
  })
  @ApiParam({ name: 'id', description: 'Attendance row ID' })
  @ApiBody({ type: CorrectAttendanceDto })
  @ApiResponse({ status: 200, type: AttendanceDto })
  @ApiResponse({ status: 400, description: 'Status unchanged.' })
  @ApiResponse({ status: 404, description: 'Not found or out of scope.' })
  async correct(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CorrectAttendanceDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<AttendanceDto> {
    const row = await this.service.correct(
      id,
      {
        status: dto.status,
        excuseNote: dto.excuse_note,
        modificationReason: dto.modification_reason,
      },
      actor,
    );
    return AttendanceDto.fromEntity(row, actor);
  }
}
