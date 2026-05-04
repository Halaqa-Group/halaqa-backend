import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { LoginDto } from '../dto/login.dto';
import {
  LoginAttempt,
  LoginAttemptStatus,
} from '../entities/login-attempt.entity';
import { User } from '../../users/entities/user.entity';
import { RequestContext } from '../request-context';
import { RateLimitService } from './rate-limit.service';
import { TokenService } from './token.service';

export interface AuthUserView {
  id: number;
  name: string;
  email: string;
  roles: string[];
}

export interface AuthResult {
  accessToken: string;
  rawRefresh: string;
  // TTL the controller should pin the refresh cookie's maxAge to. Driven by
  // `rememberMe` at login time and preserved across rotations.
  refreshTtlMs: number;
  user: AuthUserView;
}

export interface SessionView {
  id: string;
  deviceName: string | null;
  deviceType: string;
  ipAddress: string | null;
  lastUsedAt: Date | null;
  issuedAt: Date;
  current: boolean;
}

const INVALID_CREDENTIALS = 'Invalid credentials';

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly tokens: TokenService,
    private readonly rateLimit: RateLimitService,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(LoginAttempt)
    private readonly attempts: Repository<LoginAttempt>,
  ) {}

  async login(dto: LoginDto, ctx: RequestContext): Promise<AuthResult> {
    const verdict = await this.rateLimit.check(dto.email, ctx.ip);
    if (verdict !== 'ok') {
      await this.recordAttempt({ email: dto.email, status: verdict, ctx });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const user = await this.findUserForLogin(dto.email);
    if (!user) {
      await this.recordAttempt({
        email: dto.email,
        status: 'user_not_found',
        ctx,
      });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    if (user.status !== 'active') {
      await this.recordAttempt({
        email: dto.email,
        status: 'account_inactive',
        userId: user.id,
        schoolId: user.schoolId,
        ctx,
      });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    if (!(await bcrypt.compare(dto.password, user.password))) {
      await this.recordAttempt({
        email: dto.email,
        status: 'wrong_password',
        userId: user.id,
        schoolId: user.schoolId,
        ctx,
      });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const accessToken = await this.tokens.signAccessToken({
      sub: user.id,
      school_id: user.schoolId,
      tv: user.tokenVersion,
    });
    const ttlMs = this.tokens.pickRefreshTtl(dto.rememberMe ?? false);
    const refresh = await this.tokens.issueRefreshToken(user.id, ctx, ttlMs);

    await this.recordAttempt({
      email: dto.email,
      status: 'success',
      userId: user.id,
      schoolId: user.schoolId,
      refreshTokenId: refresh.row.id,
      ctx,
    });
    await this.users.update(user.id, { lastLoginAt: new Date() });

    return {
      accessToken,
      rawRefresh: refresh.raw,
      refreshTtlMs: ttlMs,
      user: this.toAuthUserView(user),
    };
  }

  async refresh(rawRefresh: string, ctx: RequestContext): Promise<AuthResult> {
    const rotation = await this.tokens.rotateRefreshToken(rawRefresh, ctx);

    const user = await this.users.findOne({
      where: { id: rotation.row.userId },
      relations: { userRoles: { role: true } },
    });
    if (!user || user.status !== 'active') {
      await this.tokens.revokeOne(rotation.raw, 'admin_action');
      throw new UnauthorizedException();
    }

    const accessToken = await this.tokens.signAccessToken({
      sub: user.id,
      school_id: user.schoolId,
      tv: user.tokenVersion,
    });

    return {
      accessToken,
      rawRefresh: rotation.raw,
      refreshTtlMs: rotation.ttlMs,
      user: this.toAuthUserView(user),
    };
  }

  async logout(rawRefresh: string | undefined): Promise<void> {
    if (!rawRefresh) return;
    await this.tokens.revokeOne(rawRefresh, 'logout');
  }

  async logoutAll(userId: number): Promise<void> {
    await this.tokens.revokeAllForUser(userId, 'logout');
  }

  async listSessions(
    userId: number,
    currentRefreshHash: string | null,
  ): Promise<SessionView[]> {
    const rows = await this.tokens.listActiveForUser(userId);
    return rows.map((r) => ({
      id: r.id,
      deviceName: r.deviceName,
      deviceType: r.deviceType,
      ipAddress: r.ipAddress,
      lastUsedAt: r.lastUsedAt,
      issuedAt: r.issuedAt,
      current: r.tokenHash === currentRefreshHash,
    }));
  }

  async revokeSession(userId: number, sessionId: string): Promise<void> {
    const ok = await this.tokens.revokeById(sessionId, userId, 'logout');
    if (!ok) throw new NotFoundException();
  }

  private async findUserForLogin(email: string): Promise<User | null> {
    return this.users.findOne({
      where: { email, schoolId: this.defaultSchoolId() },
      relations: { userRoles: { role: true } },
    });
  }

  private defaultSchoolId(): number {
    return this.config.getOrThrow<number>('DEFAULT_SCHOOL_ID');
  }

  private toAuthUserView(user: User): AuthUserView {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      roles: (user.userRoles ?? []).map((ur) => ur.role.slug),
    };
  }

  private async recordAttempt(input: {
    email: string;
    status: LoginAttemptStatus;
    userId?: number;
    schoolId?: number;
    refreshTokenId?: string;
    ctx: RequestContext;
  }): Promise<void> {
    await this.attempts.insert({
      email: input.email,
      status: input.status,
      userId: input.userId ?? null,
      schoolId: input.schoolId ?? null,
      ipAddress: input.ctx.ip,
      userAgent: input.ctx.userAgent,
      deviceType: input.ctx.deviceType,
      refreshTokenId: input.refreshTokenId ?? null,
    });
  }
}
