import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { SchoolResponse } from './dto/school.responses';
import { UpdateSchoolDto } from './dto/update-school.dto';
import { SchoolService } from './school.service';

@ApiTags('School')
@ApiBearerAuth('access-token')
@Controller('school')
export class SchoolController {
  constructor(private readonly service: SchoolService) {}

  @Get()
  @Roles('principal', 'vice_principal')
  @ApiOperation({
    summary: "Get the caller's own school profile",
    description:
      'Always resolved from the access token — there is no school id parameter, ' +
      'so a caller can never read another tenant.',
  })
  @ApiResponse({ status: 200, type: SchoolResponse })
  async get(@CurrentUser() actor: AuthenticatedUser): Promise<SchoolResponse> {
    const school = await this.service.findForActor(actor.schoolId);
    return SchoolResponse.fromEntity(school);
  }

  @Patch()
  @Roles('principal')
  @ApiOperation({
    summary: "Update the caller's own school profile",
    description:
      'Principal only. Partial update — omitted fields are left untouched. ' +
      'Blank `address` / `phone` are stored as null.',
  })
  @ApiResponse({ status: 200, type: SchoolResponse })
  @ApiResponse({ status: 403, description: 'Caller is not a principal.' })
  async update(
    @Body() dto: UpdateSchoolDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<SchoolResponse> {
    const school = await this.service.update(dto, actor);
    return SchoolResponse.fromEntity(school);
  }
}
