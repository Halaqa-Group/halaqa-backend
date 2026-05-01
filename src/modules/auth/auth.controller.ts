import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AuthSuccessEnvelope, ErrorEnvelope } from './dto/auth.responses';
import { LoginDto } from './dto/login.dto';
import { buildRequestContext } from './request-context';
import { AuthService } from './services/auth.service';
import { REFRESH_COOKIE_NAME, TokenService } from './services/token.service';

interface RequestWithCookies extends Request {
  cookies: Record<string, string | undefined>;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tokens: TokenService,
  ) {}

  @Public()
  @HttpCode(200)
  @Post('login')
  @ApiOperation({
    summary: 'Log in with email and password',
    description:
      'On success, returns an access token and the user view, and sets the `refresh_token` cookie ' +
      '(HttpOnly, SameSite=Strict, Path=`/auth`). All failure paths — bad password, unknown email, ' +
      'inactive account, rate-limited, lockout — return the same `401 Invalid credentials` shape.',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, type: AuthSuccessEnvelope })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials',
    type: ErrorEnvelope,
  })
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
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Rotate the refresh cookie and mint a new access token',
    description:
      'Reads the `refresh_token` cookie. Replaying a rotated/revoked token revokes the entire token family ' +
      'and returns 401 (BR-AUTH-07).',
  })
  @ApiResponse({ status: 200, type: AuthSuccessEnvelope })
  @ApiResponse({
    status: 401,
    description: 'Missing, expired, or revoked refresh cookie',
    type: ErrorEnvelope,
  })
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
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Revoke the current refresh cookie',
    description:
      'Idempotent — clears the cookie either way and never reveals whether the token was valid.',
  })
  @ApiResponse({ status: 204, description: 'Logged out (no body)' })
  async logout(
    @Req() req: RequestWithCookies,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.authService.logout(req.cookies?.[REFRESH_COOKIE_NAME]);
    this.tokens.clearRefreshCookie(res);
  }

  @HttpCode(204)
  @Post('logout-all')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Revoke every refresh token for the caller',
    description:
      'Kills every device session for the authenticated user. Existing access tokens still work ' +
      'until they expire (15 min); see BR-USR-07 for cut-on-next-request via `tokenVersion`.',
  })
  @ApiResponse({ status: 204, description: 'All sessions revoked (no body)' })
  @ApiResponse({ status: 401, type: ErrorEnvelope })
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.authService.logoutAll(user.id);
    this.tokens.clearRefreshCookie(res);
  }
}
