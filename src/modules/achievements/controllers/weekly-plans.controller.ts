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
import { ListWeeklyPlansQuery } from '../dto/list-weekly-plans.query';
import { WeeklyPlanDto, WeeklyPlanListData } from '../mappers/plan-item.dto';
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
      '- **parent**: plans for their linked students only.',
  })
  @ApiResponse({ status: 200, type: WeeklyPlanListData })
  async findAll(
    @Query() query: ListWeeklyPlansQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<WeeklyPlanListData> {
    const result = await this.service.findAll(
      {
        studentId: query.student_id,
        halaqaId: query.halaqa_id,
        weekStartDate: query.week_start_date,
        status: query.status,
        page: query.page,
        limit: query.limit,
      },
      actor,
    );
    return {
      items: result.items.map(WeeklyPlanDto.fromEntity),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  // ─── Find one ─────────────────────────────────────────────────────────────

  @Get(':id')
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher', 'parent')
  @ApiOperation({
    summary: 'Get weekly plan detail',
    description:
      'Returns the plan with all its items. ' +
      'Out-of-scope or cross-school access returns 404 (never 403).',
  })
  @ApiParam({ name: 'id', description: 'Weekly plan ID' })
  @ApiResponse({ status: 200, type: WeeklyPlanDto })
  @ApiResponse({ status: 404, description: 'Not found or out of scope.' })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<WeeklyPlanDto> {
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
