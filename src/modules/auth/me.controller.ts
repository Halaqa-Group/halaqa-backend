import { Body, Controller, HttpCode, Patch, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiMessage } from '../../common/api-message';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ChangePasswordDto } from '../users/dto/change-password.dto';
import { UpdateMeDto } from '../users/dto/update-me.dto';
import { UserEnvelope } from '../users/dto/user.responses';
import { UsersService } from '../users/users.service';
import { ErrorEnvelope, MessageEnvelope } from './dto/auth.responses';
import { REFRESH_COOKIE_NAME, TokenService } from './services/token.service';

interface RequestWithCookies extends Request {
  cookies: Record<string, string | undefined>;
}

@ApiTags('Me')
@ApiBearerAuth('access-token')
@Controller('me')
export class MeController {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: TokenService,
  ) {}

  @Patch()
  @Audit('user.update_self')
  @ApiOperation({
    summary: 'Update own profile (name, phone, photo_url)',
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

  @Post('change-password')
  @HttpCode(200)
  @Audit('user.password.changed_by_self')
  @ApiOperation({
    summary: 'Change own password (BR-USR-05)',
    description:
      'Verifies the current password before applying. Revokes every other refresh token for the user ' +
      "(`password_change`); the caller's current refresh cookie keeps working so the active session is preserved.",
  })
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({ status: 200, type: MessageEnvelope })
  @ApiResponse({
    status: 401,
    description: 'Current password mismatch',
    type: ErrorEnvelope,
  })
  async changePassword(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: RequestWithCookies,
  ): Promise<ApiMessage> {
    const raw = req.cookies?.[REFRESH_COOKIE_NAME];
    const currentHash = raw ? this.tokens.hashRaw(raw) : null;
    await this.users.changePassword(actor.id, dto, currentHash);
    return new ApiMessage('Password updated');
  }
}
