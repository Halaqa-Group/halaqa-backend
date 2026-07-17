import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorEnvelope } from '../../auth/dto/auth.responses';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { VerseRange } from '../../../quran/quran-bitmap';
import {
  EditMemorizationDto,
  MemorizationEnvelope,
  MemorizationRangeDto,
} from '../dto/memorization.dto';
import { StudentScopeGuard } from '../guards/student-scope.guard';
import { MemorizationService } from '../services/memorization.service';

function toRange(r: MemorizationRangeDto): VerseRange {
  return {
    startSurah: r.start_surah,
    startVerse: r.start_verse,
    endSurah: r.end_surah,
    endVerse: r.end_verse,
  };
}

@ApiTags('Students')
@ApiBearerAuth('access-token')
@Controller('students')
export class StudentMemorizationController {
  constructor(private readonly service: MemorizationService) {}

  @Get(':id/memorization')
  @UseGuards(StudentScopeGuard)
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher', 'parent')
  @ApiOperation({
    summary: "Get a student's memorized-ayat bitmap",
    description:
      'Returns the memorized-ayat count and the base64 bitmap (780 bytes, one bit per ayah in ' +
      'mushaf order). Out-of-scope or cross-school access returns 404.',
  })
  @ApiParam({ name: 'id', description: 'Student ID' })
  @ApiResponse({ status: 200, type: MemorizationEnvelope })
  @ApiResponse({
    status: 404,
    description: 'Student not found or out of scope',
    type: ErrorEnvelope,
  })
  get(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.get(id, actor);
  }

  @Put(':id/memorization')
  @UseGuards(StudentScopeGuard)
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher')
  @ApiOperation({
    summary: "Manually edit a student's memorized-ayat bitmap",
    description:
      'Applies `set` (mark memorized) then `clear` (unmark) ranges onto the current bitmap. ' +
      '**Note:** a later recompute (any Hifz achievement approve/unapprove/delete) rebuilds the ' +
      'bitmap from approved achievements and overwrites manual edits.',
  })
  @ApiParam({ name: 'id', description: 'Student ID' })
  @ApiResponse({ status: 200, type: MemorizationEnvelope })
  @ApiResponse({
    status: 400,
    description: 'No ranges provided, or invalid verse range',
    type: ErrorEnvelope,
  })
  @ApiResponse({
    status: 404,
    description: 'Student not found or out of scope',
    type: ErrorEnvelope,
  })
  edit(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EditMemorizationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.edit(id, actor, {
      set: dto.set?.map(toRange),
      clear: dto.clear?.map(toRange),
    });
  }
}
