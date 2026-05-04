import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from './role.entity';
import { RoleListEnvelope, RoleResponse } from './dto/role.responses';

@ApiTags('Roles')
@ApiBearerAuth('access-token')
@Controller('roles')
export class RolesController {
  constructor(
    @InjectRepository(Role) private readonly roles: Repository<Role>,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List all roles',
    description:
      'Returns the seeded role catalog. Used by the user-management UI to populate role pickers ' +
      'and by anywhere that needs to map between numeric ids and slugs.',
  })
  @ApiResponse({ status: 200, type: RoleListEnvelope })
  async list(): Promise<RoleResponse[]> {
    const rows = await this.roles.find({ order: { level: 'DESC' } });
    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      nameAr: r.nameAr,
      nameEn: r.nameEn,
      level: r.level,
    }));
  }
}
