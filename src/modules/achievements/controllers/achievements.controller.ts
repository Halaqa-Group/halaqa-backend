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
import { AchievementTestPositionDto } from '../dto/achievement-test-position.dto';
import { CreateAchievementDto } from '../dto/create-achievement.dto';
import { ListAchievementsQuery } from '../dto/list-achievements.query';
import { PositionErrorDto } from '../dto/position-error.dto';
import { UpdateAchievementDto } from '../dto/update-achievement.dto';
import {
  AchievementDto,
  AchievementListData,
} from '../mappers/achievement.dto';
import type {
  PositionErrorInput,
  PositionInput,
} from '../services/achievements.service';
import { AchievementsService } from '../services/achievements.service';

/** Maps a snake_case error DTO to the service's camelCase shape. */
function mapErrorDto(e: PositionErrorDto): PositionErrorInput {
  return {
    errorType: e.error_type,
    startWordId: e.start_word_id,
    endWordId: e.end_word_id,
    surah: e.surah,
    ayah: e.ayah,
    juz: e.juz,
    hizb: e.hizb,
  };
}

/** Maps a snake_case position DTO to the service's camelCase shape. */
function mapPositionDto(p: AchievementTestPositionDto): PositionInput {
  return {
    startSurah: p.start_surah,
    startVerse: p.start_verse,
    endSurah: p.end_surah,
    endVerse: p.end_verse,
    pages: p.pages,
    errors: p.errors?.map(mapErrorDto),
  };
}

@ApiTags('Achievements')
@ApiBearerAuth('access-token')
@Controller('achievements')
export class AchievementsController {
  constructor(private readonly service: AchievementsService) {}

  // ─── Create ───────────────────────────────────────────────────────────────

