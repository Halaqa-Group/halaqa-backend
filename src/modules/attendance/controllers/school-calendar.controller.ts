import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiMessage } from '../../../common/api-message';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { CreateHolidayDto } from '../dto/create-holiday.dto';
import { CreateSchoolScheduleDto } from '../dto/create-school-schedule.dto';
import {
  ListHolidaysQuery,
  ListSchedulesQuery,
} from '../dto/list-calendar.query';
import {
  HolidayListData,
  HolidayResponse,
  SchoolScheduleListData,
  SchoolScheduleResponse,
} from '../mappers/calendar.dto';
import { SchoolCalendarService } from '../services/school-calendar.service';

@ApiTags('Attendance')
@ApiBearerAuth('access-token')
@Controller('attendance')
export class SchoolCalendarController {
  constructor(private readonly service: SchoolCalendarService) {}

  // ─── Schedules ──────────────────────────────────────────────────────────────

  @Post('schedules')
  @Roles('principal', 'vice_principal')
  @ApiOperation({
    summary: 'Add a school schedule row (operating weekday)',
    description:
      'Declares that the school operates on `day_of_week` for the given effective ' +
      'window. The seed cron only creates attendance on days covered by an effective row.',
  })
  @ApiResponse({ status: 201, type: SchoolScheduleResponse })
  async createSchedule(
    @Body() dto: CreateSchoolScheduleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<SchoolScheduleResponse> {
    const row = await this.service.createSchedule(
      {
        dayOfWeek: dto.day_of_week,
        effectiveFrom: dto.effective_from,
        effectiveTo: dto.effective_to,
        notes: dto.notes,
      },
      actor,
    );
    return SchoolScheduleResponse.fromEntity(row);
  }

  @Get('schedules')
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher')
  @ApiOperation({ summary: 'List school schedule rows' })
  @ApiResponse({ status: 200, type: SchoolScheduleListData })
  async listSchedules(
    @Query() query: ListSchedulesQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<SchoolScheduleListData> {
    const rows = await this.service.listSchedules(actor.schoolId, query.on);
    return { items: rows.map((r) => SchoolScheduleResponse.fromEntity(r)) };
  }

  @Delete('schedules/:id')
  @Roles('principal', 'vice_principal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a school schedule row' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, type: ApiMessage })
  @ApiResponse({ status: 404, description: 'Not found or out of scope.' })
  async deleteSchedule(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ApiMessage> {
    await this.service.deleteSchedule(id, actor);
    return new ApiMessage('Schedule row deleted.');
  }

  // ─── Holidays ───────────────────────────────────────────────────────────────

  @Post('holidays')
  @Roles('principal', 'vice_principal')
  @ApiOperation({ summary: 'Add a holiday' })
  @ApiResponse({ status: 201, type: HolidayResponse })
  @ApiResponse({
    status: 409,
    description: 'A holiday already exists on this date.',
  })
  async createHoliday(
    @Body() dto: CreateHolidayDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<HolidayResponse> {
    const row = await this.service.createHoliday(
      { holidayDate: dto.holiday_date, description: dto.description },
      actor,
    );
    return HolidayResponse.fromEntity(row);
  }

  @Get('holidays')
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher')
  @ApiOperation({ summary: 'List holidays (optionally within a date range)' })
  @ApiResponse({ status: 200, type: HolidayListData })
  async listHolidays(
    @Query() query: ListHolidaysQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<HolidayListData> {
    const rows = await this.service.listHolidays(
      actor.schoolId,
      query.from,
      query.to,
    );
    return { items: rows.map((r) => HolidayResponse.fromEntity(r)) };
  }

  @Delete('holidays/:id')
  @Roles('principal', 'vice_principal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a holiday' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, type: ApiMessage })
  @ApiResponse({ status: 404, description: 'Not found or out of scope.' })
  async deleteHoliday(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ApiMessage> {
    await this.service.deleteHoliday(id, actor);
    return new ApiMessage('Holiday deleted.');
  }
}
