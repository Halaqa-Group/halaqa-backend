import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import {
  AlertsQuery,
  DashboardQuery,
  TopStudentsQuery,
} from '../dto/dashboard.query';
import {
  AlertsDto,
  HalaqatPerformanceDto,
  OverviewDto,
  TeachersCommitmentDto,
  TopStudentsDto,
} from '../dto/dashboard-response.dto';
import { DashboardService } from '../services/dashboard.service';

const SCOPED_NOTE =
  'Auto-scoped to the caller: principal/VP see the whole school, ' +
  'supervisors their supervised halaqat, teachers their currently-assigned halaqat. ' +
  'An out-of-scope caller simply gets empty/zero results (never 403).';

@ApiTags('Dashboard')
@ApiBearerAuth('access-token')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('overview')
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher')
  @ApiOperation({
    summary: 'Headline KPI cards',
    description:
      'Role-scoped headline indicators for the home screen: student attendance rate, ' +
      'teacher attendance rate (`null` for the teacher role), ethics average, ' +
      'new-memorization verses (Hifz), plan-completion rate, average score, and ' +
      'active student/halaqa counts.\n\n' +
      SCOPED_NOTE,
  })
  @ApiResponse({ status: 200, type: OverviewDto })
  overview(
    @Query() query: DashboardQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<OverviewDto> {
    return this.service.overview(actor, {
      period: query.period,
      from: query.from,
      to: query.to,
      compare: query.compare,
    });
  }

  @Get('top-students')
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher')
  @ApiOperation({
    summary: 'Top students by new memorization',
    description:
      'Leaderboard of students ranked by verses from approved achievements in the period ' +
      '(`track` defaults to `Hifz` — الحفظ الجديد). `limit` defaults to 10, capped at 50.\n\n' +
      SCOPED_NOTE,
  })
  @ApiResponse({ status: 200, type: TopStudentsDto })
  topStudents(
    @Query() query: TopStudentsQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<TopStudentsDto> {
    return this.service.topStudents(actor, query);
  }

  @Get('halaqat')
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher')
  @ApiOperation({
    summary: 'Per-halaqa performance',
    description:
      'One row per active halaqa in scope: active students, attendance rate, ' +
      'new-memorization verses, average score, and plan-completion rate. Sorted by verses.\n\n' +
      SCOPED_NOTE,
  })
  @ApiResponse({ status: 200, type: HalaqatPerformanceDto })
  halaqat(
    @Query() query: DashboardQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<HalaqatPerformanceDto> {
    return this.service.halaqatPerformance(actor, query);
  }

  @Get('alerts')
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher')
  @ApiOperation({
    summary: 'Actionable alerts',
    description:
      'Oversight cards that need action:\n' +
      '- **stalled_students**: active students with no approved achievement in the last `stalled_days` days (default 7).\n' +
      '- **halaqat_without_teacher**: active halaqat with no active main teacher.\n' +
      '- **high_absence_teachers**: teachers with ≥ `absence_threshold` (default 2) absent days in the period.\n\n' +
      'Auto-scoped: principal/VP see the school, supervisors their supervised halaqat, ' +
      'teachers their currently-assigned halaqat. **high_absence_teachers is empty for the ' +
      'teacher role** (staff commitment is above their level).',
  })
  @ApiResponse({ status: 200, type: AlertsDto })
  alerts(
    @Query() query: AlertsQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<AlertsDto> {
    return this.service.alerts(actor, {
      period: query.period,
      from: query.from,
      to: query.to,
      stalledDays: query.stalled_days,
      absenceThreshold: query.absence_threshold,
    });
  }

  @Get('teachers')
  @Roles('principal', 'vice_principal', 'supervisor')
  @ApiOperation({
    summary: 'Teacher commitment (معدل التزام المحفظين)',
    description:
      'One row per teacher in scope: their own attendance rate, number of halaqat/students, ' +
      "and their students' attendance rate and new-memorization verses. " +
      'Not available to the teacher role (they cannot see staff commitment).\n\n' +
      'Scoped to school (principal/VP) or supervised halaqat (supervisor).',
  })
  @ApiResponse({ status: 200, type: TeachersCommitmentDto })
  teachers(
    @Query() query: DashboardQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<TeachersCommitmentDto> {
    return this.service.teacherCommitment(actor, query);
  }
}
