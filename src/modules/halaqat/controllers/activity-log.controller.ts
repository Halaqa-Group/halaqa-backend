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
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { ListActivityQuery } from '../dto/list-activity.query';
import { ActivityLogData } from '../dto/halaqa.responses';
import {
  HalaqaAccessGuard,
  RequiresHalaqaPermission,
} from '../guards/halaqa-scope.guard';
import { HalaqaActivityLogService } from '../services/halaqa-activity-log.service';

@ApiTags('Activity Log')
@ApiBearerAuth('access-token')
@Controller('halaqat/:id/activity')
export class ActivityLogController {
  constructor(private readonly service: HalaqaActivityLogService) {}

  @Get()
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher')
  @UseGuards(HalaqaAccessGuard)
  @RequiresHalaqaPermission('read')
  @ApiOperation({
    summary: 'List activity log entries for a halaqa',
    description:
      'Returns a paginated, newest-first log of all events on this halaqa. Supports filtering by action type and date range.',
  })
  @ApiParam({ name: 'id', description: 'Halaqa ID' })
  @ApiResponse({ status: 200, type: ActivityLogData })
  @ApiResponse({ status: 404, description: 'Halaqa not found or out of scope' })
  list(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ListActivityQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.listForHalaqa(id, actor.schoolId, query);
  }
}
