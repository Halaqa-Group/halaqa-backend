import { Body, Controller, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { UpdateMeDto } from '../users/dto/update-me.dto';
import { UserEnvelope } from '../users/dto/user.responses';
import { UsersService } from '../users/users.service';
import { ErrorEnvelope } from './dto/auth.responses';

@ApiTags('Me')
@ApiBearerAuth('access-token')
@Controller('me')
export class MeController {
  constructor(private readonly users: UsersService) {}

  @Patch()
  @Audit('user.update_self')
  @ApiOperation({
    summary: 'Update own profile (name parts, phone, photo_url)',
    description:
      'Whitelist enforced via DTO + global `forbidNonWhitelisted` — sending `email`, `school_id`, ' +
      '`status`, or `roles` returns 400 (BR-USR-06).',
  })
  @ApiBody({ type: UpdateMeDto })
  @ApiResponse({ status: 200, type: UserEnvelope })
  @ApiResponse({
    status: 400,
    description: 'Disallowed field or validation failure',
    type: ErrorEnvelope,
  })
  update(@CurrentUser() actor: AuthenticatedUser, @Body() dto: UpdateMeDto) {
    return this.users.updateMe(actor.id, dto);
  }
}
