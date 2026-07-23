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
import { CorrectTeacherAttendanceDto } from '../dto/correct-teacher-attendance.dto';
import { ListTeacherAttendanceQuery } from '../dto/list-teacher-attendance.query';
import { BulkSyncTeacherAttendanceDto } from '../dto/sync-teacher-attendance.dto';
import {
  TeacherAttendanceDto,
  TeacherAttendanceListData,
  TeacherBulkSyncResultDto,
} from '../mappers/teacher-attendance.dto';
import { TeacherAttendanceService } from '../services/teacher-attendance.service';

@ApiTags('Attendance')
@ApiBearerAuth('access-token')
@Controller('attendance/teachers')
export class TeacherAttendanceController {
  constructor(private readonly service: TeacherAttendanceService) {}

  @Post('sync')
  @Roles('principal', 'vice_principal')
  @ApiOperation({
    summary: 'Bulk sync staff attendance (offline batch)',
    description:
      'Idempotent upload of a staff attendance batch (teachers + admins). ' +
      'Principal / vice_principal only. Same dedup-by-`client_uuid` and per-row ' +
      '`forbidden` semantics as student sync.',
  })
  @ApiBody({ type: BulkSyncTeacherAttendanceDto })
  @ApiResponse({ status: 201, type: TeacherBulkSyncResultDto })
  @ApiResponse({
    status: 403,
    description: 'Only principal/VP can record staff attendance.',
  })
  async sync(
    @Body() dto: BulkSyncTeacherAttendanceDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<TeacherBulkSyncResultDto> {
    const result = await this.service.bulkSync(
      dto.records.map((r) => ({
        userId: r.user_id,
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
        user_id: r.userId,
        date: r.date,
        client_uuid: r.clientUuid,
        outcome: r.outcome,
        attendance_id: r.attendanceId,
      })),
    };
  }

  @Get()
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher')
  @ApiOperation({
    summary: 'List staff attendance',
    description:
      'principal / vice_principal see all staff in the school; any other staff role ' +
      'sees only their own rows.',
  })
  @ApiResponse({ status: 200, type: TeacherAttendanceListData })
  async list(
    @Query() query: ListTeacherAttendanceQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<TeacherAttendanceListData> {
    const result = await this.service.list(
      {
        userId: query.user_id,
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
      items: result.items.map((a) => TeacherAttendanceDto.fromEntity(a)),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  @Patch(':id')
  @Roles('principal', 'vice_principal')
  @ApiOperation({
    summary: 'Correct a single staff attendance row',
    description:
      'Principal / vice_principal only. Records who changed it, why, and the original status.',
  })
  @ApiParam({ name: 'id', description: 'Attendance row ID' })
  @ApiBody({ type: CorrectTeacherAttendanceDto })
  @ApiResponse({ status: 200, type: TeacherAttendanceDto })
  @ApiResponse({ status: 400, description: 'Status unchanged.' })
  @ApiResponse({
    status: 403,
    description: 'Only principal/VP can correct staff attendance.',
  })
  @ApiResponse({ status: 404, description: 'Not found or out of scope.' })
  async correct(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CorrectTeacherAttendanceDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<TeacherAttendanceDto> {
    const row = await this.service.correct(
      id,
      {
        status: dto.status,
        excuseNote: dto.excuse_note,
        modificationReason: dto.modification_reason,
      },
      actor,
    );
    return TeacherAttendanceDto.fromEntity(row);
  }
}
