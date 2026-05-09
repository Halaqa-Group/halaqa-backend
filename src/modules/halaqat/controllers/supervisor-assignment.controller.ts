import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
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
import { AssignSupervisorDto } from '../dto/assign-supervisor.dto';
import { SupervisorSummaryResponse } from '../dto/halaqa.responses';
import { HalaqaAccessGuard, RequiresHalaqaPermission } from '../guards/halaqa-scope.guard';
import { SupervisorAssignmentService } from '../services/supervisor-assignment.service';

@ApiTags('Supervisor Assignments')
@ApiBearerAuth('access-token')
@Controller('halaqat/:id/supervisors')
export class SupervisorAssignmentController {
  constructor(private readonly service: SupervisorAssignmentService) {}

  @Post()
  @Roles('principal', 'vice_principal')
  @ApiOperation({
    summary: 'Assign a supervisor to a halaqa',
    description: 'User must hold the supervisor role in this school. Duplicate assignments are rejected.',
  })
  @ApiParam({ name: 'id', description: 'Halaqa ID' })
  @ApiBody({ type: AssignSupervisorDto })
  @ApiResponse({ status: 201, type: SupervisorSummaryResponse })
  @ApiResponse({ status: 404, description: 'Halaqa or supervisor not found in school' })
  @ApiResponse({ status: 409, description: 'Supervisor already assigned' })
  assign(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignSupervisorDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.assign(id, dto, actor);
  }

  @Get()
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher')
  @UseGuards(HalaqaAccessGuard)
  @RequiresHalaqaPermission('read')
  @ApiOperation({ summary: 'List supervisors assigned to a halaqa' })
  @ApiParam({ name: 'id', description: 'Halaqa ID' })
  @ApiResponse({ status: 200, type: [SupervisorSummaryResponse] })
  @ApiResponse({ status: 404, description: 'Halaqa not found or out of scope' })
  listSupervisors(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.listSupervisors(id, actor);
  }

  @Delete(':supervisorId')
  @Roles('principal', 'vice_principal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unassign a supervisor from a halaqa' })
  @ApiParam({ name: 'id', description: 'Halaqa ID' })
  @ApiParam({ name: 'supervisorId', description: 'Supervisor user ID' })
  @ApiResponse({ status: 200, type: ApiMessage })
  @ApiResponse({ status: 404, description: 'Halaqa or assignment not found' })
  unassign(
    @Param('id', ParseIntPipe) id: number,
    @Param('supervisorId', ParseIntPipe) supervisorId: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.unassign(id, supervisorId, actor);
  }
}