  @Post()
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher')
  @ApiOperation({
    summary: 'Record an achievement',
    description:
      'Records a Quran recitation achievement for a student. ' +
      '`percentage_score` is computed on the frontend (from raw counts and the halaqa evaluation settings) and stored as-is. ' +
      '`total_pages` is optional — omit it and the backend derives it from the verse range. ' +
      'For a quick review evaluation, send `recitation_method: "untracked"` with aggregate `error_counts` and no positions. ' +
      'Pass `approve: true` to approve in the same request — caller must have halaqa scope (403 if not, never silently skipped). ' +
      'If the student is absent the request is rejected (400).',
  })
  @ApiBody({ type: CreateAchievementDto })
  @ApiResponse({ status: 201, type: AchievementDto })
  @ApiResponse({
    status: 400,
    description: 'Validation error, invalid verse range, or student absent.',
  })
  @ApiResponse({
    status: 403,
    description: 'No halaqa scope.',
  })
  @ApiResponse({ status: 404, description: 'Not found or out of scope.' })
  async create(
    @Body() dto: CreateAchievementDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<AchievementDto> {
    const achievement = await this.service.create(
      {
        studentId: dto.student_id,
        halaqaId: dto.halaqa_id,
        date: dto.date,
        trackType: dto.track_type,
        completionMethod: dto.completion_method,
        recitationMethod: dto.recitation_method,
        testPositions: dto.test_positions?.map(mapPositionDto),
        startSurah: dto.start_surah,
        startVerse: dto.start_verse,
        endSurah: dto.end_surah,
        endVerse: dto.end_verse,
        errors: dto.errors?.map(mapErrorDto),
        errorCounts: dto.error_counts,
        percentageScore: dto.percentage_score,
        totalPages: dto.total_pages,
        teacherNotes: dto.teacher_notes,
        approve: dto.approve,
      },
      actor,
    );

    const userIds = [achievement.recordedBy, achievement.approvedBy].filter(
      Boolean,
    ) as number[];
    const userMap = await this.service.resolveUserNames(
      userIds,
      actor.schoolId,
    );
    const positions = await this.service.resolvePositions([achievement.id]);
    const studentMap = await this.service.resolveStudentNames(
      [achievement.studentId],
      actor.schoolId,
    );
    return AchievementDto.fromEntity(
      achievement,
      userMap,
      positions.get(achievement.id),
      studentMap,
    );
  }

  // ─── List ─────────────────────────────────────────────────────────────────

  @Get()
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher', 'parent')
  @ApiOperation({
    summary: 'List achievements (role-scoped)',
    description:
      'Returns a paginated list of achievements visible to the caller.\n' +
      '- **principal / vice_principal**: all achievements in the school.\n' +
      '- **supervisor**: achievements for halaqat they supervise.\n' +
      '- **teacher**: achievements for halaqat they are assigned to.\n' +
      '- **parent**: achievements for their linked students only (read-only, full detail).',
  })
  @ApiResponse({ status: 200, type: AchievementListData })
  async findAll(
    @Query() query: ListAchievementsQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<AchievementListData> {
    const result = await this.service.findAll(
      {
        studentId: query.student_id,
        halaqaId: query.halaqa_id,
        date: query.date,
        trackType: query.track_type,
        status: query.status,
        recordedBy: query.recorded_by,
        approvedBy: query.approved_by,
        page: query.page,
        limit: query.limit,
      },
      actor,
    );

    const userIds = new Set<number>();
    for (const a of result.items) {
      userIds.add(a.recordedBy);
      if (a.approvedBy) userIds.add(a.approvedBy);
    }
    const userMap = await this.service.resolveUserNames(
      [...userIds],
      actor.schoolId,
    );
    const positions = await this.service.resolvePositions(
      result.items.map((a) => a.id),
    );
    const studentMap = await this.service.resolveStudentNames(
      result.items.map((a) => a.studentId),
      actor.schoolId,
    );

    return {
      items: result.items.map((a) =>
        AchievementDto.fromEntity(a, userMap, positions.get(a.id), studentMap),
      ),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  // ─── Find one ─────────────────────────────────────────────────────────────

  @Get(':id')
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher', 'parent')
  @ApiOperation({
    summary: 'Get achievement detail',
    description:
      'Returns a single achievement with its recitation positions and itemized errors. ' +
      'Out-of-scope or cross-school access returns 404 (never 403). ' +
      'All roles that can read the achievement (including **parent**) receive the full payload.',
  })
  @ApiParam({ name: 'id', description: 'Achievement ID' })
  @ApiResponse({ status: 200, type: AchievementDto })
  @ApiResponse({ status: 404, description: 'Not found or out of scope.' })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<AchievementDto> {
    const achievement = await this.service.findOne(id, actor);
    const userIds = [achievement.recordedBy, achievement.approvedBy].filter(
      Boolean,
    ) as number[];
    const userMap = await this.service.resolveUserNames(
      userIds,
      actor.schoolId,
    );
    const positions = await this.service.resolvePositions([achievement.id]);
    const studentMap = await this.service.resolveStudentNames(
      [achievement.studentId],
      actor.schoolId,
    );
    return AchievementDto.fromEntity(
      achievement,
      userMap,
      positions.get(achievement.id),
      studentMap,
    );
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  @Patch(':id')
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher')
  @ApiOperation({
    summary: 'Update an achievement',
    description:
      'Updates mutable fields on an **unapproved** achievement. ' +
      'Returns 400 if the achievement is approved (unapprove it first). ' +
      '`percentage_score` is updated only when the client sends it (recomputed on the frontend). ' +
      'If surah/verse fields change, the range is re-validated.',
  })
  @ApiParam({ name: 'id', description: 'Achievement ID' })
  @ApiBody({ type: UpdateAchievementDto })
  @ApiResponse({ status: 200, type: AchievementDto })
  @ApiResponse({
    status: 400,
    description: 'Achievement is approved, or invalid verse range.',
  })
  @ApiResponse({ status: 404, description: 'Not found or no halaqa scope.' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAchievementDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<AchievementDto> {
    const achievement = await this.service.update(
      id,
      {
        trackType: dto.track_type,
        completionMethod: dto.completion_method,
        recitationMethod: dto.recitation_method,
        testPositions: dto.test_positions?.map(mapPositionDto),
        startSurah: dto.start_surah,
        startVerse: dto.start_verse,
        endSurah: dto.end_surah,
        endVerse: dto.end_verse,
        errors: dto.errors?.map(mapErrorDto),
        errorCounts: dto.error_counts,
        percentageScore: dto.percentage_score,
        totalPages: dto.total_pages,
        teacherNotes: dto.teacher_notes,
      },
      actor,
    );

    const userIds = [achievement.recordedBy, achievement.approvedBy].filter(
      Boolean,
    ) as number[];
    const userMap = await this.service.resolveUserNames(
      userIds,
      actor.schoolId,
    );
    const positions = await this.service.resolvePositions([achievement.id]);
    const studentMap = await this.service.resolveStudentNames(
      [achievement.studentId],
      actor.schoolId,
    );
    return AchievementDto.fromEntity(
      achievement,
      userMap,
      positions.get(achievement.id),
      studentMap,
    );
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  @Delete(':id')
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete (soft-delete) an achievement',
    description:
      'Soft-deletes an achievement.\n' +
      '- **Unapproved**: any role with halaqa scope can delete.\n' +
      '- **Approved**: principal only (VP and teachers are rejected with 403).\n' +
      'If the deleted achievement was approved, plan item reconciliation runs automatically.',
  })
  @ApiParam({ name: 'id', description: 'Achievement ID' })
  @ApiResponse({ status: 200, type: ApiMessage })
  @ApiResponse({
    status: 403,
    description: 'Approved achievement — principal only.',
  })
  @ApiResponse({ status: 404, description: 'Not found or no halaqa scope.' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ApiMessage> {
    await this.service.softDelete(id, actor);
    return new ApiMessage('Achievement deleted.');
  }

  // ─── Approve ──────────────────────────────────────────────────────────────

  @Post(':id/approve')
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve an achievement',
    description:
      'Marks the achievement as approved. ' +
      'Caller must be: principal, VP, supervisor in scope, or any teacher assigned to the halaqa. ' +
      'Returns 400 if already approved. ' +
      'Triggers plan item reconciliation.',
  })
  @ApiParam({ name: 'id', description: 'Achievement ID' })
  @ApiResponse({ status: 200, type: AchievementDto })
  @ApiResponse({ status: 400, description: 'Already approved.' })
  @ApiResponse({
    status: 403,
    description: 'No halaqa scope.',
  })
  @ApiResponse({ status: 404, description: 'Not found.' })
  async approve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<AchievementDto> {
    const achievement = await this.service.approve(id, actor);
    const userIds = [achievement.recordedBy, achievement.approvedBy].filter(
      Boolean,
    ) as number[];
    const userMap = await this.service.resolveUserNames(
      userIds,
      actor.schoolId,
    );
    const positions = await this.service.resolvePositions([achievement.id]);
    const studentMap = await this.service.resolveStudentNames(
      [achievement.studentId],
      actor.schoolId,
    );
    return AchievementDto.fromEntity(
      achievement,
      userMap,
      positions.get(achievement.id),
      studentMap,
    );
  }

  // ─── Unapprove ────────────────────────────────────────────────────────────

  @Post(':id/unapprove')
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Unapprove an achievement',
    description:
      'Reverts an approved achievement back to unapproved. ' +
      'Caller must be principal, VP, supervisor in scope, or any teacher assigned to the halaqa. ' +
      '`approved_by` and `approved_at` are preserved for audit purposes (status only is flipped). ' +
      'Returns 400 if not currently approved. ' +
      'Triggers plan item reconciliation.',
  })
  @ApiParam({ name: 'id', description: 'Achievement ID' })
  @ApiResponse({ status: 200, type: AchievementDto })
  @ApiResponse({ status: 400, description: 'Not currently approved.' })
  @ApiResponse({ status: 403, description: 'No halaqa scope.' })
  @ApiResponse({ status: 404, description: 'Not found.' })
  async unapprove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<AchievementDto> {
    const achievement = await this.service.unapprove(id, actor);
    const userIds = [achievement.recordedBy, achievement.approvedBy].filter(
      Boolean,
    ) as number[];
    const userMap = await this.service.resolveUserNames(
      userIds,
      actor.schoolId,
    );
    const positions = await this.service.resolvePositions([achievement.id]);
    const studentMap = await this.service.resolveStudentNames(
      [achievement.studentId],
      actor.schoolId,
    );
    return AchievementDto.fromEntity(
      achievement,
      userMap,
      positions.get(achievement.id),
      studentMap,
    );
  }
}
