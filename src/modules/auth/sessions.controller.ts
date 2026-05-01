import { Controller, Delete, Get, HttpCode, Param, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ErrorEnvelope, SessionsEnvelope } from './dto/auth.responses';
import { AuthService } from './services/auth.service';
import { REFRESH_COOKIE_NAME, TokenService } from './services/token.service';

interface RequestWithCookies extends Request {
  cookies: Record<string, string | undefined>;
}

@ApiTags('Sessions')
@ApiBearerAuth('access-token')
@Controller('auth/sessions')
export class SessionsController {
  constructor(
    private readonly authService: AuthService,
    private readonly tokens: TokenService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List active sessions for the caller',
    description:
      'Returns one entry per active refresh token. The entry for the device that owns the current ' +
      'cookie is flagged with `current: true`.',
  })
  @ApiResponse({ status: 200, type: SessionsEnvelope })
  @ApiResponse({ status: 401, type: ErrorEnvelope })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestWithCookies,
  ) {
    const raw = req.cookies?.[REFRESH_COOKIE_NAME];
    const currentHash = raw ? this.tokens.hashRaw(raw) : null;
    return this.authService.listSessions(user.id, currentHash);
  }

  @HttpCode(204)
  @Delete(':id')
  @ApiOperation({
    summary: 'Revoke a specific device session',
    description:
      'Revokes the refresh token row identified by `id` if and only if it belongs to the caller. ' +
      'Cross-user requests return 404, never 403, so token IDs are not enumerable.',
  })
  @ApiParam({
    name: 'id',
    description: 'Refresh token row id (BIGINT as string)',
  })
  @ApiResponse({ status: 204, description: 'Session revoked (no body)' })
  @ApiResponse({
    status: 404,
    description: 'Session not found or not owned by caller',
    type: ErrorEnvelope,
  })
  async revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    await this.authService.revokeSession(user.id, id);
  }
}
