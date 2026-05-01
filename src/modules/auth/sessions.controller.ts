import { Controller, Delete, Get, HttpCode, Param, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AuthService } from './services/auth.service';
import { REFRESH_COOKIE_NAME, TokenService } from './services/token.service';

interface RequestWithCookies extends Request {
  cookies: Record<string, string | undefined>;
}

@Controller('auth/sessions')
export class SessionsController {
  constructor(
    private readonly authService: AuthService,
    private readonly tokens: TokenService,
  ) {}

  @Get()
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
  async revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    await this.authService.revokeSession(user.id, id);
  }
}
