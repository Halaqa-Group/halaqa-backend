import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotImplementedException,
  Param,
  ParseIntPipe,
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
import { ApiMessage } from '../../../common/api-message';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { CreateWeeklyPlanDto } from '../dto/create-weekly-plan.dto';
import {
  ListWeeklyPlansQuery,
  WeeklyPlanIncludeQuery,
} from '../dto/list-weekly-plans.query';
import { WeeklyPlanDto, WeeklyPlanListData } from '../mappers/plan-item.dto';
import { PlanLinkDto, PlanLinksData } from '../mappers/plan-link.dto';
import { WeeklyPlansService } from '../services/weekly-plans.service';

@ApiTags('Weekly Plans')
@ApiBearerAuth('access-token')
@Controller('weekly-plans')
export class WeeklyPlansController {
  constructor(private readonly service: WeeklyPlansService) {}

  // ─── Generate (stub) ──────────────────────────────────────────────────────

  @Post('generate')
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher')
  @ApiOperation({
    summary: 'Auto-generate weekly plans [NOT IMPLEMENTED]',
    description:
      'Placeholder — returns 501. Auto-generation strategy is undecided. ' +
      'Use `POST /weekly-plans` to create plans manually.',
  })
  @ApiResponse({ status: 501, description: 'Not implemented.' })
  generate(): never {
    throw new NotImplementedException(
      'Auto-generation is not yet implemented. Create plans manually.',
    );
  }

  // ─── Create ───────────────────────────────────────────────────────────────

