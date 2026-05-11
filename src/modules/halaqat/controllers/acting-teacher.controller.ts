import {
  Body,
  Controller,
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
import { ActingSubstituteDto } from '../dto/acting-substitute.dto';
import { ExtendActingDto } from '../dto/extend-acting.dto';
import { ActingTeacherService } from '../services/acting-teacher.service';

@ApiTags('Acting Teacher')
@ApiBearerAuth('access-token')
@Controller('halaqat/:id/acting')
export class ActingTeacherController {
  constructor(private readonly service: ActingTeacherService) {}

  @Post('substitute')
  @Roles('principal', 'vice_principal')
  @ApiOperation({
    summary: 'Assign a substitute acting teacher (Workflow B)',
    description:
      'Brings in a teacher not yet assigned to this halaqa as an immediate acting primary. ' +
      'acting_starts_at must be <= today. Bypasses schedule conflict check (BR-HLQ-08).',
  })
  @ApiParam({ name: 'id', description: 'Halaqa ID' })
  @ApiBody({ type: ActingSubstituteDto })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 400, description: 'acting_starts_at is in the future' })
  @ApiResponse({ status: 404, description: 'Halaqa or teacher not found in school' })
  @ApiResponse({ status: 409, description: 'Teacher already assigned or another acting teacher exists' })
  substitute(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActingSubstituteDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.substitute(id, dto, actor);
  }

  @Patch('extend')
  @Roles('principal', 'vice_principal')
  @ApiOperation({
    summary: 'Extend the acting end date',
    description: 'Pushes acting_ends_at to a later date. New date must be after the current acting_ends_at.',
  })
  @ApiParam({ name: 'id', description: 'Halaqa ID' })
  @ApiBody({ type: ExtendActingDto })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 400, description: 'New date is not after current acting_ends_at' })
  @ApiResponse({ status: 404, description: 'Halaqa not found or no active acting teacher' })
  extend(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ExtendActingDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.extend(id, dto, actor);
  }

  @Post('end')
  @Roles('principal', 'vice_principal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'End the current acting period',
    description:
      'Clears acting fields on the current acting teacher. ' +
      'If the teacher is a substitute, also ends the assignment row (end_reason = reassigned).',
  })
  @ApiParam({ name: 'id', description: 'Halaqa ID' })
  @ApiResponse({ status: 200, type: ApiMessage })
  @ApiResponse({ status: 404, description: 'Halaqa not found or no active acting teacher' })
  endActing(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.endActing(id, actor);
  }
}
