import {
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { ThrottledException } from '../../../common/exceptions/throttled.exception';
import {
  ID_NUMBER_VALIDATOR,
  type IdNumberValidator,
} from '../../../common/validators/id-number-validator.interface';
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
  email: string | null;
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
    @Inject(ID_NUMBER_VALIDATOR)
    private readonly idValidator: IdNumberValidator,
  ) {}

  async login(dto: LoginDto, ctx: RequestContext): Promise<AuthResult> {
    // Whichever identifier the caller supplied becomes the rate-limit /
    // login_attempts key. For id_number logins it is normalized first so
    // repeated attempts collapse onto one key regardless of formatting.
    const identifier = dto.email ?? this.idValidator.normalize(dto.id_number!);

    const decision = await this.rateLimit.check(identifier, ctx.ip);
    if (decision.verdict !== 'ok') {
      await this.recordAttempt({
        email: identifier,
        status: decision.verdict,
        ctx,
      });
      // 429 rather than 401: the credentials were never examined. Safe to be
      // explicit — `check()` runs before the user lookup and sees only the
      // identifier and IP, and `user_not_found` attempts count toward the same
      // streak, so an unknown identifier throttles exactly like a real one and
      // the response reveals nothing about whether the account exists.
      throw new ThrottledException(decision.retryAfterSeconds);
    }

    const user = await this.findUserForLogin(dto);
    if (!user) {
      await this.recordAttempt({
        email: identifier,
        status: 'user_not_found',
        ctx,
      });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    if (user.status !== 'active') {
      await this.recordAttempt({
        email: identifier,
        status: 'account_inactive',
        userId: user.id,
        schoolId: user.schoolId,
        ctx,
      });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    if (!(await bcrypt.compare(dto.password, user.password))) {
      await this.recordAttempt({
        email: identifier,
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
      email: identifier,
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

  private async findUserForLogin(dto: LoginDto): Promise<User | null> {
    const where =
      dto.email !== undefined && dto.email !== ''
        ? { email: dto.email, schoolId: this.defaultSchoolId() }
        : {
            idNumber: this.idValidator.normalize(dto.id_number!),
            schoolId: this.defaultSchoolId(),
          };
    return this.users.findOne({
      where,
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