  @Post()
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher')
  @ApiOperation({
    summary: 'Create a weekly plan',
    description:
      'Creates a draft weekly plan with one or more items. ' +
      'Caller must be principal, VP, supervisor in scope, or any teacher assigned to the halaqa. ' +
      'Returns 409 if a plan already exists for the same student/halaqa/week.',
  })
  @ApiBody({ type: CreateWeeklyPlanDto })
  @ApiResponse({ status: 201, type: WeeklyPlanDto })
  @ApiResponse({
    status: 400,
    description: 'Validation error or invalid verse range.',
  })
  @ApiResponse({
    status: 403,
    description: 'No halaqa scope.',
  })
  @ApiResponse({
    status: 409,
    description: 'Plan already exists. Response includes existing_plan_id.',
  })
  async create(
    @Body() dto: CreateWeeklyPlanDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<WeeklyPlanDto> {
    const plan = await this.service.create(
      {
        studentId: dto.student_id,
        halaqaId: dto.halaqa_id,
        weekStartDate: dto.week_start_date,
        items: dto.items.map((item) => ({
          trackType: item.track_type,
          dayOfWeek: item.day_of_week,
          order: item.order,
          startSurah: item.start_surah,
          startVerse: item.start_verse,
          endSurah: item.end_surah,
          endVerse: item.end_verse,
        })),
      },
      actor,
    );
    return WeeklyPlanDto.fromEntity(plan);
  }

  // ─── List ─────────────────────────────────────────────────────────────────

  @Get()
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher', 'parent')
  @ApiOperation({
    summary: 'List weekly plans (role-scoped)',
    description:
      'Returns a paginated list of weekly plans visible to the caller.\n' +
      '- **principal / vice_principal**: all plans in the school.\n' +
      '- **supervisor**: plans for halaqat they supervise.\n' +
      '- **teacher**: plans for halaqat they are assigned to.\n' +
      '- **parent**: plans for their linked students only.\n\n' +
      'Pass `?include=links` to embed each plan’s stored settlement (`links` + ' +
      '`outside_plan`) — one extra query for the whole page, so a halaqa- or ' +
      'student-scoped week needs a single request. Costly on wide pages: narrow ' +
      'with `halaqa_id` / `student_id` / `week_start_date` before asking for it.',
  })
  @ApiResponse({ status: 200, type: WeeklyPlanListData })
  async findAll(
    @Query() query: ListWeeklyPlansQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<WeeklyPlanListData> {
    const withLinks = query.include === 'links';
    const result = await this.service.findAll(
      {
        studentId: query.student_id,
        halaqaId: query.halaqa_id,
        weekStartDate: query.week_start_date,
        status: query.status,
        page: query.page,
        limit: query.limit,
        includeLinks: withLinks,
      },
      actor,
    );

    const byPlan = new Map<number, PlanLinkDto[]>();
    for (const link of result.links) {
      const dto = PlanLinkDto.fromEntity(
        link,
        result.achievements.get(link.achievementId),
      );
      const list = byPlan.get(link.weeklyPlanId);
      if (list) list.push(dto);
      else byPlan.set(link.weeklyPlanId, [dto]);
    }

    return {
      // `?? []` and not `undefined`: a plan with no links still reports an empty
      // list, so the client can tell "none" from "not requested".
      items: result.items.map((plan) =>
        WeeklyPlanDto.fromEntity(
          plan,
          withLinks ? (byPlan.get(plan.id) ?? []) : undefined,
        ),
      ),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  // ─── Settlement links ─────────────────────────────────────────────────────

  @Get(':id/links')
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher', 'parent')
  @ApiOperation({
    summary: "Get the plan's achievement ↔ plan-item links",
    description:
      'Returns the **stored** settlement for the week: which approved achievement ' +
      'credited which verse span of which plan item, as materialized by ' +
      'reconciliation. Clients must render this, never infer a link by comparing ' +
      'an achievement range to an item range — reconciliation is week-scoped and ' +
      'consumption-ordered, so overlap alone does not imply a link.\n\n' +
      '- `links` — credited to an item; group by `weekly_plan_item_id`. ' +
      "Each item's rows sum to its `achieved_verses`.\n" +
      '- `outside_plan` — recited but planned by no item that week. Belongs to ' +
      'the week; do not render under an item.\n\n' +
      'Same visibility as `GET /weekly-plans/:id`.',
  })
  @ApiParam({ name: 'id', description: 'Weekly plan ID' })
  @ApiResponse({ status: 200, type: PlanLinksData })
  @ApiResponse({ status: 404, description: 'Not found or out of scope.' })
  async findLinks(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<PlanLinksData> {
    const { plan, links, achievements } = await this.service.findLinks(
      id,
      actor,
    );
    const mapped = links.map((l) =>
      PlanLinkDto.fromEntity(l, achievements.get(l.achievementId)),
    );
    return {
      weekly_plan_id: plan.id,
      links: mapped.filter((l) => l.weekly_plan_item_id !== null),
      outside_plan: mapped.filter((l) => l.weekly_plan_item_id === null),
    };
  }

  // ─── Find one ─────────────────────────────────────────────────────────────

  @Get(':id')
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher', 'parent')
  @ApiOperation({
    summary: 'Get weekly plan detail',
    description:
      'Returns the plan with all its items. ' +
      'Pass `?include=links` to embed its settlement (`links` + `outside_plan`) ' +
      'in the same response. ' +
      'Out-of-scope or cross-school access returns 404 (never 403).',
  })
  @ApiParam({ name: 'id', description: 'Weekly plan ID' })
  @ApiResponse({ status: 200, type: WeeklyPlanDto })
  @ApiResponse({ status: 404, description: 'Not found or out of scope.' })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: WeeklyPlanIncludeQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<WeeklyPlanDto> {
    if (query.include === 'links') {
      // findLinks already loads the plan with its items under the same scope check.
      const { plan, links, achievements } = await this.service.findLinks(
        id,
        actor,
      );
      return WeeklyPlanDto.fromEntity(
        plan,
        links.map((l) =>
          PlanLinkDto.fromEntity(l, achievements.get(l.achievementId)),
        ),
      );
    }
    const plan = await this.service.findOne(id, actor);
    return WeeklyPlanDto.fromEntity(plan);
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  @Delete(':id')
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete (permanently) a weekly plan',
    description:
      'Permanently deletes the plan and its items. ' +
      'Caller must be principal, VP, supervisor in scope, or any teacher assigned to the halaqa. ' +
      'This is a hard delete — the plan and its items are removed from the database and cannot be restored.',
  })
  @ApiParam({ name: 'id', description: 'Weekly plan ID' })
  @ApiResponse({ status: 200, type: ApiMessage })
  @ApiResponse({ status: 403, description: 'No halaqa scope.' })
  @ApiResponse({ status: 404, description: 'Not found.' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ApiMessage> {
    await this.service.hardDelete(id, actor);
    return new ApiMessage('Weekly plan deleted.');
  }

  // ─── Approve ──────────────────────────────────────────────────────────────

  @Post(':id/approve')
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve a weekly plan',
    description:
      'Locks the plan structure and runs reconciliation for every item. ' +
      'Caller must be principal, VP, supervisor in scope, or any teacher assigned to the halaqa. ' +
      'Returns 400 if already approved.',
  })
  @ApiParam({ name: 'id', description: 'Weekly plan ID' })
  @ApiResponse({ status: 200, type: WeeklyPlanDto })
  @ApiResponse({ status: 400, description: 'Already approved.' })
  @ApiResponse({ status: 403, description: 'No halaqa scope.' })
  @ApiResponse({ status: 404, description: 'Not found.' })
  async approve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<WeeklyPlanDto> {
    const plan = await this.service.approve(id, actor);
    return WeeklyPlanDto.fromEntity(plan);
  }

  // ─── Unapprove ────────────────────────────────────────────────────────────

  @Post(':id/unapprove')
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Unapprove a weekly plan',
    description:
      'Reverts the plan to draft status. ' +
      'Caller must be principal, VP, supervisor in scope, or any teacher assigned to the halaqa. ' +
      '`approved_by` is preserved for audit purposes. ' +
      'Returns 400 if not currently approved.',
  })
  @ApiParam({ name: 'id', description: 'Weekly plan ID' })
  @ApiResponse({ status: 200, type: WeeklyPlanDto })
  @ApiResponse({ status: 400, description: 'Not currently approved.' })
  @ApiResponse({ status: 403, description: 'No halaqa scope.' })
  @ApiResponse({ status: 404, description: 'Not found.' })
  async unapprove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<WeeklyPlanDto> {
    const plan = await this.service.unapprove(id, actor);
    return WeeklyPlanDto.fromEntity(plan);
  }
}
