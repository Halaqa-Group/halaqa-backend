import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ApiMessage } from '../../../common/api-message';
import { Audit } from '../../../common/decorators/audit.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import {
  HalaqaAccessGuard,
  HalaqaEditAccessGuard,
  RequiresHalaqaPermission,
} from '../../halaqat/guards/halaqa-scope.guard';
import { DailyReportQuery } from '../dto/daily-report.query';
import {
  DailyReportResponse,
  StudentDetailResponse,
} from '../dto/daily-report.responses';
import { RecalculateDto } from '../dto/recalculate.dto';
import { DailyReportService } from '../services/daily-report.service';

/**
 * Daily evaluation report endpoints (§29). The route param is `:id` (the halaqa
 * id) because the shared HalaqaAccessGuard scopes on `req.params.id`. Read access
 * for principal / vice_principal / supervisor / teacher within their scope;
 * cross-scope requests get 404 (BR-HLQ-01).
 */
@ApiTags('daily-reports')
@Controller('halaqat')
export class DailyReportController {
  constructor(private readonly service: DailyReportService) {}

  @Get(':id/daily-report')
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher')
  @UseGuards(HalaqaAccessGuard)
  @RequiresHalaqaPermission('read')
  @ApiOkResponse({ type: DailyReportResponse })
  getReport(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: DailyReportQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<DailyReportResponse> {
    return this.service.getDailyReport(id, query.date, actor);
  }

  @Get(':id/daily-report/:date/students/:studentId')
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher')
  @UseGuards(HalaqaAccessGuard)
  @RequiresHalaqaPermission('read')
  @ApiOkResponse({ type: StudentDetailResponse })
  getStudentDetail(
    @Param('id', ParseIntPipe) id: number,
    @Param('date') date: string,
    @Param('studentId', ParseIntPipe) studentId: number,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<StudentDetailResponse> {
    return this.service.getStudentDetail(id, date, studentId, actor);
  }

  /** Recalculate + replace the saved report for a day (§29.3). Write scope. */
  @Post(':id/daily-reports/:date/recalculate')
  @Roles('principal', 'vice_principal', 'supervisor')
  @UseGuards(HalaqaEditAccessGuard)
  @RequiresHalaqaPermission('write')
  @Audit('daily_report.recalculate')
  recalculate(
    @Param('id', ParseIntPipe) id: number,
    @Param('date') date: string,
    @Body() dto: RecalculateDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ApiMessage> {
    return this.service.recalculateDay(id, date, dto.reason ?? null, actor);
  }
}
