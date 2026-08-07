import { Controller, Get, Headers, Query } from '@nestjs/common';
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
  'An out-of-scope caller simply gets empty/zero results (never 403). ' +
  'A multi-role user may send `X-Active-Role` to scope to the role they are ' +
  'acting as; it can only narrow, never widen.';

@ApiTags('Dashboard')
@ApiBearerAuth('access-token')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  /**
   * Narrows the actor to the role named in `X-Active-Role`, so a user who holds
   * several roles (e.g. principal + teacher) sees the dashboard for the role
   * they are ACTING as rather than the widest union of their roles. Scope is
   * derived from `actor.roles`, so narrowing here re-scopes every metric at once.
   *
   * Safe by construction: it only ever narrows. An absent header, an unknown
   * value, or a role the user does not actually hold leaves the full role set
   * standing — it can never grant a scope the caller lacks. The `@Roles` guards
   * still authorize on the real (un-narrowed) request, so this never causes a 403.
   */
  private acting(
    actor: AuthenticatedUser,
    activeRole?: string,
  ): AuthenticatedUser {
    if (!activeRole) return actor;
    const held = actor.roles.find((r) => r.slug === activeRole);
    return held ? { ...actor, roles: [held] } : actor;
  }

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
    @Headers('x-active-role') activeRole?: string,
  ): Promise<OverviewDto> {
    return this.service.overview(this.acting(actor, activeRole), {
      period: query.period,
      from: query.from,
      to: query.to,
      compare: query.compare,
      halaqaId: query.halaqa_id,
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
    @Headers('x-active-role') activeRole?: string,
  ): Promise<TopStudentsDto> {
    return this.service.topStudents(this.acting(actor, activeRole), {
      period: query.period,
      from: query.from,
      to: query.to,
      track: query.track,
      limit: query.limit,
      halaqaId: query.halaqa_id,
    });
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
    @Headers('x-active-role') activeRole?: string,
  ): Promise<HalaqatPerformanceDto> {
    return this.service.halaqatPerformance(this.acting(actor, activeRole), {
      period: query.period,
      from: query.from,
      to: query.to,
      halaqaId: query.halaqa_id,
    });
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
    @Headers('x-active-role') activeRole?: string,
  ): Promise<AlertsDto> {
    return this.service.alerts(this.acting(actor, activeRole), {
      period: query.period,
      from: query.from,
      to: query.to,
      stalledDays: query.stalled_days,
      absenceThreshold: query.absence_threshold,
      halaqaId: query.halaqa_id,
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
    @Headers('x-active-role') activeRole?: string,
  ): Promise<TeachersCommitmentDto> {
    return this.service.teacherCommitment(this.acting(actor, activeRole), {
      period: query.period,
      from: query.from,
      to: query.to,
      halaqaId: query.halaqa_id,
    });
  }
}
