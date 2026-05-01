import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { LoginDto } from './dto/login.dto';
import { buildRequestContext } from './request-context';
import { AuthService } from './services/auth.service';
import { REFRESH_COOKIE_NAME, TokenService } from './services/token.service';

interface RequestWithCookies extends Request {
  cookies: Record<string, string | undefined>;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tokens: TokenService,
  ) {}

  @Public()
  @HttpCode(200)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ctx = buildRequestContext(req);
    const result = await this.authService.login(dto, ctx);
    this.tokens.setRefreshCookie(res, result.rawRefresh);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  async refresh(
    @Req() req: RequestWithCookies,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!raw) {
      this.tokens.clearRefreshCookie(res);
      throw new UnauthorizedException();
    }
    try {
      const result = await this.authService.refresh(
        raw,
        buildRequestContext(req),
      );
      this.tokens.setRefreshCookie(res, result.rawRefresh);
      return { accessToken: result.accessToken, user: result.user };
    } catch (err) {
      this.tokens.clearRefreshCookie(res);
      throw err;
    }
  }

  @Public()
  @HttpCode(204)
  @Post('logout')
  async logout(
    @Req() req: RequestWithCookies,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.authService.logout(req.cookies?.[REFRESH_COOKIE_NAME]);
    this.tokens.clearRefreshCookie(res);
  }

  @HttpCode(204)
  @Post('logout-all')
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.authService.logoutAll(user.id);
    this.tokens.clearRefreshCookie(res);
  }
}
