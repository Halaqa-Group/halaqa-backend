import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiMessage } from '../../../common/api-message';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { CreateHalaqaDto } from '../dto/create-halaqa.dto';
import { ListHalaqatQuery } from '../dto/list-halaqat.query';
import { UpdateHalaqaDto } from '../dto/update-halaqa.dto';
import {
  HalaqaAccessGuard,
  HalaqaEditAccessGuard,
  RequiresHalaqaPermission,
} from '../guards/halaqa-scope.guard';
import { HalaqatService } from '../services/halaqat.service';

@ApiTags('Halaqat')
@ApiBearerAuth('access-token')
@Controller('halaqat')
export class HalaqatController {
  constructor(private readonly service: HalaqatService) {}

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  @Post()
  @Roles('principal', 'vice_principal')
  @ApiOperation({
    summary: 'Create a halaqa',
    description:
      "Creates a new halaqa in the caller's school. " +
      'Optionally assigns a primary (main) teacher and initial weekly schedule in the same transaction. ' +
      'Runs a schedule conflict check (BR-HLQ-02) if both primary_teacher_user_id and schedule slots are provided.',
  })
  @ApiBody({ type: CreateHalaqaDto })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 400 })
  @ApiResponse({
    status: 404,
    description: 'primary_teacher_user_id not found in this school',
  })
  @ApiResponse({ status: 409, description: 'Schedule conflict' })
  create(
    @Body() dto: CreateHalaqaDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.create(dto, actor);
  }

  @Get()
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher')
  @ApiOperation({
    summary: 'List halaqat (role-scoped)',
    description:
      'Returns a paginated list of halaqat visible to the caller.\n' +
      '- **principal / vice_principal**: all halaqat in the school.\n' +
      '- **supervisor**: only halaqat they supervise.\n' +
      '- **teacher**: only halaqat where they have an active assignment.\n' +
      '- **parent**: no access (403).',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['Memorization', 'Tajweed', 'Aqeedah'],
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['active', 'archived', 'completed'],
  })
  @ApiQuery({ name: 'supervisor_user_id', required: false })
  @ApiQuery({ name: 'teacher_user_id', required: false })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Substring match on name',
  })
  @ApiResponse({ status: 200 })
  list(
    @Query() query: ListHalaqatQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.findAll(query, actor);
  }

  @Get(':id')
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher')
  @UseGuards(HalaqaAccessGuard)
  @RequiresHalaqaPermission('read')
  @ApiOperation({
    summary: 'Get halaqa detail',
    description:
      'Returns the full halaqa record with schedule, active teachers, supervisors, and student count. ' +
      'Out-of-scope or cross-school access returns 404 (never 403) per BR-HLQ-01.',
  })
  @ApiParam({ name: 'id', description: 'Halaqa ID' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'Not found or out of scope' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.findOne(id, actor);
  }

  @Patch(':id')
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher')
  @UseGuards(HalaqaEditAccessGuard)
  @RequiresHalaqaPermission('write')
  @ApiOperation({
    summary: 'Update halaqa fields',
    description:
      'Updates name, type, and/or evaluation_settings. ' +
      'Changing type requires principal/vice_principal; all other fields accept supervisor or active teacher. ' +
      'Status changes go through /archive, /complete, or /restore instead.',
  })
  @ApiParam({ name: 'id', description: 'Halaqa ID' })
  @ApiBody({ type: UpdateHalaqaDto })
  @ApiResponse({ status: 200, description: 'Same shape as GET /halaqat/:id' })
  @ApiResponse({
    status: 403,
    description: 'type field requires principal/vice_principal',
  })
  @ApiResponse({ status: 404, description: 'Not found or out of scope' })
  @ApiResponse({
    status: 409,
    description: 'Type change would violate BR-HLQ-03',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateHalaqaDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.update(id, dto, actor);
  }

  // ─── Lifecycle transitions ─────────────────────────────────────────────────

  @Post(':id/archive')
  @Roles('principal', 'vice_principal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Archive a halaqa (soft-delete)',
    description:
      'Sets status=archived, deleted_at=now. ' +
      'Ends all active teacher assignments and sets active student enrollments to archived. ' +
      'Refuses if any student is status=active (BR-HLQ-10).',
  })
  @ApiParam({ name: 'id', description: 'Halaqa ID' })
  @ApiResponse({ status: 200, type: ApiMessage })
  @ApiResponse({
    status: 409,
    description: 'Has active students, or already archived',
  })
  @ApiResponse({ status: 404 })
  archive(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.archive(id, actor);
  }

  @Post(':id/complete')
  @Roles('principal', 'vice_principal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark a halaqa as completed',
    description:
      'Sets status=completed. Ends all active teacher assignments and marks active student enrollments as completed.',
  })
  @ApiParam({ name: 'id', description: 'Halaqa ID' })
  @ApiResponse({ status: 200, type: ApiMessage })
  @ApiResponse({ status: 409, description: 'Halaqa is not active' })
  @ApiResponse({ status: 404 })
  complete(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.complete(id, actor);
  }

  @Post(':id/restore')
  @Roles('principal', 'vice_principal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restore an archived halaqa',
    description:
      'Sets status=active, clears deleted_at. Only works on archived halaqat. ' +
      'Does not restore teacher assignments or student enrollments.',
  })
  @ApiParam({ name: 'id', description: 'Halaqa ID' })
  @ApiResponse({ status: 200, type: ApiMessage })
  @ApiResponse({ status: 404, description: 'Not found or not archived' })
  restore(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.restore(id, actor);
  }
}
