import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ApiMessage } from '../../common/api-message';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { UsersService } from '../users/users.service';
import {
  AuthSuccessEnvelope,
  ErrorEnvelope,
  MeEnvelope,
  MessageEnvelope,
  ValidateResetTokenEnvelope,
} from './dto/auth.responses';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { buildRequestContext } from './request-context';
import { AuthService } from './services/auth.service';
import { PasswordResetService } from './services/password-reset.service';
import { REFRESH_COOKIE_NAME, TokenService } from './services/token.service';

interface RequestWithCookies extends Request {
  cookies: Record<string, string | undefined>;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordReset: PasswordResetService,
    private readonly tokens: TokenService,
    private readonly users: UsersService,
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

  @Public()
  @HttpCode(200)
  @Post('forgot-password')
  @ApiOperation({
    summary: 'Request a password-reset email',
    description:
      'Always returns 200 with the same message regardless of whether the email exists — never reveals ' +
      'membership. The reset token is one-time, valid for 1 hour.',
  })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({ status: 200, type: MessageEnvelope })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Req() req: Request,
  ): Promise<ApiMessage> {
    const ctx = buildRequestContext(req);
    await this.passwordReset.requestReset(dto.email, ctx.ip);
    return new ApiMessage('A reset link has been sent.');
  }

  @Public()
  @Get('validate-reset-token')
  @ApiOperation({
    summary: 'Check whether a reset token is currently usable',
    description:
      'Read-only — does not consume the token, bump tokenVersion, or revoke anything. Used by the reset-password page ' +
      'to render the email and gate the form.',
  })
  @ApiQuery({ name: 'token', required: true })
  @ApiResponse({ status: 200, type: ValidateResetTokenEnvelope })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired token',
    type: ErrorEnvelope,
  })
  async validateResetToken(@Query('token') token: string) {
    return this.passwordReset.validateResetToken(token);
  }

  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get the authenticated user',
    description:
      'Authorization is role-based — the response carries a flat `roles` slug array and intentionally ' +
      'no `permissions` field.',
  })
  @ApiResponse({ status: 200, type: MeEnvelope })
  @ApiResponse({ status: 401, type: ErrorEnvelope })
  async me(@CurrentUser() actor: AuthenticatedUser) {
    const view = await this.users.findOne(actor.id, actor.schoolId);
    return {
      id: view.id,
      name: view.name,
      email: view.email,
      phone: view.phone,
      roles: view.roles,
    };
  }

  @Public()
  @HttpCode(200)
  @Post('reset-password')
  @ApiOperation({
    summary: 'Consume a reset token and set a new password',
    description:
      '`password` and `password_confirmation` must match (validated before any DB work). On success: bumps ' +
      '`tokenVersion`, revokes every active refresh token (`password_change`), and marks the reset token used.',
  })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({ status: 200, type: MessageEnvelope })
  @ApiResponse({
    status: 400,
    description: 'Invalid token or password mismatch',
    type: ErrorEnvelope,
  })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<ApiMessage> {
    await this.passwordReset.consumeResetToken(dto);
    return new ApiMessage('Password has been reset successfully');
  }
}
