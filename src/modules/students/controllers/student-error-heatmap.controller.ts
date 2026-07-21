import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
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
import {
  ErrorHeatmapEnvelope,
  ErrorHeatmapQuery,
} from '../dto/error-heatmap.dto';
import { StudentScopeGuard } from '../guards/student-scope.guard';
import { ErrorHeatmapService } from '../services/error-heatmap.service';

@ApiTags('Students')
@ApiBearerAuth('access-token')
@Controller('students')
export class StudentErrorHeatmapController {
  constructor(private readonly service: ErrorHeatmapService) {}

  @Get(':id/error-heatmap')
  @UseGuards(StudentScopeGuard)
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher')
  @ApiOperation({
    summary: "Get a student's error heatmap",
    description:
      "Aggregates the student's recitation errors by ayah over the last `days` days, returning the " +
      'worst ayat (most errors first) with per-type counts. Staff only — parents do not see error ' +
      'breakdowns. Out-of-scope or cross-school access returns 404.',
  })
  @ApiParam({ name: 'id', description: 'Student ID' })
  @ApiResponse({ status: 200, type: ErrorHeatmapEnvelope })
  @ApiResponse({
    status: 404,
    description: 'Student not found or out of scope',
    type: ErrorEnvelope,
  })
  get(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ErrorHeatmapQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.getHeatmap(id, actor.schoolId, query.days, query.limit);
  }
}
