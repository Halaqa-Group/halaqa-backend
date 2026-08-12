import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
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
import { CreateWeeklyPlanItemDto } from '../dto/create-weekly-plan-item.dto';
import { UpdateWeeklyPlanItemDto } from '../dto/update-weekly-plan-item.dto';
import { WeeklyPlanItemDto } from '../mappers/plan-item.dto';
import { PlanItemLinksData, PlanLinkDto } from '../mappers/plan-link.dto';
import { PlanItemsService } from '../services/plan-items.service';
import { WeeklyPlansService } from '../services/weekly-plans.service';

@ApiTags('Plan Items')
@ApiBearerAuth('access-token')
@Controller()
export class PlanItemsController {
  constructor(
    private readonly service: PlanItemsService,
    // Link reads reuse the plan's read-scope rules (parents included).
    private readonly plans: WeeklyPlansService,
  ) {}

  // ─── Settlement links ─────────────────────────────────────────────────────

  @Get('weekly-plan-items/:id/links')
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher', 'parent')
  @ApiOperation({
    summary: "Get one item's achievement links",
    description:
      'Returns the **stored** settlement rows credited to this plan item — which ' +
      'approved achievement covered which verse span of it. Written solely by ' +
      'reconciliation; a client must never infer the linkage by comparing ranges. ' +
      '`links[].credited_verses` always sums to `achieved_verses`, so an item ' +
      'showing 0 achieved returns an empty list by construction.\n\n' +
      'Spans recited outside every item of the week are **not** here — they carry ' +
      'no item and are returned by `GET /weekly-plans/:id/links` under ' +
      '`outside_plan`.',
  })
  @ApiParam({ name: 'id', description: 'Plan item ID' })
  @ApiResponse({ status: 200, type: PlanItemLinksData })
  @ApiResponse({ status: 404, description: 'Item not found or out of scope.' })
  async findLinks(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<PlanItemLinksData> {
    const { item, links, achievements } = await this.plans.findItemLinks(
      id,
      actor,
    );
    return PlanItemLinksData.fromEntity(
      item,
      links.map((l) =>
        PlanLinkDto.fromEntity(l, achievements.get(l.achievementId)),
      ),
    );
  }

  // ─── Add item to plan ─────────────────────────────────────────────────────

  @Post('weekly-plans/:planId/items')
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher')
  @ApiOperation({
    summary: 'Add an item to a weekly plan',
    description:
      'Adds a new item to a **draft** plan. Returns 400 if the plan is approved (unapprove it first). ' +
      'Caller must be principal, VP, supervisor in scope, or any teacher assigned to the halaqa.',
  })
  @ApiParam({ name: 'planId', description: 'Weekly plan ID' })
  @ApiBody({ type: CreateWeeklyPlanItemDto })
  @ApiResponse({ status: 201, type: WeeklyPlanItemDto })
  @ApiResponse({
    status: 400,
    description: 'Plan is approved, or invalid verse range.',
  })
  @ApiResponse({ status: 403, description: 'No halaqa scope.' })
  @ApiResponse({ status: 404, description: 'Plan not found.' })
  async addItem(
    @Param('planId', ParseIntPipe) planId: number,
    @Body() dto: CreateWeeklyPlanItemDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<WeeklyPlanItemDto> {
    const item = await this.service.addItem(
      planId,
      {
        trackType: dto.track_type,
        dayOfWeek: dto.day_of_week,
        order: dto.order,
        startSurah: dto.start_surah,
        startVerse: dto.start_verse,
        endSurah: dto.end_surah,
        endVerse: dto.end_verse,
      },
      actor,
    );
    return WeeklyPlanItemDto.fromEntity(item);
  }

  // ─── Delete item ──────────────────────────────────────────────────────────

  @Delete('weekly-plan-items/:id')
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a plan item',
    description:
      'Hard-deletes a plan item. Returns 400 if the plan is approved (unapprove first). ' +
      'Caller must have halaqa scope (any assigned teacher, supervisor in scope, VP, or principal).',
  })
  @ApiParam({ name: 'id', description: 'Plan item ID' })
  @ApiResponse({ status: 200, type: ApiMessage })
  @ApiResponse({ status: 400, description: 'Plan is approved.' })
  @ApiResponse({ status: 403, description: 'No halaqa scope.' })
  @ApiResponse({ status: 404, description: 'Item not found or out of scope.' })
  async deleteItem(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ApiMessage> {
    await this.service.deleteItem(id, actor);
    return new ApiMessage('Plan item deleted.');
  }

  // ─── Update item ──────────────────────────────────────────────────────────

  @Patch('weekly-plan-items/:id')
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher')
  @ApiOperation({
    summary: 'Edit a plan item range',
    description:
      "Updates a plan item's range, track type, or day. " +
      'Range edits are allowed even on **approved** plans (no unapprove required). ' +
      'Changing any range field (`start_surah`, `start_verse`, `end_surah`, `end_verse`) sets `is_manual_override = true` ' +
      'permanently, recomputes `total_verses`, and re-runs reconciliation. ' +
      'Caller must have halaqa scope (any assigned teacher, supervisor in scope, VP, or principal).',
  })
  @ApiParam({ name: 'id', description: 'Plan item ID' })
  @ApiBody({ type: UpdateWeeklyPlanItemDto })
  @ApiResponse({ status: 200, type: WeeklyPlanItemDto })
  @ApiResponse({ status: 400, description: 'Invalid verse range.' })
  @ApiResponse({ status: 403, description: 'No halaqa scope.' })
  @ApiResponse({ status: 404, description: 'Item not found or out of scope.' })
  async updateItem(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWeeklyPlanItemDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<WeeklyPlanItemDto> {
    const item = await this.service.updateItem(
      id,
      {
        trackType: dto.track_type,
        dayOfWeek: dto.day_of_week,
        order: dto.order,
        startSurah: dto.start_surah,
        startVerse: dto.start_verse,
        endSurah: dto.end_surah,
        endVerse: dto.end_verse,
      },
      actor,
    );
    return WeeklyPlanItemDto.fromEntity(item);
  }
}
